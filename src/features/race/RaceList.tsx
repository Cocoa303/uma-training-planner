import { useMemo, useState } from "react";
import type { Race, RaceGrade, DistanceCategory, Surface } from "../../types/race";
import racesData from "../../../data/races.json";
import "./RaceList.css";

const races = racesData as Race[];

const GRADES: RaceGrade[] = ["G1", "G2", "G3", "OP", "Pre-OP"];
const DISTANCE_CATEGORIES: DistanceCategory[] = ["단거리", "마일", "중거리", "장거리"];
const SURFACES: Surface[] = ["잔디", "더트"];

export function RaceList() {
  const [selectedGrades, setSelectedGrades] = useState<Set<RaceGrade>>(new Set());
  const [selectedDistances, setSelectedDistances] = useState<Set<DistanceCategory>>(new Set());
  const [selectedSurfaces, setSelectedSurfaces] = useState<Set<Surface>>(new Set());
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return races.filter((race) => {
      if (selectedGrades.size > 0 && !selectedGrades.has(race.grade)) return false;
      if (selectedDistances.size > 0 && !selectedDistances.has(race.distanceCategory)) return false;
      if (selectedSurfaces.size > 0 && !selectedSurfaces.has(race.surface)) return false;
      if (query && !race.name.includes(query)) return false;
      return true;
    });
  }, [selectedGrades, selectedDistances, selectedSurfaces, query]);

  // Set 토글 헬퍼를 제네릭으로 뽑아냈어요 — 반복 코드를 줄이려고
  const makeToggler = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) => (value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleGrade = makeToggler(setSelectedGrades);
  const toggleDistance = makeToggler(setSelectedDistances);
  const toggleSurface = makeToggler(setSelectedSurfaces);

  return (
    <div className="race-list">
      <div className="filters">
        <div className="filter-group">
          <label className="filter-label">등급</label>
          <div className="filter-chips">
            {GRADES.map((grade) => (
              <button
                key={grade}
                className={`chip ${selectedGrades.has(grade) ? "chip--active" : ""}`}
                onClick={() => toggleGrade(grade)}
              >
                {grade}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">바탕</label>
          <div className="filter-chips">
            {SURFACES.map((surface) => (
              <button
                key={surface}
                className={`chip chip--surface-${surface === "잔디" ? "turf" : "dirt"} ${
                  selectedSurfaces.has(surface) ? "chip--active" : ""
                }`}
                onClick={() => toggleSurface(surface)}
              >
                {surface}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">거리</label>
          <div className="filter-chips">
            {DISTANCE_CATEGORIES.map((dist) => (
              <button
                key={dist}
                className={`chip ${selectedDistances.has(dist) ? "chip--active" : ""}`}
                onClick={() => toggleDistance(dist)}
              >
                {dist}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="race-search">이름 검색</label>
          <input
            id="race-search"
            type="text"
            className="search-input"
            placeholder="사츠키..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="result-count">
        총 <strong>{filtered.length}</strong>개 레이스
      </div>

      <table className="race-table">
        <thead>
          <tr>
            <th>등급</th>
            <th>이름</th>
            <th>경기장</th>
            <th>바탕</th>
            <th>거리</th>
            <th>시기</th>
            <th>팬</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((race) => (
            <tr key={race.id}>
              <td>
                <span className={`grade-badge grade-badge--${race.grade.toLowerCase().replace("-", "")}`}>
                  {race.grade}
                </span>
              </td>
              <td>{race.name}</td>
              <td>{race.venue}</td>
              <td>
                <span className={`surface-badge surface-badge--${race.surface === "잔디" ? "turf" : "dirt"}`}>
                  {race.surface}
                </span>
              </td>
              <td>
                {race.distance}m <span className="muted">({race.distanceCategory})</span>
              </td>
              <td>
                {race.eligibleClasses.join("/")} {race.turn.month}월 {race.turn.half === 1 ? "전반" : "후반"}
              </td>
              <td>{race.fansGained.toLocaleString()}명</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}