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
import { RacePickerModal } from "./Racepickermodal";
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
  const [pickerSlot, setPickerSlot] = useState<{
    turnIndex: number;
    className: ClassLevel;
    month: number;
    half: 1 | 2;
  } | null>(null);

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
              onOpenPicker={() =>
                setPickerSlot({
                  turnIndex: slot.turnIndex,
                  className: activeClass,
                  month: slot.month,
                  half: slot.half,
                })
              }
              onClearSlot={onClearSlot}
            />
          );
        })}
      </div>

      {pickerSlot && (
        <RacePickerModal
          turnIndex={pickerSlot.turnIndex}
          className={pickerSlot.className}
          month={pickerSlot.month}
          half={pickerSlot.half}
          character={character}
          filter={filter}
          selections={selections}
          ownership={ownerships[pickerSlot.turnIndex]}
          onSelect={(raceId) => {
            onSelectRace(pickerSlot.turnIndex, raceId);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
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
  onOpenPicker: () => void;
  onClearSlot: (turnIndex: number) => void;
}

function SlotCell({
  slot,
  effective,
  selections,
  ownership,
  selectedRaceId,
  onOpenPicker,
  onClearSlot,
}: SlotCellProps) {
  const selectedRace = slot.races.find((r) => r.id === selectedRaceId);
  const isGoal = ownership?.kind === "goal";
  const badge = getSlotBadge(ownership);
  const cellClassName = getSlotClassName(ownership, !!selectedRace);

  const winrate =
    selectedRace && !isGoal && effective
      ? computeRaceWinrate(
          selectedRace,
          effective,
          countConsecutive(selections, slot.turnIndex)
        )
      : null;

  return (
    <div className={cellClassName}>
      <div className="slot-cell__header">
        {slot.month}월 {slot.half === 1 ? "전반" : "후반"}
      </div>

      {selectedRace ? (
        <FilledSlot
          race={selectedRace}
          badge={badge}
          isGoal={isGoal}
          winrate={winrate}
          onClick={onOpenPicker}
          onClear={() => onClearSlot(slot.turnIndex)}
        />
      ) : (
        <EmptySlot
          hasRacesAvailable={slot.races.length > 0}
          onClick={onOpenPicker}
        />
      )}
    </div>
  );
}

function FilledSlot({
  race,
  badge,
  isGoal,
  winrate,
  onClick,
  onClear,
}: {
  race: Race;
  badge: { label: string; className: string } | null;
  isGoal: boolean;
  winrate: number | null;
  onClick: () => void;
  onClear: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (isGoal) return;
    onClick();
    e.stopPropagation();
  };

  return (
    <div
      className={`filled-slot ${isGoal ? "filled-slot--locked" : ""}`}
      onClick={handleClick}
    >
      {badge && (
        <div className={`filled-slot__badge ${badge.className}`}>{badge.label}</div>
      )}

      <div className="filled-slot__image">
        {race.image ? (
          <img src={race.image} alt={race.name} />
        ) : (
          <div className={`filled-slot__placeholder grade-bg--${gradeClass(race.grade)}`}>
            <span className="filled-slot__placeholder-grade">{race.grade}</span>
          </div>
        )}
      </div>

      <div className="filled-slot__info">
        <span className="filled-slot__name">{race.name}</span>
        {winrate !== null && (
          <span className={`filled-slot__winrate ${winrateClass(winrate)}`}>
            {winrate}%
          </span>
        )}
      </div>

      {!isGoal && (
        <button
          className="filled-slot__clear"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="선택 해제"
        >
          ×
        </button>
      )}
    </div>
  );
}

function EmptySlot({
  hasRacesAvailable,
  onClick,
}: {
  hasRacesAvailable: boolean;
  onClick: () => void;
}) {
  if (!hasRacesAvailable) {
    return <div className="empty-slot empty-slot--none">-</div>;
  }
  return (
    <button className="empty-slot" onClick={onClick} title="레이스 선택">
      <span className="empty-slot__plus">+</span>
    </button>
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

function winrateClass(winrate: number): string {
  if (winrate >= 100) return "winrate--good";
  if (winrate >= 80) return "winrate--ok";
  return "winrate--bad";
}

function gradeClass(grade: string): string {
  return grade.toLowerCase().replace("-", "");
}