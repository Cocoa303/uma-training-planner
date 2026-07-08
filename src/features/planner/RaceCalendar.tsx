import { useState, useMemo } from "react";
import type { Character } from "../../types/character";
import type { Race, ClassLevel } from "../../types/race";
import type {
  AptitudeFilter,
  SlotSelections,
  SlotOwnerships,
  SlotOwnership,
} from "../../domain/scheduler";
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
  ownerships: SlotOwnerships;
  onSelectRace: (turnIndex: number, raceId: string) => void;
  onClearSlot: (turnIndex: number) => void;
}

export function RaceCalendar({
  character,
  filter,
  selections,
  ownerships,
  onSelectRace,
  onClearSlot,
}: Props) {
  const [activeClass, setActiveClass] = useState<ClassLevel>("클래식급");

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
              effective={effective}
              filter={filter}
              selections={selections}
              ownership={ownerships[slot.turnIndex]}
              selectedRaceId={selectedRaceId}
              onSelectRace={onSelectRace}
              onClearSlot={onClearSlot}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SlotCellProps {
  slot: ReturnType<typeof getSlotsForClass>[number];
  effective: ReturnType<typeof effectiveAptitudes> | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  ownership: SlotOwnership | undefined;
  selectedRaceId: string | undefined;
  onSelectRace: (turnIndex: number, raceId: string) => void;
  onClearSlot: (turnIndex: number) => void;
}

function SlotCell({
  slot,
  effective,
  filter,
  selections,
  ownership,
  selectedRaceId,
  onSelectRace,
  onClearSlot,
}: SlotCellProps) {
  const availableRaces = filterRacesByFilter(slot.races, filter);
  const selectedRace = slot.races.find((r) => r.id === selectedRaceId);

  const isGoal = ownership?.kind === "goal";
  const badge = getSlotBadge(ownership);
  const cellClassName = getSlotClassName(ownership, !!selectedRace);

  return (
    <div className={cellClassName}>
      <div className="slot-cell__header">
        {slot.month}월 {slot.half === 1 ? "전반" : "후반"}
      </div>

      {selectedRace ? (
        <SelectedRaceView
          race={selectedRace}
          badge={badge}
          isGoal={isGoal}
          effective={effective}
          selections={selections}
          turnIndex={slot.turnIndex}
          onClear={() => onClearSlot(slot.turnIndex)}
        />
      ) : availableRaces.length > 0 ? (
        <AvailableRacesList
          races={availableRaces}
          effective={effective}
          selections={selections}
          turnIndex={slot.turnIndex}
          onSelect={(raceId) => onSelectRace(slot.turnIndex, raceId)}
        />
      ) : slot.races.length > 0 ? (
        <div className="slot-cell__hidden">
          필터 밖 ({slot.races.length}개 숨김)
        </div>
      ) : (
        <div className="slot-cell__empty">-</div>
      )}
    </div>
  );
}

function getSlotBadge(
  ownership: SlotOwnership | undefined
): { label: string; className: string } | null {
  if (!ownership) return null;
  if (ownership.kind === "goal") return { label: "목표", className: "badge--goal" };
  if (ownership.kind === "hidden") return { label: "인자", className: "badge--hidden" };
  if (ownership.kind === "g1") return { label: "G1", className: "badge--g1auto" };
  return null;
}

function getSlotClassName(
  ownership: SlotOwnership | undefined,
  hasRace: boolean
): string {
  const classes = ["slot-cell"];
  if (hasRace) classes.push("slot-cell--filled");
  if (ownership?.kind === "goal") classes.push("slot-cell--goal");
  else if (ownership?.kind === "hidden") classes.push("slot-cell--hidden-factor");
  else if (ownership?.kind === "g1") classes.push("slot-cell--g1-auto");
  return classes.join(" ");
}

function SelectedRaceView({
  race,
  badge,
  isGoal,
  effective,
  selections,
  turnIndex,
  onClear,
}: {
  race: Race;
  badge: { label: string; className: string } | null;
  isGoal: boolean;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  turnIndex: number;
  onClear: () => void;
}) {
  // 목표 레이스는 승률 계산/표시 안 함
  const winrate = isGoal
    ? null
    : effective
      ? computeRaceWinrate(
          race,
          effective,
          countConsecutive({ ...selections, [turnIndex]: race.id }, turnIndex)
        )
      : null;

  return (
    <div className="selected-race">
      {badge && (
        <div className={`selected-race__lock-badge ${badge.className}`}>
          {badge.label}
        </div>
      )}
      <div
        className={`grade-badge grade-badge--${race.grade
          .toLowerCase()
          .replace("-", "")}`}
      >
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
      {!isGoal && (
        <button className="selected-race__clear" onClick={onClear}>
          ×
        </button>
      )}
    </div>
  );
}

function AvailableRacesList({
  races,
  effective,
  selections,
  turnIndex,
  onSelect,
}: {
  races: Race[];
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
            <span
              className={`grade-badge grade-badge--${race.grade
                .toLowerCase()
                .replace("-", "")}`}
            >
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

function filterRacesByFilter(races: Race[], filter: AptitudeFilter): Race[] {
  return races.filter((race) => {
    if (race.surface === "잔디" && !filter.turf) return false;
    if (race.surface === "더트" && !filter.dirt) return false;

    switch (race.distanceCategory) {
      case "단거리":
        if (!filter.sprint) return false;
        break;
      case "마일":
        if (!filter.mile) return false;
        break;
      case "중거리":
        if (!filter.medium) return false;
        break;
      case "장거리":
        if (!filter.long) return false;
        break;
    }

    return true;
  });
}

function winrateClass(winrate: number): string {
  if (winrate >= 100) return "winrate--good";
  if (winrate >= 80) return "winrate--ok";
  return "winrate--bad";
}