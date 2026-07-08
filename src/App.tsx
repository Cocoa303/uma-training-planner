import { useState } from "react";
import "./App.css";
import { RaceList } from "./features/race/RaceList";
import { CharacterList } from "./features/character/CharacterList";
import { CharacterDetail } from "./features/character/CharacterDetail";
import { PlannerPage } from "./features/planner/PlannerPage";

type View =
  | { kind: "planner" }
  | { kind: "race-list" }
  | { kind: "character-list" }
  | { kind: "character-detail"; id: string };

function App() {
  const [view, setView] = useState<View>({ kind: "planner" });

  const activeTab =
    view.kind === "race-list"
      ? "race"
      : view.kind === "planner"
      ? "planner"
      : "character";

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Uma Training Planner</h1>
          <p className="subtitle">우마무스메 인자작 육성 계획 툴</p>
        </div>

        <nav className="app-nav">
          <button
            className={`nav-tab ${activeTab === "planner" ? "nav-tab--active" : ""}`}
            onClick={() => setView({ kind: "planner" })}
          >
            스케줄러
          </button>
          <button
            className={`nav-tab ${activeTab === "character" ? "nav-tab--active" : ""}`}
            onClick={() => setView({ kind: "character-list" })}
          >
            캐릭터
          </button>
          <button
            className={`nav-tab ${activeTab === "race" ? "nav-tab--active" : ""}`}
            onClick={() => setView({ kind: "race-list" })}
          >
            레이스
          </button>
        </nav>
      </header>

      <main>
        {view.kind === "planner" && <PlannerPage />}
        {view.kind === "race-list" && <RaceList />}
        {view.kind === "character-list" && (
          <CharacterList
            onSelect={(id) => setView({ kind: "character-detail", id })}
          />
        )}
        {view.kind === "character-detail" && (
          <CharacterDetail
            characterId={view.id}
            onBack={() => setView({ kind: "character-list" })}
          />
        )}
      </main>
    </div>
  );
}

export default App;