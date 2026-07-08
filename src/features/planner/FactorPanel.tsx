import { useMemo } from "react";
import type { Character } from "../../types/character";
import type { SlotSelections, AptitudeFilter } from "../../domain/scheduler";
import { computeFactorStatuses } from "../../domain/factors";
import type { FactorStatus } from "../../types/factor";
import "./FactorPanel.css";

interface Props {
  character: Character | null;
  selections: SlotSelections;
  filter: AptitudeFilter;
}

export function FactorPanel({ character, selections, filter }: Props) {
  const statuses = useMemo(
    () => computeFactorStatuses(selections, character, filter),
    [selections, character, filter]
  );

  return (
    <div className="factor-panel">
      <FactorSection
        title="별명 인자"
        statuses={statuses.nickname}
        emptyText="데이터 없음"
      />
      <FactorSection
        title="히든 인자"
        statuses={statuses.hidden}
        emptyText="데이터 없음"
      />
      <FactorSection
        title="G1 인자"
        statuses={statuses.g1}
        emptyText="레이스 없음"
        showOnlyRelevant
      />
    </div>
  );
}

function FactorSection({
  title,
  statuses,
  emptyText,
  showOnlyRelevant,
}: {
  title: string;
  statuses: FactorStatus[];
  emptyText: string;
  showOnlyRelevant?: boolean;
}) {
  // G1 인자는 목록이 많으니 획득한 것만 표시
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
            <FactorItem key={s.factor.id} status={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FactorItem({ status }: { status: FactorStatus }) {
  const { factor, satisfied, detail, progress } = status;

  return (
    <li
      className={`factor-item ${satisfied ? "factor-item--satisfied" : ""}`}
      title={factor.description}
    >
      <span className="factor-item__name">{factor.name}</span>
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