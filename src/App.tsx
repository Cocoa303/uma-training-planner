import "./App.css";
import { PlannerPage } from "./features/planner/PlannerPage";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Uma Training Planner</h1>
          <p className="subtitle">우마무스메 인자작 육성 계획 툴</p>
        </div>
      </header>

      <main>
        <PlannerPage />
      </main>
    </div>
  );
}

export default App;