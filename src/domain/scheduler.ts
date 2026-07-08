import type { AptitudeGrade, Aptitudes } from "../types/character";
import type { ClassLevel, Race } from "../types/race";
import { baseWinrate, finalWinrate } from "./winrate";

/**
 * 필터: 유저가 "인자로 A까지 올릴 예정"이라고 표시한 축들.
 */
export interface AptitudeFilter {
  turf: boolean;
  dirt: boolean;
  sprint: boolean;
  mile: boolean;
  medium: boolean;
  long: boolean;
  runner: boolean;
  leader: boolean;
  betweener: boolean;
  chaser: boolean;
}

export const EMPTY_FILTER: AptitudeFilter = {
  turf: false,
  dirt: false,
  sprint: false,
  mile: false,
  medium: false,
  long: false,
  runner: false,
  leader: false,
  betweener: false,
  chaser: false,
};

/**
 * 슬롯 소유권: 이 슬롯의 레이스가 어디로부터 배치되었는지.
 * - "goal": 캐릭터의 목표 레이스 (자동 잠금, 최우선)
 * - "hidden:<factorId>": 히든/별명 인자 자동 배치
 * - "g1": G1 자동 배치 버튼으로 배치됨
 * - "manual": 유저가 직접 선택
 */
export type SlotOwnership =
  | { kind: "goal" }
  | { kind: "hidden"; factorId: string }
  | { kind: "g1" }
  | { kind: "manual" };

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

const OWNERSHIP_PRIORITY: Record<SlotOwnership["kind"], number> = {
  goal: 3,
  hidden: 2,
  g1: 1,
  manual: 0,
};

/**
 * 새 소유권이 기존 소유권보다 높은 우선순위인가?
 * (같은 우선순위는 덮어쓰기 불가)
 */
export function canOverwrite(
  newOwner: SlotOwnership,
  existing: SlotOwnership | undefined
): boolean {
  if (!existing) return true;
  return OWNERSHIP_PRIORITY[newOwner.kind] > OWNERSHIP_PRIORITY[existing.kind];
}

// ─── 필터 자동 활성화 ─────────────────────────

export function autoActivateFilter(originalGrades: {
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
  const isBOrBetter = (g: AptitudeGrade) => g === "S" || g === "A" || g === "B";

  return {
    turf: isBOrBetter(originalGrades.turf),
    dirt: isBOrBetter(originalGrades.dirt),
    sprint: isBOrBetter(originalGrades.sprint),
    mile: isBOrBetter(originalGrades.mile),
    medium: isBOrBetter(originalGrades.medium),
    long: isBOrBetter(originalGrades.long),
    runner: isBOrBetter(originalGrades.runner),
    leader: isBOrBetter(originalGrades.leader),
    betweener: isBOrBetter(originalGrades.betweener),
    chaser: isBOrBetter(originalGrades.chaser),
  };
}

// ─── 상태 조작 (순수 함수) ────────────────────

export function toggleFilterKey(
  state: PlannerState,
  key: keyof AptitudeFilter
): PlannerState {
  return {
    ...state,
    filter: {
      ...state.filter,
      [key]: !state.filter[key],
    },
  };
}

export function selectRaceInSlot(
  state: PlannerState,
  turnIndex: number,
  raceId: string
): PlannerState {
  return {
    ...state,
    selections: {
      ...state.selections,
      [turnIndex]: raceId,
    },
    ownerships: {
      ...state.ownerships,
      [turnIndex]: { kind: "manual" },
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

/**
 * 특정 조건에 맞는 소유권의 슬롯 전부 제거.
 * (예: 특정 히든 인자 자동 배치 취소 시 사용)
 */
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

/**
 * 특정 턴이 연속 몇 번째 출전인지 계산.
 */
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

/**
 * 필터 상태를 반영한 캐릭터의 "실효 적성" 계산.
 */
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
  const raise = (orig: AptitudeGrade, on: boolean): AptitudeGrade => {
    if (!on) return orig;
    return orig === "S" ? "S" : "A";
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

/**
 * 특정 레이스에 대한 캐릭터의 승률 계산 (연전 감점 포함).
 */
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