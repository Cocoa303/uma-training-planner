import type { PlannerState, AptitudeFilter, AptitudeFilterGrade } from "./scheduler";
import { INITIAL_STATE, EMPTY_FILTER } from "./scheduler";

const STATE_KEY = "uma-training-planner:v1";
const MIN_WINRATE_KEY = "uma-training-planner:min-winrate";

/**
 * 필터 값 하나를 마이그레이션.
 * - boolean true  → "A"
 * - boolean false → null
 * - "A"/"B"/"C"   → 그대로
 * - 그 외         → null
 */
function migrateFilterValue(v: unknown): AptitudeFilterGrade {
  if (v === true) return "A";
  if (v === false) return null;
  if (v === "A" || v === "B" || v === "C") return v;
  return null;
}

function migrateFilter(raw: unknown): AptitudeFilter {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_FILTER };
  const f = raw as Record<string, unknown>;
  return {
    turf: migrateFilterValue(f.turf),
    dirt: migrateFilterValue(f.dirt),
    sprint: migrateFilterValue(f.sprint),
    mile: migrateFilterValue(f.mile),
    medium: migrateFilterValue(f.medium),
    long: migrateFilterValue(f.long),
    runner: migrateFilterValue(f.runner),
    leader: migrateFilterValue(f.leader),
    betweener: migrateFilterValue(f.betweener),
    chaser: migrateFilterValue(f.chaser),
  };
}

export function loadPlannerState(): PlannerState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.filter !== "object" ||
      typeof parsed.selections !== "object"
    ) {
      return INITIAL_STATE;
    }

    // ownerships 없으면 빈 객체
    if (typeof parsed.ownerships !== "object" || parsed.ownerships === null) {
      parsed.ownerships = {};
    }

    // 필터 마이그레이션 (boolean → 등급)
    parsed.filter = migrateFilter(parsed.filter);

    return parsed as PlannerState;
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