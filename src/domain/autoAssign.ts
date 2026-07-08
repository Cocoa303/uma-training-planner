import type { Character } from "../types/character";
import type { Race, ClassLevel } from "../types/race";
import type {
  PlannerState,
  SlotOwnership,
} from "./scheduler";
import type { FactorDef, FactorCondition } from "../types/factor";
import {
  effectiveAptitudes,
  computeRaceWinrate,
  countConsecutive,
  canOverwrite,
} from "./scheduler";
import { toTurnIndex } from "./turn";
import racesData from "../../data/races.json";

const allRaces = racesData as Race[];

// ─── 결과 타입 ─────────────────────────────

export interface AssignResult {
  success: boolean;
  assigned: { turnIndex: number; raceId: string }[];
  skippedCount?: number;
  reason?: string;
}

// ─── 옵션 ─────────────────────────────

export interface AutoAssignOptions {
  minWinrate: number;
}

const DEFAULT_OPTIONS: AutoAssignOptions = {
  minWinrate: 100,
};

// ─── 슬롯 후보 조회 ─────────────────────────

function findRaceSlots(
  raceName: string
): { turnIndex: number; race: Race }[] {
  const result: { turnIndex: number; race: Race }[] = [];
  for (const race of allRaces) {
    if (race.name !== raceName) continue;
    for (const cls of race.eligibleClasses) {
      const idx = toTurnIndex(cls, race.turn.month, race.turn.half);
      if (idx >= 0) result.push({ turnIndex: idx, race });
    }
  }
  return result;
}

function collectCandidates(
  raceNames: string[],
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>
): {
  turnIndex: number;
  race: Race;
  winrate: number;
}[] {
  const candidates: { turnIndex: number; race: Race; winrate: number }[] = [];

  for (const name of raceNames) {
    const slots = findRaceSlots(name);
    for (const { turnIndex, race } of slots) {
      const consecutiveCount = countConsecutive(
        { ...state.selections, [turnIndex]: race.id },
        turnIndex
      );
      const winrate = computeRaceWinrate(race, effective, consecutiveCount);
      candidates.push({ turnIndex, race, winrate });
    }
  }

  return candidates;
}

/**
 * 이 슬롯을 새 소유권이 사용할 수 있는가?
 * - 이번 iteration 에서 이미 사용한 슬롯이면 false
 * - 기존 소유권을 덮어쓸 수 있으면 true
 */
function canUseSlot(
  turnIndex: number,
  claimedThisIteration: Set<number>,
  state: PlannerState,
  newOwner: SlotOwnership
): boolean {
  if (claimedThisIteration.has(turnIndex)) return false;
  return canOverwrite(newOwner, state.ownerships[turnIndex]);
}

// ─── 핵심 배치 로직 ─────────────────────────

function assignForCondition(
  condition: FactorCondition,
  factorId: string,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): AssignResult {
  const newOwner: SlotOwnership = { kind: "hidden", factorId };

  switch (condition.kind) {
    case "race-wins":
      return assignAllRaces(condition.raceNames, newOwner, state, effective, options);
    case "race-wins-any":
      return assignAnyRace(condition.raceNames, newOwner, state, effective, options);
    case "race-wins-count":
      return assignCountRaces(
        condition.raceNames,
        condition.requiredCount,
        newOwner,
        state,
        effective,
        options,
        false
      );
    case "race-wins-count-unique":
      return assignCountRaces(
        condition.raceNames,
        condition.requiredCount,
        newOwner,
        state,
        effective,
        options,
        true
      );
    case "aptitude":
      return { success: false, assigned: [], reason: "적성 인자는 자동 배치 불가" };
    case "custom":
      return { success: false, assigned: [], reason: "custom handled elsewhere" };
    default:
      return { success: false, assigned: [] };
  }
}

function assignAllRaces(
  raceNames: string[],
  owner: SlotOwnership,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): AssignResult {
  const already = new Set(
    Object.entries(state.selections)
      .filter(([, id]) => id)
      .map(([, id]) => {
        const race = allRaces.find((r) => r.id === id);
        return race?.name;
      })
      .filter((n): n is string => !!n)
  );

  const assigned: { turnIndex: number; raceId: string }[] = [];
  const claimed = new Set<number>();

  for (const name of raceNames) {
    if (already.has(name)) continue;
    const candidates = collectCandidates([name], state, effective);
    const usable = candidates
      .filter((c) => canUseSlot(c.turnIndex, claimed, state, owner))
      .filter((c) => c.winrate >= options.minWinrate)
      .sort((a, b) => b.winrate - a.winrate);

    if (usable.length === 0) {
      return {
        success: false,
        assigned,
        reason: `"${name}" 배치할 슬롯이 없거나 승률 부족 (최소 ${options.minWinrate}%)`,
      };
    }
    const chosen = usable[0];
    assigned.push({ turnIndex: chosen.turnIndex, raceId: chosen.race.id });
    claimed.add(chosen.turnIndex);
  }

  return { success: true, assigned };
}

function assignAnyRace(
  raceNames: string[],
  owner: SlotOwnership,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): AssignResult {
  for (const [, id] of Object.entries(state.selections)) {
    if (!id) continue;
    const race = allRaces.find((r) => r.id === id);
    if (race && raceNames.includes(race.name)) {
      return { success: true, assigned: [] };
    }
  }

  const candidates = collectCandidates(raceNames, state, effective);
  const claimed = new Set<number>();
  const usable = candidates
    .filter((c) => canUseSlot(c.turnIndex, claimed, state, owner))
    .filter((c) => c.winrate >= options.minWinrate)
    .sort((a, b) => b.winrate - a.winrate);

  if (usable.length === 0) {
    return {
      success: false,
      assigned: [],
      reason: `배치 가능한 슬롯 없음 (최소 승률 ${options.minWinrate}%)`,
    };
  }

  const chosen = usable[0];
  return {
    success: true,
    assigned: [{ turnIndex: chosen.turnIndex, raceId: chosen.race.id }],
  };
}

function assignCountRaces(
  raceNames: string[],
  requiredCount: number,
  owner: SlotOwnership,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions,
  uniqueOnly: boolean
): AssignResult {
  const alreadyNames: string[] = [];
  for (const [, id] of Object.entries(state.selections)) {
    if (!id) continue;
    const race = allRaces.find((r) => r.id === id);
    if (race && raceNames.includes(race.name)) alreadyNames.push(race.name);
  }

  const alreadyCount = uniqueOnly
    ? new Set(alreadyNames).size
    : alreadyNames.length;

  const remaining = requiredCount - alreadyCount;
  if (remaining <= 0) {
    return { success: true, assigned: [] };
  }

  // 승률 순으로 정렬된 후보들
  const candidates = collectCandidates(raceNames, state, effective)
    .filter((c) => c.winrate >= options.minWinrate)
    .sort((a, b) => b.winrate - a.winrate);

  const chosen: { turnIndex: number; raceId: string }[] = [];
  const claimed = new Set<number>();
  const usedNames = new Set<string>(uniqueOnly ? alreadyNames : []);

  for (const cand of candidates) {
    if (chosen.length >= remaining) break;

    // 이번 iteration 에서 이미 이 슬롯 사용했으면 스킵
    if (claimed.has(cand.turnIndex)) continue;

    // 기존 소유권 덮어쓸 수 없으면 스킵
    if (!canOverwrite(owner, state.ownerships[cand.turnIndex])) continue;

    // unique 제약
    if (uniqueOnly && usedNames.has(cand.race.name)) continue;

    chosen.push({ turnIndex: cand.turnIndex, raceId: cand.race.id });
    claimed.add(cand.turnIndex);
    if (uniqueOnly) usedNames.add(cand.race.name);
  }

  if (chosen.length < remaining) {
    return {
      success: false,
      assigned: [],
      reason: `${chosen.length}/${remaining}개만 배치 가능 (최소 승률 ${options.minWinrate}%)`,
    };
  }

  return { success: true, assigned: chosen };
}

// ─── 커스텀 인자 자동 배치 ─────────────────────

interface CustomSpec {
  requiredWins: string[];
  groupOr: string[][];
}

const CUSTOM_SPECS: Record<string, CustomSpec> = {
  "perfect-crown": {
    requiredWins: ["사츠키상", "도쿄 우준 (일본 더비)", "국화상"],
    groupOr: [
      ["야요이상", "스프링 스테이크스", "새잎 스테이크스"],
      ["청엽상", "프린시펄 스테이크스"],
      ["고베 신문배", "세인트 라이트 기념"],
    ],
  },
  "perfect-tiara": {
    requiredWins: ["벚꽃상", "오크스", "추화상"],
    groupOr: [
      ["필리스 레뷰", "튤립상", "아네모네 스테이크스"],
      ["플로라 스테이크스", "스위트피 스테이크스"],
      ["로즈 스테이크스", "개미취 스테이크스"],
    ],
  },
};

function assignCustom(
  factorId: string,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): AssignResult {
  if (factorId === "all-class-champion") {
    return assignAllClassChampion(state, effective, options);
  }

  const spec = CUSTOM_SPECS[factorId];
  if (!spec) {
    return { success: false, assigned: [], reason: "자동 배치 미지원 인자" };
  }

  const owner: SlotOwnership = { kind: "hidden", factorId };
  const allAssigned: { turnIndex: number; raceId: string }[] = [];
  let workingState = state;

  const requiredResult = assignAllRaces(
    spec.requiredWins,
    owner,
    workingState,
    effective,
    options
  );
  if (!requiredResult.success) {
    return { success: false, assigned: [], reason: requiredResult.reason };
  }
  allAssigned.push(...requiredResult.assigned);
  workingState = applyAssignments(workingState, requiredResult.assigned, owner);

  for (let i = 0; i < spec.groupOr.length; i++) {
    const group = spec.groupOr[i];
    const groupResult = assignAnyRace(group, owner, workingState, effective, options);
    if (!groupResult.success) {
      return {
        success: false,
        assigned: [],
        reason: `${i + 1}번째 트라이얼 그룹 배치 실패`,
      };
    }
    allAssigned.push(...groupResult.assigned);
    workingState = applyAssignments(workingState, groupResult.assigned, owner);
  }

  return { success: true, assigned: allAssigned };
}

function assignAllClassChampion(
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): AssignResult {
  const g1Races = allRaces.filter((r) => r.grade === "G1" && !r.isOverseas);
  const categories = ["단거리", "마일", "중거리", "장거리"] as const;
  const owner: SlotOwnership = { kind: "hidden", factorId: "all-class-champion" };

  const alreadyCategories = new Set<string>();
  for (const [, id] of Object.entries(state.selections)) {
    if (!id) continue;
    const race = allRaces.find((r) => r.id === id);
    if (race && race.grade === "G1" && !race.isOverseas) {
      alreadyCategories.add(race.distanceCategory);
    }
  }

  const allAssigned: { turnIndex: number; raceId: string }[] = [];
  let workingState = state;

  for (const cat of categories) {
    if (alreadyCategories.has(cat)) continue;

    const catRaces = g1Races.filter((r) => r.distanceCategory === cat);
    const raceNames = catRaces.map((r) => r.name);
    const result = assignAnyRace(raceNames, owner, workingState, effective, options);

    if (!result.success) {
      return {
        success: false,
        assigned: [],
        reason: `${cat} G1 배치 실패`,
      };
    }
    allAssigned.push(...result.assigned);
    workingState = applyAssignments(workingState, result.assigned, owner);
  }

  return { success: true, assigned: allAssigned };
}

// ─── 상태 조작 헬퍼 ─────────────────────────

function applyAssignments(
  state: PlannerState,
  assignments: { turnIndex: number; raceId: string }[],
  owner: SlotOwnership
): PlannerState {
  const nextSelections = { ...state.selections };
  const nextOwnerships = { ...state.ownerships };
  for (const a of assignments) {
    nextSelections[a.turnIndex] = a.raceId;
    nextOwnerships[a.turnIndex] = owner;
  }
  return { ...state, selections: nextSelections, ownerships: nextOwnerships };
}

// ─── Public API ─────────────────────────────

export function autoAssignFactor(
  factor: FactorDef,
  state: PlannerState,
  character: Character,
  options: AutoAssignOptions = DEFAULT_OPTIONS
): { state: PlannerState; result: AssignResult } {
  const effective = effectiveAptitudes(character.aptitudes, state.filter);

  const cond = factor.condition;
  if (!cond) {
    return {
      state,
      result: { success: false, assigned: [], reason: "조건 없음" },
    };
  }

  const result =
    cond.kind === "custom"
      ? assignCustom(factor.id, state, effective, options)
      : assignForCondition(cond, factor.id, state, effective, options);

  if (!result.success) {
    return { state, result };
  }

  const newState = applyAssignments(state, result.assigned, {
    kind: "hidden",
    factorId: factor.id,
  });
  return { state: newState, result };
}

export function autoAssignG1(
  state: PlannerState,
  character: Character,
  options: AutoAssignOptions = DEFAULT_OPTIONS
): { state: PlannerState; result: AssignResult } {
  const effective = effectiveAptitudes(character.aptitudes, state.filter);
  const owner: SlotOwnership = { kind: "g1" };
  const g1Races = allRaces.filter((r) => r.grade === "G1" && !r.isOverseas);

  const candidates: { turnIndex: number; race: Race; winrate: number }[] = [];
  for (const race of g1Races) {
    for (const cls of race.eligibleClasses) {
      const idx = toTurnIndex(cls, race.turn.month, race.turn.half);
      if (idx < 0) continue;
      if (!canOverwrite(owner, state.ownerships[idx])) continue;

      const consec = countConsecutive(
        { ...state.selections, [idx]: race.id },
        idx
      );
      const winrate = computeRaceWinrate(race, effective, consec);
      if (winrate < options.minWinrate) continue;
      candidates.push({ turnIndex: idx, race, winrate });
    }
  }

  candidates.sort((a, b) => b.winrate - a.winrate);

  const chosen: { turnIndex: number; raceId: string }[] = [];
  const claimed = new Set<number>();

  for (const cand of candidates) {
    // 이번 iteration 에서 이미 이 슬롯 사용했으면 스킵
    if (claimed.has(cand.turnIndex)) continue;
    chosen.push({ turnIndex: cand.turnIndex, raceId: cand.race.id });
    claimed.add(cand.turnIndex);
  }

  if (chosen.length === 0) {
    return {
      state,
      result: {
        success: false,
        assigned: [],
        reason: `배치 가능한 G1 없음 (최소 승률 ${options.minWinrate}%)`,
      },
    };
  }

  const newState = applyAssignments(state, chosen, owner);
  return {
    state: newState,
    result: { success: true, assigned: chosen },
  };
}

// ─── 낮은 승률 슬롯 수집 (로그판용) ─────────

export interface LowWinrateEntry {
  turnIndex: number;
  race: Race;
  winrate: number;
  ownership: SlotOwnership | undefined;
  cls: ClassLevel;
  month: number;
  half: 1 | 2;
}

export function collectLowWinrateSlots(
  state: PlannerState,
  character: Character | null
): LowWinrateEntry[] {
  if (!character) return [];

  const effective = effectiveAptitudes(character.aptitudes, state.filter);
  const entries: LowWinrateEntry[] = [];

  for (const [key, raceId] of Object.entries(state.selections)) {
    if (!raceId) continue;
    const turnIndex = Number(key);
    const ownership = state.ownerships[turnIndex];
    if (ownership?.kind === "goal") continue;

    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;

    const consec = countConsecutive(state.selections, turnIndex);
    const winrate = computeRaceWinrate(race, effective, consec);
    if (winrate >= 100) continue;

    const { cls, month, half } = fromTurnIndexLocal(turnIndex);

    entries.push({
      turnIndex,
      race,
      winrate,
      ownership,
      cls,
      month,
      half,
    });
  }

  entries.sort((a, b) => a.turnIndex - b.turnIndex);
  return entries;
}

function fromTurnIndexLocal(index: number): {
  cls: ClassLevel;
  month: number;
  half: 1 | 2;
} {
  const CLASS_ORDER: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];
  const cls = CLASS_ORDER[Math.floor(index / 24)];
  const remainder = index % 24;
  const month = Math.floor(remainder / 2) + 1;
  const half = (remainder % 2 === 0 ? 1 : 2) as 1 | 2;
  return { cls, month, half };
}