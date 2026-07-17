import { useState, useRef, useEffect, useMemo } from "react";
import type { Character, AptitudeGrade } from "../../types/character";
import type { Race } from "../../types/race";
import type {
  AptitudeFilter,
  AptitudeFilterGrade,
  SlotSelections,
} from "../../domain/scheduler";
import { availableFilterGrades } from "../../domain/scheduler";
import { CharacterPickerModal } from "./CharacterPickerModal";
import { assetPath } from "../../utils/assetPath";
import racesData from "../../../data/races.json";
import "./CharacterPanel.css";

const allRaces = racesData as Race[];

interface Props {
  character: Character | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  onSelectCharacter: (id: string) => void;
  onSetFilterGrade: (key: keyof AptitudeFilter, grade: AptitudeFilterGrade) => void;
}

export function CharacterPanel({
  character,
  filter,
  selections,
  onSelectCharacter,
  onSetFilterGrade,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const gradeCounts = useMemo(() => {
    const counts: Record<"G1" | "G2" | "G3", number> = { G1: 0, G2: 0, G3: 0 };
    for (const raceId of Object.values(selections)) {
      if (!raceId) continue;
      const race = allRaces.find((r) => r.id === raceId);
      if (!race) continue;
      if (race.grade === "G1") counts.G1++;
      else if (race.grade === "G2") counts.G2++;
      else if (race.grade === "G3") counts.G3++;
    }
    return counts;
  }, [selections]);

  return (
    <aside className="character-panel">
      <button
        className="character-panel__image-btn"
        onClick={() => setModalOpen(true)}
        title="캐릭터 선택"
      >
        {character?.images.race ? (
          <img src={assetPath(character.images.race)} alt={character.name} />
        ) : character?.images.icon ? (
          <img src={assetPath(character.images.icon)} alt={character.name} />
        ) : (
          <div className="character-panel__placeholder">
            <span>클릭해서</span>
            <span>캐릭터 선택</span>
          </div>
        )}
      </button>

      {character && (
        <>
          <div className="character-panel__name">
            <div className="character-panel__epithet">[{character.epithet}]</div>
            <div className="character-panel__full-name">{character.name}</div>
          </div>

          <AptitudeSection title="바탕 적성">
            <AptCell label="잔디" grade={character.aptitudes.surface.turf} />
            <AptCell label="더트" grade={character.aptitudes.surface.dirt} />
          </AptitudeSection>

          <AptitudeSection title="거리 적성">
            <AptCell label="단거리" grade={character.aptitudes.distance.sprint} />
            <AptCell label="마일" grade={character.aptitudes.distance.mile} />
            <AptCell label="중거리" grade={character.aptitudes.distance.medium} />
            <AptCell label="장거리" grade={character.aptitudes.distance.long} />
          </AptitudeSection>

          <AptitudeSection title="각질 적성">
            <AptCell label="도주" grade={character.aptitudes.style.runner} />
            <AptCell label="선행" grade={character.aptitudes.style.leader} />
            <AptCell label="선입" grade={character.aptitudes.style.betweener} />
            <AptCell label="추입" grade={character.aptitudes.style.chaser} />
          </AptitudeSection>

          <div className="character-panel__filter-section">
            <h4>거리 필터링</h4>
            <p className="character-panel__filter-hint">
              인자로 올릴 등급을 선택하세요.
            </p>

            <div className="filter-block">
              <FilterGradeSelector
                label="잔디"
                original={character.aptitudes.surface.turf}
                grade={filter.turf}
                onChange={(g) => onSetFilterGrade("turf", g)}
              />
              <FilterGradeSelector
                label="더트"
                original={character.aptitudes.surface.dirt}
                grade={filter.dirt}
                onChange={(g) => onSetFilterGrade("dirt", g)}
              />
            </div>
            <div className="filter-block">
              <FilterGradeSelector
                label="단거리"
                original={character.aptitudes.distance.sprint}
                grade={filter.sprint}
                onChange={(g) => onSetFilterGrade("sprint", g)}
              />
              <FilterGradeSelector
                label="마일"
                original={character.aptitudes.distance.mile}
                grade={filter.mile}
                onChange={(g) => onSetFilterGrade("mile", g)}
              />
              <FilterGradeSelector
                label="중거리"
                original={character.aptitudes.distance.medium}
                grade={filter.medium}
                onChange={(g) => onSetFilterGrade("medium", g)}
              />
              <FilterGradeSelector
                label="장거리"
                original={character.aptitudes.distance.long}
                grade={filter.long}
                onChange={(g) => onSetFilterGrade("long", g)}
              />
            </div>
          </div>

          <div className="race-stats">
            <div className="apt-section__title">배치 현황</div>
            <div className="race-stats__cells">
              <div className="race-stat race-stat--g1">
                <div className="race-stat__label">G1</div>
                <div className="race-stat__count">{gradeCounts.G1}</div>
              </div>
              <div className="race-stat race-stat--g2">
                <div className="race-stat__label">G2</div>
                <div className="race-stat__count">{gradeCounts.G2}</div>
              </div>
              <div className="race-stat race-stat--g3">
                <div className="race-stat__label">G3</div>
                <div className="race-stat__count">{gradeCounts.G3}</div>
              </div>
            </div>
          </div>
        </>
      )}

      <CharacterPickerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={onSelectCharacter}
      />
    </aside>
  );
}

function AptitudeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="apt-section">
      <div className="apt-section__title">{title}</div>
      <div className="apt-section__cells">{children}</div>
    </div>
  );
}

function AptCell({ label, grade }: { label: string; grade: AptitudeGrade }) {
  return (
    <div className="apt-cell">
      <div className="apt-cell__label">{label}</div>
      <div className={`apt-cell__grade apt-grade--${grade.toLowerCase()}`}>
        {grade}
      </div>
    </div>
  );
}

/**
 * 필터 등급 선택기 (드롭다운).
 * 원본 등급을 기본값으로 표시하고, 원본부터 A까지 선택 가능.
 * 원본이 S/A 면 필터 불필요 → 비활성 표시.
 */
function FilterGradeSelector({
  label,
  original,
  grade,
  onChange,
}: {
  label: string;
  original: AptitudeGrade;
  grade: AptitudeFilterGrade;
  onChange: (g: AptitudeFilterGrade) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const availableGrades = availableFilterGrades(original);
  const canBeFiltered = availableGrades.length > 0;

  const displayGrade: AptitudeGrade = grade ?? original;
  const isElevated = grade !== null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (selected: AptitudeGrade) => {
    if (selected === original) {
      onChange(null);
    } else {
      onChange(selected as AptitudeFilterGrade);
    }
    setOpen(false);
  };

  return (
    <div className="filter-grade-selector" ref={ref}>
      <button
        className={`filter-grade-selector__button ${isElevated ? "filter-grade-selector__button--on" : ""} ${!canBeFiltered ? "filter-grade-selector__button--disabled" : ""}`}
        onClick={() => canBeFiltered && setOpen((v) => !v)}
        disabled={!canBeFiltered}
        title={!canBeFiltered ? `원본 ${original}등급 - 필터 불필요` : "등급 선택"}
      >
        <span className="filter-grade-selector__label">{label}</span>
        <span className="filter-grade-selector__grade">{displayGrade}</span>
        {canBeFiltered && (
          <span className="filter-grade-selector__arrow">▼</span>
        )}
      </button>

      {open && canBeFiltered && (
        <div className="filter-grade-selector__dropdown">
          {availableGrades.map((g) => {
            const isSelected = displayGrade === g;
            return (
              <button
                key={g}
                className={`filter-grade-selector__option ${isSelected ? "filter-grade-selector__option--active" : ""}`}
                onClick={() => handleSelect(g)}
              >
                {g}
                {g === original && (
                  <span className="filter-grade-selector__option-hint">
                    (원본)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}