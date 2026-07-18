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

const FACTOR_NAME_BY_ID: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const f of factors.nickname) map.set(f.id, f.name);
  for (const f of factors.hidden) map.set(f.id, f.name);
  for (const f of getG1Factors()) map.set(f.id, f.name);
  return map;
})();

const LONG_PRESS_MS = 1000;

interface Props {
  character: Character | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
  onSelectRace: (turnIndex: number, raceId: string, pinned?: boolean) => void;
  onClearSlot: (turnIndex: number) => void;
  onToggleSlotPin: (turnIndex: number) => void;
  isSlotPinnedAt: (turnIndex: number) => boolean;
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
  onToggleSlotPin,
  isSlotPinnedAt,
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
              isSlotPinnedAt={isSlotPinnedAt}
              onOpenPicker={openPicker}
              onClearSlot={onClearSlot}
              onToggleSlotPin={onToggleSlotPin}
            />
          ))}
        </div>
      ) : (
        <ClassGrid
          className={activeView}
          effective={effective}
          selections={selections}
          ownerships={ownerships}
          isSlotPinnedAt={isSlotPinnedAt}
          onOpenPicker={openPicker}
          onClearSlot={onClearSlot}
          onToggleSlotPin={onToggleSlotPin}
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
          isSlotPinnedAt={isSlotPinnedAt}
          onSelect={(raceId, pinned) => {
            onSelectRace(pickerSlot.turnIndex, raceId, pinned);
            setPickerSlot(null);
          }}
          onClear={() => onClearSlot(pickerSlot.turnIndex)}
          onTogglePin={() => onToggleSlotPin(pickerSlot.turnIndex)}
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
  isSlotPinnedAt: (turnIndex: number) => boolean;
  onOpenPicker: (
    turnIndex: number,
    className: ClassLevel,
    month: number,
    half: 1 | 2
  ) => void;
  onClearSlot: (turnIndex: number) => void;
  onToggleSlotPin: (turnIndex: number) => void;
}

function ClassSection({
  className,
  effective,
  selections,
  ownerships,
  isSlotPinnedAt,
  onOpenPicker,
  onClearSlot,
  onToggleSlotPin,
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
        isSlotPinnedAt={isSlotPinnedAt}
        onOpenPicker={onOpenPicker}
        onClearSlot={onClearSlot}
        onToggleSlotPin={onToggleSlotPin}
      />
    </section>
  );
}

// ─── 학년 그리드 ───────────

interface ClassGridProps {
  className: ClassLevel;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
  isSlotPinnedAt: (turnIndex: number) => boolean;
  onOpenPicker: (
    turnIndex: number,
    className: ClassLevel,
    month: number,
    half: 1 | 2
  ) => void;
  onClearSlot: (turnIndex: number) => void;
  onToggleSlotPin: (turnIndex: number) => void;
}

function ClassGrid({
  className,
  effective,
  selections,
  ownerships,
  isSlotPinnedAt,
  onOpenPicker,
  onClearSlot,
  onToggleSlotPin,
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
            isPinned={isSlotPinnedAt(slot.turnIndex)}
            onOpenPicker={() =>
              onOpenPicker(slot.turnIndex, className, slot.month, slot.half)
            }
            onClearSlot={onClearSlot}
            onTogglePin={() => onToggleSlotPin(slot.turnIndex)}
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
  isPinned: boolean;
  onOpenPicker: () => void;
  onClearSlot: (turnIndex: number) => void;
  onTogglePin: () => void;
}

function SlotCell({
  slot,
  effective,
  selections,
  ownership,
  selectedRaceId,
  isPinned,
  onOpenPicker,
  onClearSlot,
  onTogglePin,
}: SlotCellProps) {
  const selectedRace = slot.races.find((r) => r.id === selectedRaceId);
  const isGoal = ownership?.kind === "goal";
  const badge = getSlotBadge(ownership, isPinned);
  const cellClassName = getSlotClassName(ownership, !!selectedRace, isPinned);

  const winrate =
    selectedRace && !isGoal && effective
      ? computeRaceWinrate(
          selectedRace,
          effective,
          countConsecutive(selections, slot.turnIndex)
        )
      : null;

  const tooltipInfo = selectedRace
    ? getSlotTooltip(selectedRace, ownership, isPinned)
    : null;
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const cellRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

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

  const startLongPress = () => {
    if (!selectedRace) return;
    if (isGoal) return;
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      onTogglePin();
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
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
          isPinned={isPinned}
          winrate={winrate}
          onClick={() => {
            if (longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            onOpenPicker();
          }}
          onClear={() => onClearSlot(slot.turnIndex)}
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
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
  isPinned,
  winrate,
  onClick,
  onClear,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  race: Race;
  badge: { label: string; className: string } | null;
  isGoal: boolean;
  isPinned: boolean;
  winrate: number | null;
  onClick: () => void;
  onClear: () => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
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
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
    >
      {/* 우상단: pin mark → badge 순서로 배치 */}
      <div className="filled-slot__top-right">
        {isPinned && <span className="filled-slot__pin-mark">📌</span>}
        {badge && (
          <span className={`filled-slot__badge ${badge.className}`}>{badge.label}</span>
        )}
      </div>

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

function getSlotTooltip(
  race: Race,
  ownership: SlotOwnership | undefined,
  isPinned: boolean
): { primary: string; secondary: string } | null {
  if (!ownership) return null;

  const pinSuffix = isPinned ? " · 📌 고정됨" : "";

  switch (ownership.kind) {
    case "goal":
      return { primary: race.name, secondary: "목표 레이스 (자동 잠금)" };
    case "hidden": {
      const factorName =
        FACTOR_NAME_BY_ID.get(ownership.factorId) ?? ownership.factorId;
      return {
        primary: race.name,
        secondary: `히든 인자 · ${factorName}${pinSuffix}`,
      };
    }
    case "g1":
      return { primary: race.name, secondary: `G1 자동 배치${pinSuffix}` };
    case "filler":
      return { primary: race.name, secondary: `빈 슬롯 자동 채움${pinSuffix}` };
    case "manual":
      return isPinned
        ? { primary: race.name, secondary: "📌 고정됨" }
        : { primary: race.name, secondary: "수동 배치" };
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
  ownership: SlotOwnership | undefined,
  _isPinned: boolean
): { label: string; className: string } | null {
  if (!ownership) return null;
  if (ownership.kind === "goal") return { label: "목표", className: "badge--goal" };
  if (ownership.kind === "hidden") return { label: "인자", className: "badge--hidden" };
  if (ownership.kind === "g1") return { label: "G1", className: "badge--g1auto" };
  if (ownership.kind === "filler") return { label: "채움", className: "badge--filler" };
  // manual 은 배지 없음. pin mark 로 대체.
  return null;
}

function getSlotClassName(
  ownership: SlotOwnership | undefined,
  hasRace: boolean,
  isPinned: boolean
): string {
  const classes = ["slot-cell"];
  if (hasRace) classes.push("slot-cell--filled");
  if (ownership?.kind === "goal") classes.push("slot-cell--goal");
  else if (ownership?.kind === "hidden") classes.push("slot-cell--hidden-factor");
  else if (ownership?.kind === "g1") classes.push("slot-cell--g1-auto");
  else if (ownership?.kind === "filler") classes.push("slot-cell--filler");
  if (isPinned) classes.push("slot-cell--pinned");
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