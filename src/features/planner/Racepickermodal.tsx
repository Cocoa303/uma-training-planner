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
  isSlotPinnedAt: (turnIndex: number) => boolean;
  onSelect: (raceId: string, pinned?: boolean) => void;
  onClear: () => void;
  onTogglePin: () => void;
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
  isSlotPinnedAt,
  onSelect,
  onClear,
  onTogglePin,
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
  const isCurrentPinned = isSlotPinnedAt(turnIndex);

  const canClear = !!currentRace && !isGoal && !isCurrentPinned;
  const canTogglePin = !!currentRace && !isGoal;

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

  const handleTogglePin = () => {
    onTogglePin();
    // 모달은 닫지 않음. 유저가 pin 상태를 확인 가능하도록.
  };

  const handleSelectRace = (raceId: string) => {
    // 기본 선택은 pinned=false. pinned 상태는 다른 레이스 선택 시 해제됨.
    onSelect(raceId, false);
  };

  const handlePinRace = (raceId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  // 이미 이 레이스가 배치돼 있고 pinned 상태면 → 고정 해제 (모달 유지)
  if (raceId === currentRaceId && isCurrentPinned) {
    onTogglePin();
    return;
  }
  // 그 외: 이 레이스로 배치하면서 즉시 pinned=true 로 걸기
  onSelect(raceId, true);
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

        {/* 현재 배치 정보 + 액션 버튼 */}
        {currentRace && (
          <div className="race-picker__current-bar">
            <div className="race-picker__current-info">
              <span className="race-picker__current-label">현재 배치:</span>
              <span className="race-picker__current-name">
                {isCurrentPinned && "📌 "}
                {currentRace.name}
              </span>
            </div>
            <div className="race-picker__current-actions">
              {canTogglePin && (
                <button
                  className={`race-picker__pin-btn ${isCurrentPinned ? "race-picker__pin-btn--on" : ""}`}
                  onClick={handleTogglePin}
                  title={isCurrentPinned ? "고정 해제" : "고정 (최적화 시 유지)"}
                >
                  📌 {isCurrentPinned ? "고정 해제" : "고정"}
                </button>
              )}
              {canClear ? (
                <button
                  className="race-picker__clear-btn"
                  onClick={handleClear}
                  title="이 슬롯 비우기"
                >
                  🗑 배치 해제
                </button>
              ) : (
                !canTogglePin && (
                  <span className="race-picker__lock-info">
                    🔒 목표 레이스 (해제 불가)
                  </span>
                )
              )}
            </div>
          </div>
        )}

        <div className="race-picker__body">
          {sortedEntries.length === 0 ? (
            <div className="race-picker__empty">개최 레이스 없음</div>
          ) : (
            <div className="race-picker__list">
              {sortedEntries.map(({ race, winrate }) => {
                const isCurrent = race.id === currentRaceId;
                const isCurrentAndPinned = isCurrent && isCurrentPinned;
                return (
                  <div
                    key={race.id}
                    className={`race-option-card ${isCurrent ? "race-option-card--current" : ""} ${isCurrentAndPinned ? "race-option-card--pinned" : ""}`}
                    onClick={() => handleSelectRace(race.id)}
                    role="button"
                    tabIndex={0}
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

                    {/* 우측 pin 버튼: 이 레이스로 배치하면서 즉시 고정 */}
                    {!isGoal && (
                      <button
                        className={`race-option-card__pin-btn ${isCurrentAndPinned ? "race-option-card__pin-btn--on" : ""}`}
                        onClick={(e) => handlePinRace(race.id, e)}
                        title={isCurrentAndPinned ? "고정됨" : "이 레이스로 고정 배치"}
                      >
                        📌
                      </button>
                    )}
                  </div>
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