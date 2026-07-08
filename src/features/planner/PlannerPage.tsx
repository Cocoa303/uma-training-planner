import { useState } from "react";
import { usePlannerState } from "./usePlannerState";
import { CharacterPanel } from "./CharacterPanel";
import { RaceCalendar } from "./RaceCalendar";
import { FactorPanel } from "./FactorPanel";
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

  const [factorPanelOpen, setFactorPanelOpen] = useState(true);

  return (
    <div
      className={`planner-page ${factorPanelOpen ? "" : "planner-page--panel-closed"}`}
    >
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

      <aside className="planner-page__right">
        <button
          className="factor-toggle"
          onClick={() => setFactorPanelOpen((v) => !v)}
          title={factorPanelOpen ? "인자 패널 닫기" : "인자 패널 열기"}
        >
          {factorPanelOpen ? "▶" : "◀"}
          <span className="factor-toggle__label">인자</span>
        </button>

        {factorPanelOpen && (
          <>
            <FactorPanel
              character={character}
              selections={state.selections}
              filter={state.filter}
            />
            <button className="reset-btn" onClick={resetAll}>
              전체 초기화
            </button>
          </>
        )}
      </aside>
    </div>
  );
}