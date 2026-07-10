import { useState, useEffect } from "react";
import { usePlannerState } from "./usePlannerState";
import { CharacterPanel } from "./CharacterPanel";
import { RaceCalendar, type ActiveView } from "./RaceCalendar";
import { FactorPanel } from "./FactorPanel";
import "./PlannerPage.css";

export function PlannerPage() {
  const {
    state,
    character,
    minWinrate,
    setMinWinrate,
    selectCharacter,
    setAptitudeFilter,
    selectRace,
    clearRaceSlot,
    resetAll,
    toggleFactorAssignment,
    isFactorAssigned,
    isFactorPinned,
    toggleFactorPin,
    runG1AutoAssign,
    clearG1AutoAssign,
    runOptimize,
    lastAssignResult,
  } = usePlannerState();

  const [visibleAlert, setVisibleAlert] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>("클래식급");

  const [winrateInput, setWinrateInput] = useState(String(minWinrate));

  useEffect(() => {
    setWinrateInput(String(minWinrate));
  }, [minWinrate]);

  useEffect(() => {
    if (!lastAssignResult) return;
    setVisibleAlert(lastAssignResult.message);
    setAlertSuccess(lastAssignResult.success);
    const duration = lastAssignResult.success ? 3000 : 12000;
    const timer = setTimeout(() => setVisibleAlert(null), duration);
    return () => clearTimeout(timer);
  }, [lastAssignResult]);

  const g1AutoActive = Object.values(state.ownerships).some(
    (o) => o?.kind === "g1"
  );

  const commitWinrate = () => {
    const num = parseInt(winrateInput, 10);
    if (isNaN(num)) {
      setWinrateInput(String(minWinrate));
      return;
    }
    const clamped = Math.max(0, Math.min(200, num));
    setMinWinrate(clamped);
    setWinrateInput(String(clamped));
  };

  const characterPanel = (
    <CharacterPanel
      character={character}
      filter={state.filter}
      onSelectCharacter={selectCharacter}
      onSetFilterGrade={setAptitudeFilter}
    />
  );

  const rightPanel = (
    <aside className="planner-page__right">
      <div className="winrate-input-group">
        <label className="winrate-input-label">자동 배치 최소 승률</label>
        <div className="winrate-input-row">
          <input
            type="number"
            className="winrate-input"
            value={winrateInput}
            onChange={(e) => setWinrateInput(e.target.value)}
            onBlur={commitWinrate}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitWinrate();
                (e.target as HTMLInputElement).blur();
              }
            }}
            min={0}
            max={200}
            step={5}
          />
          <span className="winrate-input-suffix">%</span>
        </div>
      </div>

      {character && (
        <>
          <div className="auto-btn-row">
            <button
              className={`g1-auto-btn ${g1AutoActive ? "g1-auto-btn--active" : ""}`}
              onClick={g1AutoActive ? clearG1AutoAssign : runG1AutoAssign}
            >
              {g1AutoActive ? "G1 해제" : "G1 자동 배치"}
            </button>
            <button className="optimize-btn" onClick={runOptimize}>
              최적화 실행
            </button>
          </div>

          <button className="reset-btn" onClick={resetAll}>
            전체 초기화
          </button>
        </>
      )}

      <FactorPanel
        character={character}
        selections={state.selections}
        filter={state.filter}
        onFactorClick={toggleFactorAssignment}
        isFactorAssigned={isFactorAssigned}
        isFactorPinned={isFactorPinned}
        onPinToggle={toggleFactorPin}
        minWinrate={minWinrate}
        plannerState={state}
      />
    </aside>
  );

  return (
    <div className="planner-page">
      <div className="planner-page__top-panels">
        {characterPanel}
        {rightPanel}
      </div>

      <RaceCalendar
        character={character}
        filter={state.filter}
        selections={state.selections}
        ownerships={state.ownerships}
        onSelectRace={selectRace}
        onClearSlot={clearRaceSlot}
        activeView={activeView}
        onChangeView={setActiveView}
      />

      {visibleAlert && (
        <div
          className={`assign-alert ${
            alertSuccess ? "assign-alert--success" : "assign-alert--error"
          }`}
        >
          {visibleAlert.split("\n").map((line, idx) => (
            <div key={idx} className="assign-alert__line">
              {line}
            </div>
          ))}
          <button
            className="assign-alert__close"
            onClick={() => setVisibleAlert(null)}
            title="닫기"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}