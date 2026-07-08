import { useState } from "react";
import type { Character, AptitudeGrade } from "../../types/character";
import type { AptitudeFilter } from "../../domain/scheduler";
import { CharacterPickerModal } from "./CharacterPickerModal";
import "./CharacterPanel.css";

interface Props {
  character: Character | null;
  filter: AptitudeFilter;
  onSelectCharacter: (id: string) => void;
  onToggleFilter: (key: keyof AptitudeFilter) => void;
}

export function CharacterPanel({
  character,
  filter,
  onSelectCharacter,
  onToggleFilter,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <aside className="character-panel">
      <button
        className="character-panel__image-btn"
        onClick={() => setModalOpen(true)}
        title="캐릭터 선택"
      >
        {character?.images.race ? (
          <img src={character.images.race} alt={character.name} />
        ) : character?.images.icon ? (
          <img src={character.images.icon} alt={character.name} />
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
              A로 올릴 예정인 인자를 선택하세요.
            </p>

            <div className="filter-block">
              <FilterChip label="잔디" on={filter.turf} onClick={() => onToggleFilter("turf")} />
              <FilterChip label="더트" on={filter.dirt} onClick={() => onToggleFilter("dirt")} />
            </div>
            <div className="filter-block">
              <FilterChip label="단거리" on={filter.sprint} onClick={() => onToggleFilter("sprint")} />
              <FilterChip label="마일" on={filter.mile} onClick={() => onToggleFilter("mile")} />
              <FilterChip label="중거리" on={filter.medium} onClick={() => onToggleFilter("medium")} />
              <FilterChip label="장거리" on={filter.long} onClick={() => onToggleFilter("long")} />
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

function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`filter-chip ${on ? "filter-chip--on" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}