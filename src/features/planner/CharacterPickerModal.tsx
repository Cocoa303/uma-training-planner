import { useMemo, useState, useEffect } from "react";
import type { Character } from "../../types/character";
import charactersData from "../../../data/characters.json";
import { assetPath } from "../../utils/assetPath";
import "./CharacterPickerModal.css";

const characters = charactersData as Character[];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function CharacterPickerModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return characters;
    const q = query.toLowerCase();
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.epithet.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h3>캐릭터 선택</h3>
          <button className="modal__close" onClick={onClose}>×</button>
        </header>

        <input
          type="text"
          className="modal__search"
          placeholder="이름 또는 별명 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="modal__grid">
          {filtered.map((c) => (
            <button
              key={c.id}
              className="picker-card"
              onClick={() => {
                onSelect(c.id);
                onClose();
              }}
            >
              <div className="picker-card__image">
                {c.images.race ? (
                  <img src={assetPath(c.images.race)} alt={c.name} loading="lazy" />
                ) : c.images.icon ? (
                  <img src={assetPath(c.images.icon)} alt={c.name} loading="lazy" />
                ) : (
                  <div className="picker-card__placeholder">No Image</div>
                )}
              </div>
              <div className="picker-card__body">
                <div className="picker-card__epithet">{c.epithet || "\u00a0"}</div>
                <div className="picker-card__name">{c.name}</div>
              </div>
            </button>
          ))}
        </div>

        <footer className="modal__footer">
          <span className="modal__count">{filtered.length}명</span>
        </footer>
      </div>
    </div>
  );
}