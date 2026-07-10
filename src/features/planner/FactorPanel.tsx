import { useMemo, useState, useRef, useEffect } from "react";
import type { Character } from "../../types/character";
import type { SlotSelections, AptitudeFilter } from "../../domain/scheduler";
import { computeFactorStatuses } from "../../domain/factors";
import type { FactorDef, FactorStatus } from "../../types/factor";
import { useFactorFeasibility, type FactorFeasibility } from "./useFactorFeasibility";
import "./FactorPanel.css";

interface Props {
  character: Character | null;
  selections: SlotSelections;
  filter: AptitudeFilter;
  onFactorClick: (factor: FactorDef) => void;
  isFactorAssigned: (factorId: string) => boolean;
  isFactorPinned: (factorId: string) => boolean;
  onPinToggle: (factorId: string) => void;
  minWinrate: number;
  plannerState: import("../../domain/scheduler").PlannerState;
}

export function FactorPanel({
  character,
  selections,
  filter,
  onFactorClick,
  isFactorAssigned,
  isFactorPinned,
  onPinToggle,
  minWinrate,
  plannerState,
}: Props) {
  const statuses = useMemo(
    () => computeFactorStatuses(selections, character, filter),
    [selections, character, filter]
  );

  const allFactors = useMemo(() => {
    const arr: FactorDef[] = [];
    for (const s of statuses.nickname) arr.push(s.factor);
    for (const s of statuses.hidden) arr.push(s.factor);
    for (const s of statuses.g1) arr.push(s.factor);
    return arr;
  }, [statuses]);

  const feasibility = useFactorFeasibility(
    allFactors,
    plannerState,
    character,
    minWinrate
  );

  return (
    <div className="factor-panel">
      <FactorSection
        title="별명 인자"
        statuses={statuses.nickname}
        emptyText="데이터 없음"
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        isFactorPinned={isFactorPinned}
        onPinToggle={onPinToggle}
        feasibility={feasibility}
      />
      <FactorSection
        title="히든 인자"
        statuses={statuses.hidden}
        emptyText="데이터 없음"
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        isFactorPinned={isFactorPinned}
        onPinToggle={onPinToggle}
        feasibility={feasibility}
      />
      <FactorSection
        title="G1 인자"
        statuses={statuses.g1}
        emptyText="레이스 없음"
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        isFactorPinned={isFactorPinned}
        onPinToggle={onPinToggle}
        feasibility={feasibility}
        sortG1
      />
    </div>
  );
}

function FactorSection({
  title,
  statuses,
  emptyText,
  onFactorClick,
  isFactorAssigned,
  isFactorPinned,
  onPinToggle,
  feasibility,
  sortG1,
}: {
  title: string;
  statuses: FactorStatus[];
  emptyText: string;
  onFactorClick: (factor: FactorDef) => void;
  isFactorAssigned: (factorId: string) => boolean;
  isFactorPinned: (factorId: string) => boolean;
  onPinToggle: (factorId: string) => void;
  feasibility: Map<string, FactorFeasibility>;
  sortG1?: boolean;
}) {
  const displayed = useMemo(() => {
    if (!sortG1) return statuses;

    const withMeta = statuses.map((s) => {
      const feas = feasibility.get(s.factor.id);
      const canAssign = feas?.canAssign ?? true;
      const priority = s.satisfied ? 0 : canAssign ? 1 : 2;
      return { status: s, priority };
    });

    withMeta.sort((a, b) => a.priority - b.priority);
    return withMeta.map((x) => x.status);
  }, [statuses, feasibility, sortG1]);

  const satisfiedCount = statuses.filter((s) => s.satisfied).length;

  return (
    <div className="factor-section">
      <div className="factor-section__header">
        <span className="factor-section__title">{title}</span>
        {statuses.length > 0 && (
          <span className="factor-section__count">
            {satisfiedCount}/{statuses.length}
          </span>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="factor-section__empty">{emptyText}</div>
      ) : (
        <ul className="factor-list">
          {displayed.map((s) => (
            <FactorItem
              key={s.factor.id}
              status={s}
              assigned={isFactorAssigned(s.factor.id)}
              pinned={isFactorPinned(s.factor.id)}
              onClick={() => onFactorClick(s.factor)}
              onPinToggle={() => onPinToggle(s.factor.id)}
              feasibility={feasibility.get(s.factor.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FactorItem({
  status,
  assigned,
  pinned,
  onClick,
  onPinToggle,
  feasibility,
}: {
  status: FactorStatus;
  assigned: boolean;
  pinned: boolean;
  onClick: () => void;
  onPinToggle: () => void;
  feasibility: FactorFeasibility | undefined;
}) {
  const { factor, satisfied, detail, progress } = status;

  const canAssign = feasibility?.canAssign ?? true;
  const isClickable = assigned || (canAssign && !satisfied);
  const isGrayed = !canAssign && !assigned && !satisfied;

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const itemRef = useRef<HTMLLIElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const showTooltip = () => {
    if (!itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    setTooltipPos({
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const handleMouseEnter = () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      showTooltip();
    }, 400);
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
    <li
      ref={itemRef}
      className={[
        "factor-item",
        satisfied ? "factor-item--satisfied" : "",
        assigned ? "factor-item--assigned" : "",
        pinned ? "factor-item--pinned" : "",
        isClickable ? "factor-item--clickable" : "",
        isGrayed ? "factor-item--grayed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={isClickable ? onClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="factor-item__name">{factor.name}</span>

      {assigned && (
        <button
          className={`factor-item__pin-btn ${pinned ? "factor-item__pin-btn--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onPinToggle();
          }}
          title={pinned ? "고정 해제" : "고정 (최적화 시 유지)"}
        >
          📌
        </button>
      )}

      <span className="factor-item__status">
        {satisfied ? "✓" : detail ?? "미충족"}
      </span>
      {progress && !satisfied && progress.total > 1 && (
        <div className="factor-item__progress-bar">
          <div
            className="factor-item__progress-fill"
            style={{
              width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
            }}
          />
        </div>
      )}

      {tooltipPos && (
        <FactorTooltip
          x={tooltipPos.x}
          y={tooltipPos.y}
          factor={factor}
          feasibility={feasibility}
          satisfied={satisfied}
          assigned={assigned}
          pinned={pinned}
        />
      )}
    </li>
  );
}

function FactorTooltip({
  x,
  y,
  factor,
  feasibility,
  satisfied,
  assigned,
  pinned,
}: {
  x: number;
  y: number;
  factor: FactorDef;
  feasibility: FactorFeasibility | undefined;
  satisfied: boolean;
  assigned: boolean;
  pinned: boolean;
}) {
  let summary: string;
  if (pinned) {
    summary = "📌 고정됨 (최적화 시 유지). 📌를 클릭해 해제하세요.";
  } else if (assigned) {
    summary = "클릭해서 자동 배치 취소 / 📌로 고정 가능";
  } else if (satisfied) {
    summary = "이미 조건 만족됨";
  } else if (feasibility && !feasibility.canAssign) {
    summary = `배치 불가: ${feasibility.summary ?? "이유 불명"}`;
  } else if (feasibility?.canAssign) {
    summary = "클릭해서 자동 배치";
  } else {
    summary = "계산 중…";
  }

  const details = feasibility?.details;

  const maxWidth = 400;
  const adjustedX = Math.min(x, window.innerWidth - maxWidth - 12);
  const estimatedHeight = 200;
  const adjustedY =
    y + estimatedHeight > window.innerHeight
      ? Math.max(12, window.innerHeight - estimatedHeight - 12)
      : y;

  return (
    <div
      className="factor-tooltip"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
      }}
    >
      <div className="factor-tooltip__summary">{summary}</div>
      {factor.description && (
        <div className="factor-tooltip__desc">{factor.description}</div>
      )}
      {details && details.length > 0 && (
        <div className="factor-tooltip__details">
          {details.slice(0, 8).map((d, i) => (
            <div key={i} className="factor-tooltip__detail-line">
              {d}
            </div>
          ))}
          {details.length > 8 && (
            <div className="factor-tooltip__detail-more">
              …외 {details.length - 8}줄
            </div>
          )}
        </div>
      )}
    </div>
  );
}