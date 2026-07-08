import "./App.css";
import { RaceList } from "./features/race/RaceList";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Uma Training Planner</h1>
        <p className="subtitle">우마무스메 인자작 육성 계획 툴</p>
      </header>
      <main>
        <RaceList />
      </main>
    </div>
  );
}

export default App;