import { useMemo } from "react";
import type { Character } from "../../types/character";
import type { SlotSelections, AptitudeFilter } from "../../domain/scheduler";
import { computeFactorStatuses } from "../../domain/factors";
import type { FactorDef, FactorStatus } from "../../types/factor";
import "./FactorPanel.css";

interface Props {
  character: Character | null;
  selections: SlotSelections;
  filter: AptitudeFilter;
  onFactorClick: (factor: FactorDef) => void;
  isFactorAssigned: (factorId: string) => boolean;
}

export function FactorPanel({
  character,
  selections,
  filter,
  onFactorClick,
  isFactorAssigned,
}: Props) {
  const statuses = useMemo(
    () => computeFactorStatuses(selections, character, filter),
    [selections, character, filter]
  );

  const canAssign = character !== null;

  return (
    <div className="factor-panel">
      <FactorSection
        title="별명 인자"
        statuses={statuses.nickname}
        emptyText="데이터 없음"
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        canAssign={canAssign}
      />
      <FactorSection
        title="히든 인자"
        statuses={statuses.hidden}
        emptyText="데이터 없음"
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        canAssign={canAssign}
      />
      <FactorSection
        title="G1 인자"
        statuses={statuses.g1}
        emptyText="레이스 없음"
        showOnlyRelevant
        onFactorClick={onFactorClick}
        isFactorAssigned={isFactorAssigned}
        canAssign={canAssign}
      />
    </div>
  );
}

function FactorSection({
  title,
  statuses,
  emptyText,
  showOnlyRelevant,
  onFactorClick,
  isFactorAssigned,
  canAssign,
}: {
  title: string;
  statuses: FactorStatus[];
  emptyText: string;
  showOnlyRelevant?: boolean;
  onFactorClick: (factor: FactorDef) => void;
  isFactorAssigned: (factorId: string) => boolean;
  canAssign: boolean;
}) {
  const displayed = showOnlyRelevant
    ? statuses.filter((s) => s.satisfied)
    : statuses;

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
        <div className="factor-section__empty">
          {statuses.length === 0 ? emptyText : "충족한 인자 없음"}
        </div>
      ) : (
        <ul className="factor-list">
          {displayed.map((s) => (
            <FactorItem
              key={s.factor.id}
              status={s}
              assigned={isFactorAssigned(s.factor.id)}
              onClick={() => onFactorClick(s.factor)}
              canAssign={canAssign}
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
  onClick,
  canAssign,
}: {
  status: FactorStatus;
  assigned: boolean;
  onClick: () => void;
  canAssign: boolean;
}) {
  const { factor, satisfied, detail, progress } = status;

  // G1 인자는 클릭 시 자동 배치가 딱히 의미 없어서 비활성화
  const isClickable = canAssign && factor.category !== "g1";

  return (
    <li
      className={[
        "factor-item",
        satisfied ? "factor-item--satisfied" : "",
        assigned ? "factor-item--assigned" : "",
        isClickable ? "factor-item--clickable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={
        isClickable
          ? assigned
            ? "클릭해서 자동 배치 취소"
            : `클릭해서 자동 배치: ${factor.description}`
          : factor.description
      }
      onClick={isClickable ? onClick : undefined}
    >
      <span className="factor-item__name">
        {assigned && <span className="factor-item__pin">📌</span>}
        {factor.name}
      </span>
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
    </li>
  );
}