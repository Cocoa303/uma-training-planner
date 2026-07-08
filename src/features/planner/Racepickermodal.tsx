import { useEffect, useMemo } from "react";
import type { Character } from "../../types/character";
import type { Race, ClassLevel, RaceGrade } from "../../types/race";
import type {
  AptitudeFilter,
  SlotSelections,
  SlotOwnership,
} from "../../domain/scheduler";
import {
  effectiveAptitudes,
  computeRaceWinrate,
  countConsecutive,
} from "../../domain/scheduler";
import { getSlotsForClass } from "../../domain/calendar";
import "./Racepickermodal.css";

interface Props {
  turnIndex: number;
  className: ClassLevel;
  month: number;
  half: 1 | 2;
  character: Character | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  ownership: SlotOwnership | undefined;
  onSelect: (raceId: string) => void;
  onClose: () => void;
}

const GRADE_ORDER: Record<RaceGrade, number> = {
  G1: 0,
  G2: 1,
  G3: 2,
  OP: 3,
  "Pre-OP": 4,
};

export function RacePickerModal({
  turnIndex,
  className,
  month,
  half,
  character,
  filter,
  selections,
  onSelect,
  onClose,
}: Props) {
  const effective = useMemo(() => {
    if (!character) return null;
    return effectiveAptitudes(character.aptitudes, filter);
  }, [character, filter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const races = useMemo(() => {
    const slots = getSlotsForClass(className);
    const slot = slots.find((s) => s.turnIndex === turnIndex);
    return slot?.races ?? [];
  }, [turnIndex, className]);

  const sortedEntries = useMemo(() => {
    const withWinrate = races.map((race) => {
      const winrate = effective
        ? computeRaceWinrate(
            race,
            effective,
            countConsecutive({ ...selections, [turnIndex]: race.id }, turnIndex)
          )
        : null;
      return { race, winrate };
    });

    withWinrate.sort((a, b) => {
      const gradeDiff = GRADE_ORDER[a.race.grade] - GRADE_ORDER[b.race.grade];
      if (gradeDiff !== 0) return gradeDiff;
      if (a.winrate === null && b.winrate === null) return 0;
      if (a.winrate === null) return 1;
      if (b.winrate === null) return -1;
      return b.winrate - a.winrate;
    });

    return withWinrate;
  }, [races, effective, selections, turnIndex]);

  return (
    <div className="race-picker-backdrop" onClick={onClose}>
      <div className="race-picker" onClick={(e) => e.stopPropagation()}>
        <div className="race-picker__header">
          <div className="race-picker__title">
            {className.replace("급", "")}급 {month}월 {half === 1 ? "전반" : "후반"}
          </div>
          <button className="race-picker__close" onClick={onClose}>×</button>
        </div>

        <div className="race-picker__body">
          {sortedEntries.length === 0 ? (
            <div className="race-picker__empty">개최 레이스 없음</div>
          ) : (
            <div className="race-picker__list">
              {sortedEntries.map(({ race, winrate }) => (
                <button
                  key={race.id}
                  className="race-option-card"
                  onClick={() => onSelect(race.id)}
                >
                  <div className="race-option-card__image">
                    {race.image ? (
                      <img src={race.image} alt={race.name} />
                    ) : (
                      <div className={`race-option-card__placeholder grade-bg--${gradeClass(race.grade)}`}>
                        <span>{race.grade}</span>
                      </div>
                    )}
                  </div>

                  <div className="race-option-card__info">
                    <div className="race-option-card__title-row">
                      <span className={`grade-badge grade-badge--${gradeClass(race.grade)}`}>
                        {race.grade}
                      </span>
                      <span className="race-option-card__name">{race.name}</span>
                    </div>

                    <div className="race-option-card__meta">
                      {race.venue} · {race.surface} · {race.distance}m ({race.distanceCategory})
                      {race.side ? ` · ${race.side}` : ""}
                    </div>

                    {winrate !== null && (
                      <div className={`race-option-card__winrate ${winrateClass(winrate)}`}>
                        {winrate}%
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function winrateClass(winrate: number): string {
  if (winrate >= 100) return "winrate--good";
  if (winrate >= 80) return "winrate--ok";
  return "winrate--bad";
}

function gradeClass(grade: string): string {
  return grade.toLowerCase().replace("-", "");
}