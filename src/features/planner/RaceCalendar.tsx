import { useState, useMemo } from "react";
import type { Character } from "../../types/character";
import type { Race, ClassLevel } from "../../types/race";
import type { AptitudeFilter, SlotSelections } from "../../domain/scheduler";
import {
  effectiveAptitudes,
  computeRaceWinrate,
  countConsecutive,
} from "../../domain/scheduler";
import { getSlotsForClass } from "../../domain/calendar";
import "./RaceCalendar.css";

const CLASSES: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

interface Props {
  character: Character | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  onSelectRace: (turnIndex: number, raceId: string) => void;
  onClearSlot: (turnIndex: number) => void;
}

export function RaceCalendar({
  character,
  filter,
  selections,
  onSelectRace,
  onClearSlot,
}: Props) {
  const [activeClass, setActiveClass] = useState<ClassLevel>("클래식급");

  // 캐릭터의 목표 레이스 이름들 (자동 잠금용)
  const goalRaceNames = useMemo(() => {
    if (!character) return new Set<string>();
    return new Set(
      character.trainingGoals
        .map((g) => g.raceName)
        .filter((n): n is string => n !== null)
    );
  }, [character]);

  // 실효 적성 계산 (필터 반영)
  const effective = useMemo(() => {
    if (!character) return null;
    return effectiveAptitudes(character.aptitudes, filter);
  }, [character, filter]);

  const slots = getSlotsForClass(activeClass);

  return (
    <div className="race-calendar">
      <div className="race-calendar__tabs">
        {CLASSES.map((cls) => (
          <button
            key={cls}
            className={`class-tab ${activeClass === cls ? "class-tab--active" : ""}`}
            onClick={() => setActiveClass(cls)}
          >
            {cls.replace("급", "")}
          </button>
        ))}
      </div>

      <div className="race-calendar__grid">
        {slots.map((slot) => {
          const selectedRaceId = selections[slot.turnIndex];
          return (
            <SlotCell
              key={slot.turnIndex}
              slot={slot}
              character={character}
              effective={effective}
              filter={filter}
              selections={selections}
              selectedRaceId={selectedRaceId}
              goalRaceNames={goalRaceNames}
              onSelectRace={onSelectRace}
              onClearSlot={onClearSlot}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── 슬롯 셀 ─────────────────────────────

interface SlotCellProps {
  slot: ReturnType<typeof getSlotsForClass>[number];
  character: Character | null;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  selectedRaceId: string | undefined;
  goalRaceNames: Set<string>;
  onSelectRace: (turnIndex: number, raceId: string) => void;
  onClearSlot: (turnIndex: number) => void;
}

function SlotCell({
  slot,
  character,
  effective,
  filter,
  selections,
  selectedRaceId,
  goalRaceNames,
  onSelectRace,
  onClearSlot,
}: SlotCellProps) {
  const availableRaces = filterRacesByFilter(slot.races, filter);
  const selectedRace = slot.races.find((r) => r.id === selectedRaceId);

  // 목표 레이스가 이 슬롯에 있으면 자동 잠금
  const goalRaceInSlot = slot.races.find((r) => goalRaceNames.has(r.name));
  const isGoalLocked = goalRaceInSlot !== undefined;
  const displayRace = selectedRace ?? goalRaceInSlot;

  return (
    <div className={`slot-cell ${displayRace ? "slot-cell--filled" : ""}`}>
      <div className="slot-cell__header">
        {slot.month}월 {slot.half === 1 ? "전반" : "후반"}
      </div>

      {displayRace ? (
        <SelectedRaceView
          race={displayRace}
          isLocked={isGoalLocked}
          character={character}
          effective={effective}
          selections={selections}
          turnIndex={slot.turnIndex}
          onClear={() => onClearSlot(slot.turnIndex)}
        />
      ) : availableRaces.length > 0 ? (
        <AvailableRacesList
          races={availableRaces}
          character={character}
          effective={effective}
          selections={selections}
          turnIndex={slot.turnIndex}
          onSelect={(raceId) => onSelectRace(slot.turnIndex, raceId)}
        />
      ) : slot.races.length > 0 ? (
        <div className="slot-cell__hidden">
          필터에 맞는 레이스 없음 ({slot.races.length}개 숨김)
        </div>
      ) : (
        <div className="slot-cell__empty">-</div>
      )}
    </div>
  );
}

// ─── 선택된 레이스 표시 ─────────────────

function SelectedRaceView({
  race,
  isLocked,
  effective,
  selections,
  turnIndex,
  onClear,
}: {
  race: Race;
  isLocked: boolean;
  character: Character | null;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  turnIndex: number;
  onClear: () => void;
}) {
  const winrate = effective
    ? computeRaceWinrate(
        race,
        effective,
        countConsecutive({ ...selections, [turnIndex]: race.id }, turnIndex)
      )
    : null;

  return (
    <div className="selected-race">
      {isLocked && <div className="selected-race__lock-badge">목표</div>}
      <div className={`grade-badge grade-badge--${race.grade.toLowerCase().replace("-", "")}`}>
        {race.grade}
      </div>
      <div className="selected-race__name">{race.name}</div>
      <div className="selected-race__info">
        {race.venue} · {race.surface} · {race.distance}m
      </div>
      {winrate !== null && (
        <div className={`selected-race__winrate ${winrateClass(winrate)}`}>
          {winrate}%
        </div>
      )}
      {!isLocked && (
        <button className="selected-race__clear" onClick={onClear}>
          ×
        </button>
      )}
    </div>
  );
}

// ─── 사용 가능한 레이스 리스트 ─────────────

function AvailableRacesList({
  races,
  effective,
  selections,
  turnIndex,
  onSelect,
}: {
  races: Race[];
  character: Character | null;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  turnIndex: number;
  onSelect: (raceId: string) => void;
}) {
  return (
    <div className="available-races">
      {races.map((race) => {
        const winrate = effective
          ? computeRaceWinrate(
              race,
              effective,
              countConsecutive({ ...selections, [turnIndex]: race.id }, turnIndex)
            )
          : null;
        return (
          <button
            key={race.id}
            className="race-option"
            onClick={() => onSelect(race.id)}
            title={`${race.venue} · ${race.surface} · ${race.distance}m`}
          >
            <span className={`grade-badge grade-badge--${race.grade.toLowerCase().replace("-", "")}`}>
              {race.grade}
            </span>
            <span className="race-option__name">{race.name}</span>
            {winrate !== null && (
              <span className={`race-option__winrate ${winrateClass(winrate)}`}>
                {winrate}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 유틸 ─────────────────────────────

function filterRacesByFilter(races: Race[], filter: AptitudeFilter): Race[] {
  return races.filter((race) => {
    // 잔디/더트 축
    if (race.surface === "잔디" && !filter.turf) return false;
    if (race.surface === "더트" && !filter.dirt) return false;

    // 거리 축
    switch (race.distanceCategory) {
      case "단거리": if (!filter.sprint) return false; break;
      case "마일":   if (!filter.mile) return false; break;
      case "중거리": if (!filter.medium) return false; break;
      case "장거리": if (!filter.long) return false; break;
    }

    return true;
  });
}

function winrateClass(winrate: number): string {
  if (winrate >= 100) return "winrate--good";
  if (winrate >= 80) return "winrate--ok";
  return "winrate--bad";
}