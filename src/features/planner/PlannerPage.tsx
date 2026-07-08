import { usePlannerState } from "./usePlannerState";
import { CharacterPanel } from "./CharacterPanel";
import { RaceCalendar } from "./RaceCalendar";
import "./PlannerPage.css";

export function PlannerPage() {
  const {
    state,
    character,
    selectCharacter,
    toggleFilter,
    selectRace,
    clearRaceSlot,
    resetAll,
  } = usePlannerState();

  return (
    <div className="planner-page">
      <CharacterPanel
        character={character}
        filter={state.filter}
        onSelectCharacter={selectCharacter}
        onToggleFilter={toggleFilter}
      />

      <RaceCalendar
        character={character}
        filter={state.filter}
        selections={state.selections}
        onSelectRace={selectRace}
        onClearSlot={clearRaceSlot}
      />

      {/* 우측 인자 패널은 나중에 */}
      <aside className="planner-page__right-placeholder">
        <div className="placeholder-panel">
          <h4>인자 (준비 중)</h4>
        </div>
        <button className="reset-btn" onClick={resetAll}>
          전체 초기화
        </button>
      </aside>
    </div>
  );
}