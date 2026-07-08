import type { PlannerState } from "./scheduler";
import { INITIAL_STATE } from "./scheduler";

const STORAGE_KEY = "uma-training-planner:v1";

/**
 * 로컬 스토리지에서 상태 로드.
 * 없거나 파싱 실패시 초기 상태 반환.
 */
export function loadPlannerState(): PlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as PlannerState;
    // 최소 필드 검증
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.filter !== "object" ||
      typeof parsed.selections !== "object"
    ) {
      return INITIAL_STATE;
    }
    return parsed;
  } catch {
    return INITIAL_STATE;
  }
}

/**
 * 로컬 스토리지에 상태 저장.
 */
export function savePlannerState(state: PlannerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[persistence] failed to save state", err);
  }
}

/**
 * 저장된 상태 삭제.
 */
export function clearPlannerState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}