import { useMemo, useState } from "react";
import type { Character, AptitudeGrade } from "../../types/character";
import charactersData from "../../../data/characters.json";
import { CharacterCard } from "./CharacterCard";
import "./CharacterList.css";

const characters = charactersData as Character[];

// 적성 등급 순서 (S가 가장 좋음)
const APT_ORDER: Record<AptitudeGrade, number> = {
  S: 7,
  A: 6,
  B: 5,
  C: 4,
  D: 3,
  E: 2,
  F: 1,
  G: 0,
};

const MIN_APT_OPTIONS: AptitudeGrade[] = ["S", "A", "B", "C"];
const DISTANCE_KEYS = ["sprint", "mile", "medium", "long"] as const;
const DISTANCE_LABELS: Record<(typeof DISTANCE_KEYS)[number], string> = {
  sprint: "단거리",
  mile: "마일",
  medium: "중거리",
  long: "장거리",
};

interface Props {
  onSelect: (id: string) => void;
}

export function CharacterList({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [minAptitude, setMinAptitude] = useState<AptitudeGrade | null>(null);
    const [distanceFilter, setDistanceFilter] = useState<
    (typeof DISTANCE_KEYS)[number] | null
  >(null);

  const filtered = useMemo(() => {
    return characters.filter((c) => {
      // 이름/별명 검색
      if (query) {
        const q = query.toLowerCase();
        const hit =
          c.name.toLowerCase().includes(q) ||
          c.epithet.toLowerCase().includes(q);
        if (!hit) return false;
      }

      // 특정 거리 적성 최소 등급 필터
      if (distanceFilter && minAptitude) {
        const grade = c.aptitudes.distance[distanceFilter];
        if (APT_ORDER[grade] < APT_ORDER[minAptitude]) return false;
      }

      return true;
    });
  }, [query, minAptitude, distanceFilter]);

  return (
    <div className="character-list">
      <div className="filters">
        <div className="filter-group">
          <label className="filter-label" htmlFor="chara-search">
            검색
          </label>
          <input
            id="chara-search"
            type="text"
            className="search-input"
            placeholder="이름 또는 별명..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">거리 적성 필터</label>
          <div className="filter-chips">
            {DISTANCE_KEYS.map((key) => (
              <button
                key={key}
                className={`chip ${distanceFilter === key ? "chip--active" : ""}`}
                onClick={() =>
                  setDistanceFilter(distanceFilter === key ? null : key)
                }
              >
                {DISTANCE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">최소 등급</label>
          <div className="filter-chips">
            {MIN_APT_OPTIONS.map((grade) => (
              <button
                key={grade}
                className={`chip ${minAptitude === grade ? "chip--active" : ""}`}
                onClick={() =>
                  setMinAptitude(minAptitude === grade ? null : grade)
                }
                disabled={!distanceFilter}
                title={!distanceFilter ? "먼저 거리를 선택하세요" : undefined}
              >
                {grade}+
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="result-count">
        총 <strong>{filtered.length}</strong>명
      </div>

      <div className="character-grid">
        {filtered.map((c) => (
          <CharacterCard key={c.id} character={c} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}