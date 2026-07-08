import type { PlannerState } from "./scheduler";
import { INITIAL_STATE } from "./scheduler";

const STATE_KEY = "uma-training-planner:v1";
const MIN_WINRATE_KEY = "uma-training-planner:min-winrate";

export function loadPlannerState(): PlannerState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as PlannerState;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.filter !== "object" ||
      typeof parsed.selections !== "object"
    ) {
      return INITIAL_STATE;
    }
    // 이전 버전 호환: ownerships 없으면 빈 객체
    if (typeof parsed.ownerships !== "object" || parsed.ownerships === null) {
      parsed.ownerships = {};
    }
    return parsed;
  } catch {
    return INITIAL_STATE;
  }
}

export function savePlannerState(state: PlannerState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[persistence] failed to save state", err);
  }
}

export function clearPlannerState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
}

// ─── 최소 승률 설정 ─────────────────────────

export function loadMinWinrate(): number {
  try {
    const raw = localStorage.getItem(MIN_WINRATE_KEY);
    if (!raw) return 100;
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0 || num > 200) return 100;
    return num;
  } catch {
    return 100;
  }
}

export function saveMinWinrate(value: number): void {
  try {
    localStorage.setItem(MIN_WINRATE_KEY, String(value));
  } catch {
    // ignore
  }
}