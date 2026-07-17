import { useEffect, useMemo } from "react";
import type { Character } from "../../types/character";
import type { ClassLevel, RaceGrade } from "../../types/race";
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
import { assetPath } from "../../utils/assetPath";
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
  onClear: () => void;
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
  ownership,
  onSelect,
  onClear,
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

  const currentRaceId = selections[turnIndex];
  const currentRace = races.find((r) => r.id === currentRaceId);
  const isGoal = ownership?.kind === "goal";
  const isPinned = ownership?.kind === "hidden" && ownership.pinned === true;

  // 해제 가능 여부: 배치돼 있고 + goal 아님 + pinned 아님
  const canClear = !!currentRace && !isGoal && !isPinned;

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

  const handleClear = () => {
    onClear();
    onClose();
  };

  return (
    <div className="race-picker-backdrop" onClick={onClose}>
      <div className="race-picker" onClick={(e) => e.stopPropagation()}>
        <div className="race-picker__header">
          <div className="race-picker__title">
            {className.replace("급", "")}급 {month}월 {half === 1 ? "전반" : "후반"}
          </div>
          <button className="race-picker__close" onClick={onClose}>×</button>
        </div>

        {/* 배치 해제 버튼: 현재 슬롯에 레이스가 있고, goal/pinned 아닐 때만 노출 */}
        {currentRace && (
          <div className="race-picker__current-bar">
            <div className="race-picker__current-info">
              <span className="race-picker__current-label">현재 배치:</span>
              <span className="race-picker__current-name">{currentRace.name}</span>
            </div>
            {canClear ? (
              <button
                className="race-picker__clear-btn"
                onClick={handleClear}
                title="이 슬롯 비우기"
              >
                🗑 배치 해제
              </button>
            ) : (
              <span className="race-picker__lock-info">
                {isGoal ? "🔒 목표 레이스 (해제 불가)" : "📌 고정됨 (인자 고정 해제 필요)"}
              </span>
            )}
          </div>
        )}

        <div className="race-picker__body">
          {sortedEntries.length === 0 ? (
            <div className="race-picker__empty">개최 레이스 없음</div>
          ) : (
            <div className="race-picker__list">
              {sortedEntries.map(({ race, winrate }) => {
                const isCurrent = race.id === currentRaceId;
                return (
                  <button
                    key={race.id}
                    className={`race-option-card ${isCurrent ? "race-option-card--current" : ""}`}
                    onClick={() => onSelect(race.id)}
                  >
                    <div className="race-option-card__image">
                      {race.image ? (
                        <img src={assetPath(race.image)} alt={race.name} />
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
                );
              })}
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