import { useState, useMemo, useRef, useEffect } from "react";
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
import { getG1Factors } from "../../domain/factors";
import { RacePickerModal } from "./Racepickermodal";
import { assetPath } from "../../utils/assetPath";
import type { FactorDef } from "../../types/factor";
import factorsData from "../../../data/factors.json";
import "./RaceCalendar.css";

const CLASSES: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

export type ActiveView = ClassLevel | "all";

interface FactorsFile {
  nickname: FactorDef[];
  hidden: FactorDef[];
}
const factors = factorsData as unknown as FactorsFile;

/**
 * factor id → 표시 이름 매핑.
 * factors.json (nickname + hidden) 과 동적 생성 G1 인자를 한 번에 병합.
 * 모듈 로드 시 한 번만 계산 (races.json / factors.json 모두 정적).
 */
const FACTOR_NAME_BY_ID: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const f of factors.nickname) map.set(f.id, f.name);
  for (const f of factors.hidden) map.set(f.id, f.name);
  for (const f of getG1Factors()) map.set(f.id, f.name);
  return map;
})();

interface Props {
  character: Character | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
  onSelectRace: (turnIndex: number, raceId: string) => void;
  onClearSlot: (turnIndex: number) => void;
  /** 활성 뷰 (외부 관리) */
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
}

export function RaceCalendar({
  character,
  filter,
  selections,
  ownerships,
  onSelectRace,
  onClearSlot,
  activeView,
  onChangeView,
}: Props) {
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

  const openPicker = (
    turnIndex: number,
    className: ClassLevel,
    month: number,
    half: 1 | 2
  ) => {
    setPickerSlot({ turnIndex, className, month, half });
  };

  const isAllView = activeView === "all";

  return (
    <div className={`race-calendar ${isAllView ? "race-calendar--all" : ""}`}>
      <div className="race-calendar__tabs">
        {CLASSES.map((cls) => (
          <button
            key={cls}
            className={`class-tab ${activeView === cls ? "class-tab--active" : ""}`}
            onClick={() => onChangeView(cls)}
          >
            {cls.replace("급", "")}
          </button>
        ))}
        <button
          className={`class-tab class-tab--all ${activeView === "all" ? "class-tab--active" : ""}`}
          onClick={() => onChangeView("all")}
        >
          전체
        </button>
      </div>

      {isAllView ? (
        <div className="race-calendar__all-view">
          {CLASSES.map((cls) => (
            <ClassSection
              key={cls}
              className={cls}
              effective={effective}
              selections={selections}
              ownerships={ownerships}
              onOpenPicker={openPicker}
              onClearSlot={onClearSlot}
            />
          ))}
        </div>
      ) : (
        <ClassGrid
          className={activeView}
          effective={effective}
          selections={selections}
          ownerships={ownerships}
          onOpenPicker={openPicker}
          onClearSlot={onClearSlot}
        />
      )}

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
        onClear={() => onClearSlot(pickerSlot.turnIndex)}
        onClose={() => setPickerSlot(null)}
      />
    )}
    </div>
  );
}

// ─── 학년 섹션 (전체 뷰) ───────────

interface ClassSectionProps {
  className: ClassLevel;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
  onOpenPicker: (
    turnIndex: number,
    className: ClassLevel,
    month: number,
    half: 1 | 2
  ) => void;
  onClearSlot: (turnIndex: number) => void;
}

function ClassSection({
  className,
  effective,
  selections,
  ownerships,
  onOpenPicker,
  onClearSlot,
}: ClassSectionProps) {
  return (
    <section className="class-section">
      <div className="class-section__header">
        <span className="class-section__title">{className.replace("급", "")}</span>
      </div>
      <ClassGrid
        className={className}
        effective={effective}
        selections={selections}
        ownerships={ownerships}
        onOpenPicker={onOpenPicker}
        onClearSlot={onClearSlot}
      />
    </section>
  );
}

// ─── 학년 그리드 (공통) ───────────

interface ClassGridProps {
  className: ClassLevel;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
  onOpenPicker: (
    turnIndex: number,
    className: ClassLevel,
    month: number,
    half: 1 | 2
  ) => void;
  onClearSlot: (turnIndex: number) => void;
}

function ClassGrid({
  className,
  effective,
  selections,
  ownerships,
  onOpenPicker,
  onClearSlot,
}: ClassGridProps) {
  const slots = getSlotsForClass(className);

  return (
    <div className="race-calendar__grid">
      {slots.map((slot) => {
        const selectedRaceId = selections[slot.turnIndex];
        return (
          <SlotCell
            key={slot.turnIndex}
            slot={slot}
            effective={effective}
            selections={selections}
            ownership={ownerships[slot.turnIndex]}
            selectedRaceId={selectedRaceId}
            onOpenPicker={() =>
              onOpenPicker(slot.turnIndex, className, slot.month, slot.half)
            }
            onClearSlot={onClearSlot}
          />
        );
      })}
    </div>
  );
}

// ─── 개별 슬롯 ─────────────────────────

interface SlotCellProps {
  slot: ReturnType<typeof getSlotsForClass>[number];
  effective: ReturnType<typeof effectiveAptitudes> | null;
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

  // ─── 툴팁 상태 ─────────────────────
  const tooltipInfo = selectedRace ? getSlotTooltip(selectedRace, ownership) : null;
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const showTooltip = () => {
    if (!cellRef.current) return;
    const rect = cellRef.current.getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
  };

  const handleMouseEnter = () => {
    if (!tooltipInfo) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(showTooltip, 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltipPos(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={cellRef}
      className={cellClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
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

      {tooltipPos && tooltipInfo && (
        <SlotTooltip x={tooltipPos.x} y={tooltipPos.y} info={tooltipInfo} />
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
          <img src={assetPath(race.image)} alt={race.name} />
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

// ─── 슬롯 툴팁 ─────────────────────

/**
 * 배치된 레이스가 어떤 사유로 이 슬롯에 있는지 요약.
 * manual (사용자 직접 선택) 은 툴팁 생략.
 */
function getSlotTooltip(
  race: Race,
  ownership: SlotOwnership | undefined
): { primary: string; secondary: string } | null {
  if (!ownership) return null;

  switch (ownership.kind) {
    case "goal":
      return { primary: race.name, secondary: "목표 레이스 (자동 잠금)" };
    case "hidden": {
      const factorName =
        FACTOR_NAME_BY_ID.get(ownership.factorId) ?? ownership.factorId;
      return { primary: race.name, secondary: `히든 인자 · ${factorName}` };
    }
    case "g1":
      return { primary: race.name, secondary: "G1 자동 배치" };
    case "filler":
      return { primary: race.name, secondary: "빈 슬롯 자동 채움" };
    case "manual":
      return null;
  }
}

function SlotTooltip({
  x,
  y,
  info,
}: {
  x: number;
  y: number;
  info: { primary: string; secondary: string };
}) {
  const width = 260;
  const estHeight = 60;
  const adjX = Math.min(x, window.innerWidth - width - 12);
  const adjY =
    y + estHeight > window.innerHeight
      ? Math.max(12, window.innerHeight - estHeight - 12)
      : y;

  return (
    <div
      className="slot-tooltip"
      style={{ left: `${adjX}px`, top: `${adjY}px` }}
    >
      <div className="slot-tooltip__primary">{info.primary}</div>
      <div className="slot-tooltip__secondary">{info.secondary}</div>
    </div>
  );
}

// ─── 헬퍼 ─────────────────────────

function getSlotBadge(
  ownership: SlotOwnership | undefined
): { label: string; className: string } | null {
  if (!ownership) return null;
  if (ownership.kind === "goal") return { label: "목표", className: "badge--goal" };
  if (ownership.kind === "hidden") return { label: "인자", className: "badge--hidden" };
  if (ownership.kind === "g1") return { label: "G1", className: "badge--g1auto" };
  if (ownership.kind === "filler") return { label: "채움", className: "badge--filler" };
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
  else if (ownership?.kind === "filler") classes.push("slot-cell--filler");
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