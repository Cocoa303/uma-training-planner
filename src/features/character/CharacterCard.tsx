import type { Character, AptitudeGrade } from "../../types/character";
import "./CharacterCard.css";

interface Props {
  character: Character;
  onClick: (id: string) => void;
}

export function CharacterCard({ character, onClick }: Props) {
  const rarityStars = character.rarity ? "★".repeat(character.rarity) : "";

  return (
    <button className="character-card" onClick={() => onClick(character.id)}>
    <div className="character-card__image">
        {character.images.race ? (
          <img src={character.images.race} alt={character.name} loading="lazy" />
        ) : character.images.casual ? (
          <img src={character.images.casual} alt={character.name} loading="lazy" />
        ) : character.images.icon ? (
          <img src={character.images.icon} alt={character.name} loading="lazy" />
        ) : (
          <div className="character-card__placeholder">No Image</div>
        )}
      </div>

      <div className="character-card__body">
        <div className="character-card__rarity">{rarityStars}</div>
        <div className="character-card__epithet">{character.epithet || "\u00a0"}</div>
        <div className="character-card__name">{character.name}</div>

        <div className="character-card__aptitude-row">
          <AptChip label="잔디" grade={character.aptitudes.surface.turf} />
          <AptChip label="더트" grade={character.aptitudes.surface.dirt} />
        </div>
        <div className="character-card__aptitude-row">
          <AptChip label="단" grade={character.aptitudes.distance.sprint} />
          <AptChip label="마" grade={character.aptitudes.distance.mile} />
          <AptChip label="중" grade={character.aptitudes.distance.medium} />
          <AptChip label="장" grade={character.aptitudes.distance.long} />
        </div>
      </div>
    </button>
  );
}

function AptChip({ label, grade }: { label: string; grade: AptitudeGrade }) {
  return (
    <span className={`apt-chip apt-chip--${grade.toLowerCase()}`}>
      <span className="apt-chip__label">{label}</span>
      <span className="apt-chip__grade">{grade}</span>
    </span>
  );
}