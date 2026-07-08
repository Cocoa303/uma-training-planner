import type { AptitudeGrade } from "../types/character";
import type { ClassLevel } from "../types/race";

/**
 * 필터: 유저가 "인자로 A까지 올릴 예정"이라고 표시한 축들.
 * 잔디/더트, 4개 거리, 4개 각질을 모두 boolean으로 관리.
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
 * 슬롯 하나에 어떤 레이스가 선택됐는지.
 * key: turn index (0~71)
 * value: 선택된 레이스 ID (없으면 undefined)
 *
 * NOTE: 한 턴에 하나의 레이스만 뛸 수 있음 (게임 룰).
 */
export type SlotSelections = Record<number, string | undefined>;

/**
 * 전체 스케줄 상태.
 */
export interface PlannerState {
  characterId: string | null;
  filter: AptitudeFilter;
  selections: SlotSelections;
}

export const INITIAL_STATE: PlannerState = {
  characterId: null,
  filter: EMPTY_FILTER,
  selections: {},
};

// ─── 필터 파생 계산 ─────────────────────────────

/**
 * 캐릭터의 원본 적성에서 B 이상인 축들을 자동으로 필터에 활성화.
 * (게임에서 이미 승률 100% 확보되는 축들)
 */
export function autoActivateFilter(
  originalGrades: {
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
  }
): AptitudeFilter {
  const isBOrBetter = (g: AptitudeGrade) =>
    g === "S" || g === "A" || g === "B";

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

// ─── 상태 조작 함수들 (순수 함수) ─────────────

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
  };
}

export function clearSlot(
  state: PlannerState,
  turnIndex: number
): PlannerState {
  const next = { ...state.selections };
  delete next[turnIndex];
  return {
    ...state,
    selections: next,
  };
}

/**
 * 특정 턴이 연속 몇 번째 출전인지 계산.
 * 자신 포함, 그 앞 턴들을 거슬러 올라가 얼마나 연속으로 뛰었는지 카운트.
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

// ─── 학년 변환 ──────────────────────────────

const CLASS_ORDER: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

export function classToIndex(cls: ClassLevel): number {
  return CLASS_ORDER.indexOf(cls);
}

import type { Aptitudes } from "../types/character";
import { baseWinrate, finalWinrate } from "./winrate";
import type { Race } from "../types/race";

/**
 * 필터 상태를 반영한 캐릭터의 "실효 적성" 계산.
 * 필터 켠 축은 A로, 안 켠 축은 원본 등급.
 */
export function effectiveAptitudes(
  original: Aptitudes,
  filter: AptitudeFilter
): {
  turf: import("../types/character").AptitudeGrade;
  dirt: import("../types/character").AptitudeGrade;
  sprint: import("../types/character").AptitudeGrade;
  mile: import("../types/character").AptitudeGrade;
  medium: import("../types/character").AptitudeGrade;
  long: import("../types/character").AptitudeGrade;
} {
  const raise = (
    orig: import("../types/character").AptitudeGrade,
    on: boolean
  ) => (on && !isBOrBetter(orig) ? "A" : on ? bumpToA(orig) : orig);

  return {
    turf: raise(original.surface.turf, filter.turf),
    dirt: raise(original.surface.dirt, filter.dirt),
    sprint: raise(original.distance.sprint, filter.sprint),
    mile: raise(original.distance.mile, filter.mile),
    medium: raise(original.distance.medium, filter.medium),
    long: raise(original.distance.long, filter.long),
  };
}

function isBOrBetter(g: import("../types/character").AptitudeGrade): boolean {
  return g === "S" || g === "A" || g === "B";
}

// A 이상이 아니면 A로 올림 (B는 유지 안 하고 A로 올림)
function bumpToA(
  g: import("../types/character").AptitudeGrade
): import("../types/character").AptitudeGrade {
  return g === "S" ? "S" : "A";
}

/**
 * 특정 레이스에 대한 캐릭터의 승률 계산.
 * (연전 감점 포함)
 */
export function computeRaceWinrate(
  race: Race,
  effective: ReturnType<typeof effectiveAptitudes>,
  consecutiveCount: number
): number {
  const surfaceGrade = race.surface === "잔디" ? effective.turf : effective.dirt;

  let distanceGrade;
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