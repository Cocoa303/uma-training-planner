import type { AptitudeGrade, Aptitudes } from "../types/character";
import type { ClassLevel, Race } from "../types/race";
import { baseWinrate, finalWinrate } from "./winrate";

/**
 * 필터 등급.
 * - null: 필터 OFF (원본 적성 그대로 사용)
 * - "A" | "B" | "C": 유저가 인자로 이 등급까지 올리겠다고 지정
 */
export type AptitudeFilterGrade = "A" | "B" | "C" | null;

export interface AptitudeFilter {
  turf: AptitudeFilterGrade;
  dirt: AptitudeFilterGrade;
  sprint: AptitudeFilterGrade;
  mile: AptitudeFilterGrade;
  medium: AptitudeFilterGrade;
  long: AptitudeFilterGrade;
  runner: AptitudeFilterGrade;
  leader: AptitudeFilterGrade;
  betweener: AptitudeFilterGrade;
  chaser: AptitudeFilterGrade;
}

export const EMPTY_FILTER: AptitudeFilter = {
  turf: null,
  dirt: null,
  sprint: null,
  mile: null,
  medium: null,
  long: null,
  runner: null,
  leader: null,
  betweener: null,
  chaser: null,
};

/**
 * 슬롯 소유권.
 * - goal: 목표 레이스 (변경 불가, 항상 최우선)
 * - hidden: 히든 인자 자동 배치
 * - g1: G1 자동 배치
 * - manual: 유저가 직접 선택
 * - filler: 최적화의 "빈 슬롯 채우기" 로 자동 배치 (재실행 시 초기화됨)
 *
 * pinned: 유저가 명시적으로 고정. 최적화가 재배치하지 않고,
 *         다른 자동 배치가 덮어쓰지 못한다. goal 제외 모든 kind 에 적용 가능.
 */
export type SlotOwnership =
  | { kind: "goal" }
  | { kind: "hidden"; factorId: string; pinned?: boolean }
  | { kind: "g1"; pinned?: boolean }
  | { kind: "manual"; pinned?: boolean }
  | { kind: "filler"; pinned?: boolean };

export type SlotSelections = Record<number, string | undefined>;
export type SlotOwnerships = Record<number, SlotOwnership | undefined>;

export interface PlannerState {
  characterId: string | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
  ownerships: SlotOwnerships;
}

export const INITIAL_STATE: PlannerState = {
  characterId: null,
  filter: EMPTY_FILTER,
  selections: {},
  ownerships: {},
};

// ─── 우선순위 ──────────────────────────────

/**
 * 우선순위 비교.
 * 높은 우선순위가 낮은 우선순위를 덮어쓸 수 있음.
 *
 * filler(-1) < manual(0) < g1(1) < hidden(2) < *-pinned(3) < goal(4)
 *
 * pinned 슬롯 (kind 무관): 우선순위 3.
 * 유저가 명시적으로 고정한 것이므로 다른 자동 배치가 덮어쓰지 못함.
 */
function getOwnershipPriority(o: SlotOwnership): number {
  if (o.kind === "goal") return 4;
  if ("pinned" in o && o.pinned) return 3;
  switch (o.kind) {
    case "hidden": return 2;
    case "g1": return 1;
    case "manual": return 0;
    case "filler": return -1;
  }
}

export function canOverwrite(
  newOwner: SlotOwnership,
  existing: SlotOwnership | undefined
): boolean {
  if (!existing) return true;
  return getOwnershipPriority(newOwner) > getOwnershipPriority(existing);
}

// ─── 등급 비교 ─────────────────────────

const GRADE_RANK: Record<AptitudeGrade, number> = {
  S: 7,
  A: 6,
  B: 5,
  C: 4,
  D: 3,
  E: 2,
  F: 1,
  G: 0,
};

function isFilterHigherThanOriginal(
  original: AptitudeGrade,
  filter: AptitudeFilterGrade
): boolean {
  if (filter === null) return false;
  return GRADE_RANK[filter] > GRADE_RANK[original];
}

// ─── 필터 자동 활성화 (사용 안 함) ─────────────────────────

export function autoActivateFilter(_originalGrades: {
  turf: AptitudeGrade;
  dirt: AptitudeGrade;
  sprint: AptitudeGrade;
  mile: AptitudeGrade;
  medium: AptitudeGrade;
  long: AptitudeGrade;
  runner: AptitudeGrade;
  leader: AptitudeGrade;
  betweener: AptitudeGrade;
  chaser: AptitudeGrade;
}): AptitudeFilter {
  return { ...EMPTY_FILTER };
}

// ─── 상태 조작 (순수 함수) ────────────────────

export function setFilterGrade(
  state: PlannerState,
  key: keyof AptitudeFilter,
  grade: AptitudeFilterGrade
): PlannerState {
  return {
    ...state,
    filter: {
      ...state.filter,
      [key]: grade,
    },
  };
}

export function toggleFilterKey(
  state: PlannerState,
  key: keyof AptitudeFilter
): PlannerState {
  const current = state.filter[key];
  return {
    ...state,
    filter: {
      ...state.filter,
      [key]: current === null ? "A" : null,
    },
  };
}

export function selectRaceInSlot(
  state: PlannerState,
  turnIndex: number,
  raceId: string,
  pinned: boolean = false
): PlannerState {
  return {
    ...state,
    selections: {
      ...state.selections,
      [turnIndex]: raceId,
    },
    ownerships: {
      ...state.ownerships,
      [turnIndex]: { kind: "manual", pinned },
    },
  };
}

export function clearSlot(
  state: PlannerState,
  turnIndex: number
): PlannerState {
  const nextSelections = { ...state.selections };
  delete nextSelections[turnIndex];
  const nextOwnerships = { ...state.ownerships };
  delete nextOwnerships[turnIndex];
  return {
    ...state,
    selections: nextSelections,
    ownerships: nextOwnerships,
  };
}

export function clearSlotsByOwnership(
  state: PlannerState,
  predicate: (ownership: SlotOwnership) => boolean
): PlannerState {
  const nextSelections = { ...state.selections };
  const nextOwnerships = { ...state.ownerships };

  for (const [key, ownership] of Object.entries(state.ownerships)) {
    if (ownership && predicate(ownership)) {
      const idx = Number(key);
      delete nextSelections[idx];
      delete nextOwnerships[idx];
    }
  }

  return {
    ...state,
    selections: nextSelections,
    ownerships: nextOwnerships,
  };
}

export function countConsecutive(
  selections: SlotSelections,
  turnIndex: number
): number {
  if (!selections[turnIndex]) return 0;

  let count = 1;
  for (let i = turnIndex - 1; i >= 0; i--) {
    if (selections[i]) count++;
    else break;
  }
  return count;
}

// ─── 학년 인덱스 ─────────────────────────────

const CLASS_ORDER: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

export function classToIndex(cls: ClassLevel): number {
  return CLASS_ORDER.indexOf(cls);
}

// ─── 실효 적성 계산 ─────────────────────────

export function effectiveAptitudes(
  original: Aptitudes,
  filter: AptitudeFilter
): {
  turf: AptitudeGrade;
  dirt: AptitudeGrade;
  sprint: AptitudeGrade;
  mile: AptitudeGrade;
  medium: AptitudeGrade;
  long: AptitudeGrade;
} {
  const raise = (
    orig: AptitudeGrade,
    filterGrade: AptitudeFilterGrade
  ): AptitudeGrade => {
    if (!isFilterHigherThanOriginal(orig, filterGrade)) return orig;
    return filterGrade as AptitudeGrade;
  };

  return {
    turf: raise(original.surface.turf, filter.turf),
    dirt: raise(original.surface.dirt, filter.dirt),
    sprint: raise(original.distance.sprint, filter.sprint),
    mile: raise(original.distance.mile, filter.mile),
    medium: raise(original.distance.medium, filter.medium),
    long: raise(original.distance.long, filter.long),
  };
}

export function computeRaceWinrate(
  race: Race,
  effective: ReturnType<typeof effectiveAptitudes>,
  consecutiveCount: number
): number {
  const surfaceGrade =
    race.surface === "잔디" ? effective.turf : effective.dirt;

  let distanceGrade: AptitudeGrade;
  switch (race.distanceCategory) {
    case "단거리":
      distanceGrade = effective.sprint;
      break;
    case "마일":
      distanceGrade = effective.mile;
      break;
    case "중거리":
      distanceGrade = effective.medium;
      break;
    case "장거리":
      distanceGrade = effective.long;
      break;
    default:
      return 0;
  }

  const base = baseWinrate(surfaceGrade, distanceGrade);
  return finalWinrate(base, consecutiveCount);
}

export function availableFilterGrades(
  original: AptitudeGrade
): AptitudeGrade[] {
  if (original === "S" || original === "A") return [];

  const options: AptitudeGrade[] = [];
  const gradesUpToA: AptitudeGrade[] = ["G", "F", "E", "D", "C", "B", "A"];
  const originalRank = GRADE_RANK[original];

  for (const g of gradesUpToA) {
    if (GRADE_RANK[g] >= originalRank) {
      options.push(g);
    }
  }

  return options;
}
/**
 * 특정 슬롯의 pinned 플래그를 토글.
 * goal 슬롯은 무시 (이미 잠금 상태).
 * 현재 kind 를 유지하면서 pinned 만 변경.
 */
export function toggleSlotPin(
  state: PlannerState,
  turnIndex: number
): PlannerState {
  const existing = state.ownerships[turnIndex];
  if (!existing) return state;
  if (existing.kind === "goal") return state;

  const nextOwnership: SlotOwnership = {
    ...existing,
    pinned: !existing.pinned,
  };

  return {
    ...state,
    ownerships: {
      ...state.ownerships,
      [turnIndex]: nextOwnership,
    },
  };
}

/**
 * 슬롯이 pinned 상태인지 확인.
 * goal 은 별개 개념이므로 false 반환.
 */
export function isSlotPinned(ownership: SlotOwnership | undefined): boolean {
  if (!ownership) return false;
  if (ownership.kind === "goal") return false;
  return ownership.pinned === true;
}