import type { Character } from "../types/character";
import type { Race, RaceGrade, ClassLevel } from "../types/race";
import type {
  PlannerState,
  SlotOwnership,
  AptitudeFilter,
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
  failureDetails?: string[];
  relocatedInfo?: string[];
}

export interface OptimizeResult {
  success: boolean;
  assignedCount: number;
  restoredManualCount: number;
  droppedManualCount: number;
  filledEmptyCount: number;
  chosenFactorCount: number;
  totalScore: number;
  method: "exhaustive" | "greedy";
  elapsedMs: number;
  reason?: string;
}

export interface AutoAssignOptions {
  minWinrate: number;
}

const DEFAULT_OPTIONS: AutoAssignOptions = {
  minWinrate: 100,
};

// ─── 점수 상수 ─────────────────────────

const HIDDEN_FACTOR_SCORE_DEFAULT = 20;
const G1_SCORE = 10;
const DUPLICATE_NAME_PENALTY = -5;

/**
 * 특정 인자에 대한 점수 예외 처리.
 * - 퍼펙트 크라운: 트리플 크라운 조건을 포함하므로 2배
 * - 퍼펙트 티아라: 트리플 티아라 조건을 포함하므로 2배
 * - 전 계급 제패: G1 여러 개를 포함하므로 2배
 */
const HIDDEN_FACTOR_SCORE_MAP: Record<string, number> = {
  "perfect-crown": 40,
  "perfect-tiara": 40,
  "all-class-champion": 40,
};

function getFactorScore(factorId: string): number {
  return HIDDEN_FACTOR_SCORE_MAP[factorId] ?? HIDDEN_FACTOR_SCORE_DEFAULT;
}

const GRADE_SCORE_MAP: Record<RaceGrade, number> = {
  G1: 10,
  G2: 8,
  G3: 6,
  OP: 4,
  "Pre-OP": 2,
};

const EXHAUSTIVE_TIMEOUT_MS = 5000;

interface Candidate {
  turnIndex: number;
  race: Race;
  winrate: number;
}

// ─── 헬퍼: 조합 생성 ─────────────────────────

function forEachCombination(
  items: Candidate[],
  k: number,
  cb: (combo: Candidate[]) => void,
  maxIterations = 50000
): void {
  let iterations = 0;
  const n = items.length;
  const combo: Candidate[] = [];
  const usedSlots = new Set<number>();

  function recurse(start: number): boolean {
    if (iterations >= maxIterations) return false;

    if (combo.length === k) {
      iterations++;
      cb([...combo]);
      return true;
    }

    if (n - start < k - combo.length) return true;

    for (let i = start; i < n; i++) {
      const cand = items[i];
      if (usedSlots.has(cand.turnIndex)) continue;

      combo.push(cand);
      usedSlots.add(cand.turnIndex);
      const ok = recurse(i + 1);
      combo.pop();
      usedSlots.delete(cand.turnIndex);
      if (!ok) return false;
    }
    return true;
  }

  recurse(0);
}

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
): Candidate[] {
  const candidates: Candidate[] = [];

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

// ─── 슬롯 승률 스냅샷 ─────────────────────────

function snapshotWinrates(
  selections: PlannerState["selections"],
  ownerships: PlannerState["ownerships"],
  effective: ReturnType<typeof effectiveAptitudes>
): Map<number, number> {
  const snap = new Map<number, number>();

  for (const [key, raceId] of Object.entries(selections)) {
    if (!raceId) continue;
    const turnIndex = Number(key);
    const ownership = ownerships[turnIndex];
    if (ownership?.kind === "goal") continue;

    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;

    const consec = countConsecutive(selections, turnIndex);
    const winrate = computeRaceWinrate(race, effective, consec);
    snap.set(turnIndex, winrate);
  }

  return snap;
}

function wouldNotWorsenExistingSlots(
  beforeSelections: PlannerState["selections"],
  afterSelections: PlannerState["selections"],
  ownerships: PlannerState["ownerships"],
  effective: ReturnType<typeof effectiveAptitudes>,
  minWinrate: number
): boolean {
  const beforeSnap = snapshotWinrates(beforeSelections, ownerships, effective);

  for (const [key, raceId] of Object.entries(afterSelections)) {
    if (!raceId) continue;
    const turnIndex = Number(key);
    const ownership = ownerships[turnIndex];
    if (ownership?.kind === "goal") continue;

    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;

    const consec = countConsecutive(afterSelections, turnIndex);
    const afterWinrate = computeRaceWinrate(race, effective, consec);

    const beforeWinrate = beforeSnap.get(turnIndex);
    const isNewSlot = beforeWinrate === undefined;
    const wasAboveThreshold =
      beforeWinrate !== undefined && beforeWinrate >= minWinrate;

    if (isNewSlot) {
      if (afterWinrate < minWinrate) return false;
    } else if (wasAboveThreshold) {
      if (afterWinrate < minWinrate) return false;
    }
  }

  return true;
}

// ─── 로그 헬퍼 ─────────────────────────

const CLASS_ORDER_LOCAL: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

function turnIndexToLabel(index: number): string {
  const cls = CLASS_ORDER_LOCAL[Math.floor(index / 24)] ?? "?";
  const remainder = index % 24;
  const month = Math.floor(remainder / 2) + 1;
  const half = remainder % 2 === 0 ? "전반" : "후반";
  return `${cls.replace("급", "")} ${month}월 ${half}`;
}

function formatCandidateVerdict(
  cand: Candidate,
  state: PlannerState,
  owner: SlotOwnership,
  minWinrate: number
): { ok: boolean; text: string } {
  const slotLabel = turnIndexToLabel(cand.turnIndex);
  const raceLabel = `${cand.race.name} (${slotLabel})`;

  const existing = state.ownerships[cand.turnIndex];
  if (existing && !canOverwrite(owner, existing)) {
    const kindMap: Record<SlotOwnership["kind"], string> = {
      goal: "목표",
      hidden: "다른 인자",
      g1: "G1",
      manual: "수동 배치",
      filler: "자동 채움",
    };
    return {
      ok: false,
      text: `${raceLabel}: 슬롯 점유됨 (${kindMap[existing.kind]})`,
    };
  }

  const consec = countConsecutive(
    { ...state.selections, [cand.turnIndex]: cand.race.id },
    cand.turnIndex
  );
  const consecInfo = consec >= 3 ? ` (${consec}연전 감점)` : "";

  if (cand.winrate < minWinrate) {
    return {
      ok: false,
      text: `${raceLabel}: 승률 ${cand.winrate}%${consecInfo}`,
    };
  }

  return {
    ok: true,
    text: `${raceLabel}: 승률 ${cand.winrate}%${consecInfo} ✓`,
  };
}

function buildWinrateFailureDetails(
  beforeSelections: PlannerState["selections"],
  afterSelections: PlannerState["selections"],
  ownerships: PlannerState["ownerships"],
  effective: ReturnType<typeof effectiveAptitudes>,
  minWinrate: number,
  justAssigned: { turnIndex: number; raceId: string }[]
): string[] {
  const beforeSnap = snapshotWinrates(beforeSelections, ownerships, effective);
  const details: string[] = [];

  const newlyAdded = new Set(justAssigned.map((a) => a.turnIndex));

  const newSlots: string[] = [];
  for (const { turnIndex, raceId } of justAssigned) {
    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;
    const consec = countConsecutive(afterSelections, turnIndex);
    const wr = computeRaceWinrate(race, effective, consec);
    const consecInfo = consec >= 3 ? ` [${consec}연전]` : "";
    const mark = wr < minWinrate ? " ✗" : "";
    newSlots.push(
      `  ${race.name} (${turnIndexToLabel(turnIndex)}): ${wr}%${consecInfo}${mark}`
    );
  }
  if (newSlots.length > 0) {
    details.push("배치 시도:");
    details.push(...newSlots);
  }

  const worsened: string[] = [];
  for (const [key, raceId] of Object.entries(afterSelections)) {
    if (!raceId) continue;
    const turnIndex = Number(key);
    if (newlyAdded.has(turnIndex)) continue;

    const ownership = ownerships[turnIndex];
    if (ownership?.kind === "goal") continue;

    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;

    const consec = countConsecutive(afterSelections, turnIndex);
    const afterWr = computeRaceWinrate(race, effective, consec);
    const beforeWr = beforeSnap.get(turnIndex);

    if (beforeWr === undefined) continue;
    if (beforeWr >= minWinrate && afterWr < minWinrate) {
      const consecInfo = consec >= 3 ? ` [${consec}연전 감점]` : "";
      worsened.push(
        `  ${race.name} (${turnIndexToLabel(turnIndex)}): ${beforeWr}% → ${afterWr}%${consecInfo}`
      );
    }
  }

  if (worsened.length > 0) {
    details.push("영향받은 기존 슬롯:");
    details.push(...worsened);
  }

  return details;
}

// ─── 충돌 해결: 기존 인자 슬롯을 이동 ─────────────────────────

function tryRelocateSlotOccupant(
  turnIndex: number,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions
): { newState: PlannerState; moveDescription: string } | null {
  const existingOwnership = state.ownerships[turnIndex];
  const existingRaceId = state.selections[turnIndex];
  if (!existingOwnership || !existingRaceId) return null;

  if (existingOwnership.kind !== "hidden" && existingOwnership.kind !== "g1") {
    return null;
  }

  const existingRace = allRaces.find((r) => r.id === existingRaceId);
  if (!existingRace) return null;

  const alternatives: Candidate[] = [];

  const sameNameSlots = findRaceSlots(existingRace.name);
  for (const { turnIndex: altIdx, race } of sameNameSlots) {
    if (altIdx === turnIndex) continue;
    if (state.selections[altIdx]) continue;
    if (!canOverwrite(existingOwnership, state.ownerships[altIdx])) continue;

    const trialSelections = { ...state.selections };
    delete trialSelections[turnIndex];
    trialSelections[altIdx] = race.id;

    const consec = countConsecutive(trialSelections, altIdx);
    const winrate = computeRaceWinrate(race, effective, consec);
    if (winrate < options.minWinrate) continue;

    alternatives.push({ turnIndex: altIdx, race, winrate });
  }

  if (existingOwnership.kind === "g1" && alternatives.length === 0) {
    const g1Races = allRaces.filter(
      (r) => r.grade === "G1" && !r.isOverseas && r.id !== existingRace.id
    );
    for (const race of g1Races) {
      for (const cls of race.eligibleClasses) {
        const idx = toTurnIndex(cls, race.turn.month, race.turn.half);
        if (idx < 0) continue;
        if (idx === turnIndex) continue;
        if (state.selections[idx]) continue;
        if (!canOverwrite(existingOwnership, state.ownerships[idx])) continue;

        const trialSelections = { ...state.selections };
        delete trialSelections[turnIndex];
        trialSelections[idx] = race.id;

        const consec = countConsecutive(trialSelections, idx);
        const winrate = computeRaceWinrate(race, effective, consec);
        if (winrate < options.minWinrate) continue;

        alternatives.push({ turnIndex: idx, race, winrate });
      }
    }
  }

  if (alternatives.length === 0) return null;

  alternatives.sort((a, b) => b.winrate - a.winrate);

  for (const alt of alternatives) {
    const nextSelections = { ...state.selections };
    const nextOwnerships = { ...state.ownerships };
    delete nextSelections[turnIndex];
    delete nextOwnerships[turnIndex];
    nextSelections[alt.turnIndex] = alt.race.id;
    nextOwnerships[alt.turnIndex] = existingOwnership;

    if (
      !wouldNotWorsenExistingSlots(
        state.selections,
        nextSelections,
        nextOwnerships,
        effective,
        options.minWinrate
      )
    ) {
      continue;
    }

    const desc = `${existingRace.name} (${turnIndexToLabel(turnIndex)} → ${turnIndexToLabel(alt.turnIndex)})`;
    return {
      newState: { ...state, selections: nextSelections, ownerships: nextOwnerships },
      moveDescription: desc,
    };
  }

  return null;
}

// ─── 인자 조건 배치 ─────────────────────────

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
      return assignCountRacesOptimal(
        condition.raceNames,
        condition.requiredCount,
        newOwner,
        state,
        effective,
        options,
        false
      );
    case "race-wins-count-unique":
      return assignCountRacesOptimal(
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

function findSlotForRaceWithRelocation(
  raceName: string,
  owner: SlotOwnership,
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  options: AutoAssignOptions,
  claimed: Set<number>
): {
  state: PlannerState;
  assignment: { turnIndex: number; raceId: string };
  relocation?: string;
} | null {
  const candidates = collectCandidates([raceName], state, effective);
  if (candidates.length === 0) return null;

  const primaryUsable = candidates
    .filter((c) => !claimed.has(c.turnIndex))
    .filter((c) => canOverwrite(owner, state.ownerships[c.turnIndex]))
    .filter((c) => c.winrate >= options.minWinrate)
    .sort((a, b) => {
      const gradeDiff =
        (GRADE_SCORE_MAP[b.race.grade] ?? 0) - (GRADE_SCORE_MAP[a.race.grade] ?? 0);
      if (gradeDiff !== 0) return gradeDiff;
      return b.winrate - a.winrate;
    });

  if (primaryUsable.length > 0) {
    const chosen = primaryUsable[0];
    return {
      state,
      assignment: { turnIndex: chosen.turnIndex, raceId: chosen.race.id },
    };
  }

  const occupiedCandidates = candidates
    .filter((c) => !claimed.has(c.turnIndex))
    .filter((c) => c.winrate >= options.minWinrate)
    .filter((c) => {
      const existing = state.ownerships[c.turnIndex];
      return (
        existing &&
        (existing.kind === "hidden" || existing.kind === "g1") &&
        !canOverwrite(owner, existing)
      );
    })
    .sort((a, b) => {
      const gradeDiff =
        (GRADE_SCORE_MAP[b.race.grade] ?? 0) - (GRADE_SCORE_MAP[a.race.grade] ?? 0);
      if (gradeDiff !== 0) return gradeDiff;
      return b.winrate - a.winrate;
    });

  for (const cand of occupiedCandidates) {
    const relocation = tryRelocateSlotOccupant(cand.turnIndex, state, effective, options);
    if (relocation) {
      return {
        state: relocation.newState,
        assignment: { turnIndex: cand.turnIndex, raceId: cand.race.id },
        relocation: relocation.moveDescription,
      };
    }
  }

  return null;
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

  let workingState = state;
  const assigned: { turnIndex: number; raceId: string }[] = [];
  const claimed = new Set<number>();
  const failureDetails: string[] = [];
  const relocations: string[] = [];

  for (const name of raceNames) {
    if (already.has(name)) continue;

    const result = findSlotForRaceWithRelocation(
      name,
      owner,
      workingState,
      effective,
      options,
      claimed
    );

    if (!result) {
      const candidates = collectCandidates([name], workingState, effective);
      const verdicts = candidates.map((c) => ({
        cand: c,
        verdict: formatCandidateVerdict(c, workingState, owner, options.minWinrate),
      }));
      failureDetails.push(`"${name}" 후보 판정:`);
      for (const v of verdicts) {
        failureDetails.push(`  ${v.verdict.text}`);
      }
      return {
        success: false,
        assigned,
        reason: `"${name}" 배치할 슬롯이 없거나 승률 부족 (최소 ${options.minWinrate}%)`,
        failureDetails,
      };
    }

    workingState = result.state;
    assigned.push(result.assignment);
    claimed.add(result.assignment.turnIndex);
    if (result.relocation) relocations.push(result.relocation);
  }

  return {
    success: true,
    assigned,
    relocatedInfo: relocations.length > 0 ? relocations : undefined,
  };
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
  if (candidates.length === 0) {
    return {
      success: false,
      assigned: [],
      reason: `해당 레이스 개최 슬롯 없음`,
      failureDetails: [`후보 없음 (${raceNames.slice(0, 3).join(", ")}${raceNames.length > 3 ? "..." : ""})`],
    };
  }

  const verdicts = candidates.map((c) => ({
    cand: c,
    verdict: formatCandidateVerdict(c, state, owner, options.minWinrate),
  }));

  const usable = verdicts
    .filter((v) => v.verdict.ok)
    .sort((a, b) => {
      const gradeDiff =
        (GRADE_SCORE_MAP[b.cand.race.grade] ?? 0) - (GRADE_SCORE_MAP[a.cand.race.grade] ?? 0);
      if (gradeDiff !== 0) return gradeDiff;
      return b.cand.winrate - a.cand.winrate;
    });

  if (usable.length > 0) {
    const chosen = usable[0].cand;
    return {
      success: true,
      assigned: [{ turnIndex: chosen.turnIndex, raceId: chosen.race.id }],
    };
  }

  const occupiedUsable = candidates
    .filter((c) => c.winrate >= options.minWinrate)
    .filter((c) => {
      const existing = state.ownerships[c.turnIndex];
      return (
        existing &&
        (existing.kind === "hidden" || existing.kind === "g1") &&
        !canOverwrite(owner, existing)
      );
    })
    .sort((a, b) => {
      const gradeDiff =
        (GRADE_SCORE_MAP[b.race.grade] ?? 0) - (GRADE_SCORE_MAP[a.race.grade] ?? 0);
      if (gradeDiff !== 0) return gradeDiff;
      return b.winrate - a.winrate;
    });

  for (const cand of occupiedUsable) {
    const relocation = tryRelocateSlotOccupant(
      cand.turnIndex,
      state,
      effective,
      options
    );
    if (relocation) {
      return {
        success: true,
        assigned: [{ turnIndex: cand.turnIndex, raceId: cand.race.id }],
        relocatedInfo: [relocation.moveDescription],
      };
    }
  }

  const failureDetails: string[] = ["후보 판정:"];
  for (const v of verdicts) {
    failureDetails.push(`  ${v.verdict.text}`);
  }
  return {
    success: false,
    assigned: [],
    reason: `배치 가능한 슬롯 없음 (최소 승률 ${options.minWinrate}%)`,
    failureDetails,
  };
}

function combinationAvgWinrate(items: Candidate[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((s, i) => s + i.winrate, 0);
  return sum / items.length;
}

function combinationScoreForCountRaces(items: Candidate[]): number {
  const nameCount = new Map<string, number>();
  let baseScore = 0;

  for (const item of items) {
    baseScore += GRADE_SCORE_MAP[item.race.grade] ?? 0;
    nameCount.set(item.race.name, (nameCount.get(item.race.name) ?? 0) + 1);
  }

  let penalty = 0;
  for (const count of nameCount.values()) {
    if (count > 1) {
      penalty += DUPLICATE_NAME_PENALTY * ((count * (count - 1)) / 2);
    }
  }

  return baseScore + penalty;
}

function assignCountRacesOptimal(
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

  const rawCandidates = collectCandidates(raceNames, state, effective);
  const verdicts = rawCandidates.map((c) => ({
    cand: c,
    verdict: formatCandidateVerdict(c, state, owner, options.minWinrate),
  }));

  const candidates = verdicts.filter((v) => v.verdict.ok).map((v) => v.cand);

  if (candidates.length < remaining) {
    const failureDetails: string[] = [
      `${candidates.length}/${remaining}개만 배치 가능. 후보 판정:`,
    ];
    for (const v of verdicts) {
      failureDetails.push(`  ${v.verdict.text}`);
    }
    return {
      success: false,
      assigned: [],
      reason: `${candidates.length}/${remaining}개만 배치 가능 (최소 승률 ${options.minWinrate}%)`,
      failureDetails,
    };
  }

  let bestCombo: Candidate[] | null = null;
  let bestScore = -Infinity;
  let bestAvgWinrate = -Infinity;

  forEachCombination(candidates, remaining, (combo) => {
    if (uniqueOnly) {
      const names = new Set<string>(alreadyNames);
      let hasDup = false;
      for (const c of combo) {
        if (names.has(c.race.name)) {
          hasDup = true;
          break;
        }
        names.add(c.race.name);
      }
      if (hasDup) return;
    }

    const score = combinationScoreForCountRaces(combo);
    const avgWr = combinationAvgWinrate(combo);

    if (
      score > bestScore ||
      (score === bestScore && avgWr > bestAvgWinrate)
    ) {
      bestScore = score;
      bestAvgWinrate = avgWr;
      bestCombo = combo;
    }
  });

  if (!bestCombo) {
    return {
      success: false,
      assigned: [],
      reason: `조합 탐색 실패 (최소 승률 ${options.minWinrate}%)`,
    };
  }

  const combo = bestCombo as Candidate[];
  const assigned = combo.map((c) => ({
    turnIndex: c.turnIndex,
    raceId: c.race.id,
  }));

  return { success: true, assigned };
}

// ─── 커스텀 인자 ─────────────────────────

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
  const allRelocations: string[] = [];
  let workingState = state;

  const requiredResult = assignAllRaces(
    spec.requiredWins,
    owner,
    workingState,
    effective,
    options
  );
  if (!requiredResult.success) {
    return {
      success: false,
      assigned: [],
      reason: requiredResult.reason,
      failureDetails: requiredResult.failureDetails,
    };
  }
  allAssigned.push(...requiredResult.assigned);
  if (requiredResult.relocatedInfo) allRelocations.push(...requiredResult.relocatedInfo);
  workingState = applyAssignments(workingState, requiredResult.assigned, owner);

  for (let i = 0; i < spec.groupOr.length; i++) {
    const group = spec.groupOr[i];
    const groupResult = assignAnyRace(group, owner, workingState, effective, options);
    if (!groupResult.success) {
      return {
        success: false,
        assigned: [],
        reason: `${i + 1}번째 트라이얼 그룹 배치 실패`,
        failureDetails: [`${i + 1}번째 트라이얼:`, ...(groupResult.failureDetails ?? [])],
      };
    }
    allAssigned.push(...groupResult.assigned);
    if (groupResult.relocatedInfo) allRelocations.push(...groupResult.relocatedInfo);
    workingState = applyAssignments(workingState, groupResult.assigned, owner);
  }

  return {
    success: true,
    assigned: allAssigned,
    relocatedInfo: allRelocations.length > 0 ? allRelocations : undefined,
  };
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
  const allRelocations: string[] = [];
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
        failureDetails: [`${cat} G1:`, ...(result.failureDetails ?? [])],
      };
    }
    allAssigned.push(...result.assigned);
    if (result.relocatedInfo) allRelocations.push(...result.relocatedInfo);
    workingState = applyAssignments(workingState, result.assigned, owner);
  }

  return {
    success: true,
    assigned: allAssigned,
    relocatedInfo: allRelocations.length > 0 ? allRelocations : undefined,
  };
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

// ─── Public API: 단일 인자 배치 ─────────────

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

  if (result.relocatedInfo && result.relocatedInfo.length > 0) {
    const rebuiltState = rebuildStateWithRelocations(
      state,
      result.assigned,
      result.relocatedInfo,
      factor.id
    );

    if (!wouldNotWorsenExistingSlots(
      state.selections,
      rebuiltState.selections,
      rebuiltState.ownerships,
      effective,
      options.minWinrate
    )) {
      const details = buildWinrateFailureDetails(
        state.selections,
        rebuiltState.selections,
        rebuiltState.ownerships,
        effective,
        options.minWinrate,
        result.assigned
      );
      return {
        state,
        result: {
          success: false,
          assigned: [],
          reason: `배치 시 기존 슬롯의 승률이 최소 ${options.minWinrate}% 아래로 떨어짐`,
          failureDetails: details.length > 0 ? details : undefined,
        },
      };
    }

    return { state: rebuiltState, result };
  }

  const newState = applyAssignments(state, result.assigned, {
    kind: "hidden",
    factorId: factor.id,
  });

  if (!wouldNotWorsenExistingSlots(
    state.selections,
    newState.selections,
    newState.ownerships,
    effective,
    options.minWinrate
  )) {
    const details = buildWinrateFailureDetails(
      state.selections,
      newState.selections,
      newState.ownerships,
      effective,
      options.minWinrate,
      result.assigned
    );

    return {
      state,
      result: {
        success: false,
        assigned: [],
        reason: `배치 시 기존 슬롯의 승률이 최소 ${options.minWinrate}% 아래로 떨어짐`,
        failureDetails: details.length > 0 ? details : undefined,
      },
    };
  }

  return { state: newState, result };
}

function rebuildStateWithRelocations(
  originalState: PlannerState,
  newAssignments: { turnIndex: number; raceId: string }[],
  relocations: string[],
  newFactorId: string
): PlannerState {
  let workingState = originalState;

  for (const relocDesc of relocations) {
    const match = relocDesc.match(/^(.+?) \((.+?) → (.+?)\)$/);
    if (!match) continue;

    const [, raceName, fromLabel, toLabel] = match;
    const fromIdx = labelToTurnIndex(fromLabel);
    const toIdx = labelToTurnIndex(toLabel);
    if (fromIdx < 0 || toIdx < 0) continue;

    const raceId = workingState.selections[fromIdx];
    const ownership = workingState.ownerships[fromIdx];
    if (!raceId || !ownership) continue;

    const targetRace = allRaces.find((r) => {
      if (r.name !== raceName) return false;
      for (const cls of r.eligibleClasses) {
        if (toTurnIndex(cls, r.turn.month, r.turn.half) === toIdx) return true;
      }
      return false;
    });
    if (!targetRace) continue;

    const nextSelections = { ...workingState.selections };
    const nextOwnerships = { ...workingState.ownerships };
    delete nextSelections[fromIdx];
    delete nextOwnerships[fromIdx];
    nextSelections[toIdx] = targetRace.id;
    nextOwnerships[toIdx] = ownership;

    workingState = {
      ...workingState,
      selections: nextSelections,
      ownerships: nextOwnerships,
    };
  }

  workingState = applyAssignments(workingState, newAssignments, {
    kind: "hidden",
    factorId: newFactorId,
  });

  return workingState;
}

function labelToTurnIndex(label: string): number {
  const match = label.match(/^(주니어|클래식|시니어)\s+(\d+)월\s+(전반|후반)$/);
  if (!match) return -1;
  const [, clsShort, monthStr, halfStr] = match;
  const classMap: Record<string, ClassLevel> = {
    주니어: "주니어급",
    클래식: "클래식급",
    시니어: "시니어급",
  };
  const cls = classMap[clsShort];
  if (!cls) return -1;
  const month = parseInt(monthStr, 10);
  const half = halfStr === "전반" ? 1 : 2;
  return toTurnIndex(cls, month, half);
}

// ─── Public API: G1 자동 배치 ─────────────

export function autoAssignG1(
  state: PlannerState,
  character: Character,
  options: AutoAssignOptions = DEFAULT_OPTIONS
): { state: PlannerState; result: AssignResult } {
  const effective = effectiveAptitudes(character.aptitudes, state.filter);
  const owner: SlotOwnership = { kind: "g1" };
  const g1Races = allRaces.filter((r) => r.grade === "G1" && !r.isOverseas);

  const initialCandidates: { turnIndex: number; race: Race; initialWinrate: number }[] = [];
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

      initialCandidates.push({ turnIndex: idx, race, initialWinrate: winrate });
    }
  }

  initialCandidates.sort((a, b) => {
    if (b.initialWinrate !== a.initialWinrate) return b.initialWinrate - a.initialWinrate;
    return a.turnIndex - b.turnIndex;
  });

  const chosen: { turnIndex: number; raceId: string }[] = [];
  let workingState = state;
  let skippedCount = 0;

  for (const cand of initialCandidates) {
    if (chosen.some((c) => c.turnIndex === cand.turnIndex)) continue;

    const trialSelections = { ...workingState.selections, [cand.turnIndex]: cand.race.id };
    const trialOwnerships = { ...workingState.ownerships, [cand.turnIndex]: owner };

    if (
      !wouldNotWorsenExistingSlots(
        workingState.selections,
        trialSelections,
        trialOwnerships,
        effective,
        options.minWinrate
      )
    ) {
      skippedCount++;
      continue;
    }

    chosen.push({ turnIndex: cand.turnIndex, raceId: cand.race.id });
    workingState = applyAssignments(
      workingState,
      [{ turnIndex: cand.turnIndex, raceId: cand.race.id }],
      owner
    );
  }

  if (chosen.length === 0) {
    return {
      state,
      result: {
        success: false,
        assigned: [],
        reason: `배치 가능한 G1 없음 (최소 승률 ${options.minWinrate}%)`,
        skippedCount,
      },
    };
  }

  return {
    state: workingState,
    result: { success: true, assigned: chosen, skippedCount },
  };
}

// ─── 최적화용: 상태 점수 계산 ─────────────

function calculateG1AndPenaltyScore(state: PlannerState): number {
  let score = 0;
  const nameCount = new Map<string, number>();

  for (const [, raceId] of Object.entries(state.selections)) {
    if (!raceId) continue;
    const race = allRaces.find((r) => r.id === raceId);
    if (!race) continue;

    if (race.grade === "G1") score += G1_SCORE;

    nameCount.set(race.name, (nameCount.get(race.name) ?? 0) + 1);
  }

  for (const count of nameCount.values()) {
    if (count > 1) {
      score += DUPLICATE_NAME_PENALTY * ((count * (count - 1)) / 2);
    }
  }

  return score;
}

/**
 * 상태의 hidden 인자 점수 합계 (인자 종류별 가중치 반영).
 */
function calculateHiddenFactorScore(state: PlannerState): number {
  const factorIds = new Set<string>();
  for (const [, ownership] of Object.entries(state.ownerships)) {
    if (ownership?.kind === "hidden") {
      factorIds.add(ownership.factorId);
    }
  }
  let sum = 0;
  for (const id of factorIds) sum += getFactorScore(id);
  return sum;
}

// ─── 빈 슬롯 채우기 ─────────

const MAX_TURN_INDEX = 72;

function fillEmptySlots(
  state: PlannerState,
  effective: ReturnType<typeof effectiveAptitudes>,
  _filter: AptitudeFilter,
  options: AutoAssignOptions
): { state: PlannerState; filledCount: number } {
  let workingState = state;
  let filledCount = 0;
  const owner: SlotOwnership = { kind: "filler" };

  const raceByTurn = new Map<number, Race[]>();
  for (const race of allRaces) {
    if (race.isOverseas) continue;
    for (const cls of race.eligibleClasses) {
      const idx = toTurnIndex(cls, race.turn.month, race.turn.half);
      if (idx < 0) continue;
      const list = raceByTurn.get(idx) ?? [];
      list.push(race);
      raceByTurn.set(idx, list);
    }
  }

  for (let turnIdx = 0; turnIdx < MAX_TURN_INDEX; turnIdx++) {
    if (workingState.selections[turnIdx]) continue;

    const races = raceByTurn.get(turnIdx);
    if (!races || races.length === 0) continue;

    const candidates: Candidate[] = [];
    for (const race of races) {
      const trialSelections = {
        ...workingState.selections,
        [turnIdx]: race.id,
      };
      const consec = countConsecutive(trialSelections, turnIdx);
      const winrate = computeRaceWinrate(race, effective, consec);
      if (winrate < options.minWinrate) continue;

      candidates.push({ turnIndex: turnIdx, race, winrate });
    }

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const dupA = countExistingName(a.race.name, workingState) > 0 ? DUPLICATE_NAME_PENALTY : 0;
      const dupB = countExistingName(b.race.name, workingState) > 0 ? DUPLICATE_NAME_PENALTY : 0;
      const scoreA = (GRADE_SCORE_MAP[a.race.grade] ?? 0) + dupA;
      const scoreB = (GRADE_SCORE_MAP[b.race.grade] ?? 0) + dupB;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.winrate - a.winrate;
    });

    for (const cand of candidates) {
      const trialSelections = {
        ...workingState.selections,
        [turnIdx]: cand.race.id,
      };
      const trialOwnerships = {
        ...workingState.ownerships,
        [turnIdx]: owner,
      };

      if (
        wouldNotWorsenExistingSlots(
          workingState.selections,
          trialSelections,
          trialOwnerships,
          effective,
          options.minWinrate
        )
      ) {
        workingState = applyAssignments(
          workingState,
          [{ turnIndex: turnIdx, raceId: cand.race.id }],
          owner
        );
        filledCount++;
        break;
      }
    }
  }

  return { state: workingState, filledCount };
}

function countExistingName(name: string, state: PlannerState): number {
  let count = 0;
  for (const [, raceId] of Object.entries(state.selections)) {
    if (!raceId) continue;
    const race = allRaces.find((r) => r.id === raceId);
    if (race && race.name === name) count++;
  }
  return count;
}

// ─── 최적화 실행 ─────────────

export function runOptimization(
  state: PlannerState,
  character: Character,
  factorMap: Map<string, FactorDef>,
  options: AutoAssignOptions = DEFAULT_OPTIONS
): { state: PlannerState; result: OptimizeResult } {
  const startTime = Date.now();
  const effective = effectiveAptitudes(character.aptitudes, state.filter);

  const activeFactorIds = new Set<string>();
  const manualBackup: { turnIndex: number; raceId: string }[] = [];

  for (const [key, ownership] of Object.entries(state.ownerships)) {
    if (!ownership) continue;
    const turnIndex = Number(key);

    if (ownership.kind === "hidden") {
      activeFactorIds.add(ownership.factorId);
    } else if (ownership.kind === "manual") {
      const raceId = state.selections[turnIndex];
      if (raceId) {
        manualBackup.push({ turnIndex, raceId });
      }
    }
  }

  let baseState: PlannerState = {
    ...state,
    selections: {},
    ownerships: {},
  };
  for (const [key, ownership] of Object.entries(state.ownerships)) {
    if (ownership?.kind === "goal") {
      const turnIndex = Number(key);
      const raceId = state.selections[turnIndex];
      if (raceId) {
        baseState.selections[turnIndex] = raceId;
        baseState.ownerships[turnIndex] = { kind: "goal" };
      }
    }
  }

  let mandatoryState = baseState;
  const mandatorySuccess: string[] = [];
  const mandatoryFail: string[] = [];

  for (const factorId of activeFactorIds) {
    const factor = factorMap.get(factorId);
    if (!factor) continue;

    const { state: nextState, result } = autoAssignFactor(
      factor,
      mandatoryState,
      character,
      options
    );
    if (result.success) {
      mandatoryState = nextState;
      mandatorySuccess.push(factor.name);
    } else {
      mandatoryFail.push(factor.name);
    }
  }

  const otherFactors: FactorDef[] = [];
  for (const factor of factorMap.values()) {
    if (activeFactorIds.has(factor.id)) continue;
    if (factor.category !== "hidden") continue;
    if (!factor.condition) continue;
    if (factor.condition.kind === "aptitude") continue;

    if (factor.characterIds && factor.characterIds.length > 0) {
      if (!factor.characterIds.includes(character.id)) continue;
    }

    otherFactors.push(factor);
  }

  const { chosenIds, method, timedOut } = findBestFactorCombination(
    otherFactors,
    mandatoryState,
    character,
    options,
    startTime
  );

  let workingState = mandatoryState;
  let chosenFactorCount = mandatorySuccess.length;
  for (const factorId of chosenIds) {
    const factor = factorMap.get(factorId);
    if (!factor) continue;
    const { state: nextState, result } = autoAssignFactor(
      factor,
      workingState,
      character,
      options
    );
    if (result.success) {
      workingState = nextState;
      chosenFactorCount++;
    }
  }

  const { state: afterG1 } = autoAssignG1(workingState, character, options);
  workingState = afterG1;

  let restoredManualCount = 0;
  let droppedManualCount = 0;
  for (const backup of manualBackup) {
    if (workingState.selections[backup.turnIndex] !== undefined) {
      droppedManualCount++;
      continue;
    }

    const trialSelections = {
      ...workingState.selections,
      [backup.turnIndex]: backup.raceId,
    };
    const trialOwnerships = {
      ...workingState.ownerships,
      [backup.turnIndex]: { kind: "manual" } as SlotOwnership,
    };

    if (
      wouldNotWorsenExistingSlots(
        workingState.selections,
        trialSelections,
        trialOwnerships,
        effective,
        options.minWinrate
      )
    ) {
      workingState = {
        ...workingState,
        selections: trialSelections,
        ownerships: trialOwnerships,
      };
      restoredManualCount++;
    } else {
      droppedManualCount++;
    }
  }

  const fillResult = fillEmptySlots(workingState, effective, state.filter, options);
  workingState = fillResult.state;
  const filledEmptyCount = fillResult.filledCount;

  const g1AndPenalty = calculateG1AndPenaltyScore(workingState);
  const factorScore = calculateHiddenFactorScore(workingState);
  const totalScore = g1AndPenalty + factorScore;

  const elapsedMs = Date.now() - startTime;

  const reasons: string[] = [];
  if (mandatoryFail.length > 0) {
    reasons.push(`활성 인자 배치 실패: ${mandatoryFail.join(", ")}`);
  }
  if (timedOut) {
    reasons.push("완전 탐색 시간 초과 → 그리디 사용");
  }

  return {
    state: workingState,
    result: {
      success: true,
      assignedCount: 0,
      restoredManualCount,
      droppedManualCount,
      filledEmptyCount,
      chosenFactorCount,
      totalScore,
      method,
      elapsedMs,
      reason: reasons.length > 0 ? reasons.join(" / ") : undefined,
    },
  };
}

function findBestFactorCombination(
  candidates: FactorDef[],
  baseState: PlannerState,
  character: Character,
  options: AutoAssignOptions,
  startTime: number
): { chosenIds: string[]; method: "exhaustive" | "greedy"; timedOut: boolean } {
  const n = candidates.length;

  if (n === 0) {
    return { chosenIds: [], method: "exhaustive", timedOut: false };
  }

  const feasibleFactors: FactorDef[] = [];
  for (const factor of candidates) {
    if (Date.now() - startTime > EXHAUSTIVE_TIMEOUT_MS) break;
    const { result } = autoAssignFactor(factor, baseState, character, options);
    if (result.success) {
      feasibleFactors.push(factor);
    }
  }

  if (feasibleFactors.length === 0) {
    return { chosenIds: [], method: "exhaustive", timedOut: false };
  }

  const fN = feasibleFactors.length;

  if (fN > 20) {
    return {
      chosenIds: greedySelect(feasibleFactors, baseState, character, options),
      method: "greedy",
      timedOut: false,
    };
  }

  let bestScore = -Infinity;
  let bestSubset: FactorDef[] = [];
  let timedOut = false;

  const totalCombos = 1 << fN;
  for (let mask = 0; mask < totalCombos; mask++) {
    if (Date.now() - startTime > EXHAUSTIVE_TIMEOUT_MS) {
      timedOut = true;
      break;
    }

    const subset: FactorDef[] = [];
    for (let i = 0; i < fN; i++) {
      if (mask & (1 << i)) subset.push(feasibleFactors[i]);
    }

    let trialState = baseState;
    let allOk = true;
    for (const factor of subset) {
      const { state: nextState, result } = autoAssignFactor(
        factor,
        trialState,
        character,
        options
      );
      if (!result.success) {
        allOk = false;
        break;
      }
      trialState = nextState;
    }
    if (!allOk) continue;

    // 인자별 점수 (예외 처리 반영)
    let subsetFactorScore = 0;
    for (const f of subset) subsetFactorScore += getFactorScore(f.id);

    const emptySlots = countEmptySlots(trialState);
    const estG1Score = Math.min(emptySlots, 24) * G1_SCORE * 0.5;
    const penalty = calculateG1AndPenaltyScore(trialState);
    const totalScore = subsetFactorScore + estG1Score + penalty;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSubset = subset;
    }
  }

  if (timedOut && bestSubset.length === 0) {
    return {
      chosenIds: greedySelect(feasibleFactors, baseState, character, options),
      method: "greedy",
      timedOut: true,
    };
  }

  return {
    chosenIds: bestSubset.map((f) => f.id),
    method: timedOut ? "greedy" : "exhaustive",
    timedOut,
  };
}

function greedySelect(
  factors: FactorDef[],
  baseState: PlannerState,
  character: Character,
  options: AutoAssignOptions
): string[] {
  const withEfficiency = factors.map((f) => {
    const { result } = autoAssignFactor(f, baseState, character, options);
    const slotsNeeded = result.success ? result.assigned.length : Infinity;
    // 효율: 인자별 점수 / 필요 슬롯 수
    const efficiency = slotsNeeded > 0 ? getFactorScore(f.id) / slotsNeeded : 0;
    return { factor: f, efficiency, slotsNeeded };
  });

  withEfficiency.sort((a, b) => b.efficiency - a.efficiency);

  const chosen: string[] = [];
  let workingState = baseState;

  for (const { factor } of withEfficiency) {
    const { state: nextState, result } = autoAssignFactor(
      factor,
      workingState,
      character,
      options
    );
    if (result.success) {
      workingState = nextState;
      chosen.push(factor.id);
    }
  }

  return chosen;
}

function countEmptySlots(state: PlannerState): number {
  let count = 0;
  for (let i = 0; i < MAX_TURN_INDEX; i++) {
    if (!state.selections[i]) count++;
  }
  return count;
}

// ─── 낮은 승률 슬롯 수집 ─────────

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