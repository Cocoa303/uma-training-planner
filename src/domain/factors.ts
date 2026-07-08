import type { Character, AptitudeGrade } from "../types/character";
import type { Race } from "../types/race";
import type { SlotSelections, AptitudeFilter } from "./scheduler";
import type { FactorDef, FactorStatus } from "../types/factor";
import { effectiveAptitudes } from "./scheduler";
import racesData from "../../data/races.json";
import factorsData from "../../data/factors.json";

const allRaces = racesData as Race[];

interface FactorsFile {
  nickname: FactorDef[];
  hidden: FactorDef[];
}

const factors = factorsData as unknown as FactorsFile;

// ─── G1 인자 자동 생성 ─────────────────────

export function getG1Factors(): FactorDef[] {
  const g1Races = allRaces.filter((r) => r.grade === "G1" && !r.isOverseas);
  return g1Races.map((r) => ({
    id: `g1-${r.id}`,
    category: "g1" as const,
    name: r.name,
    description: `${r.venue} · ${r.surface} · ${r.distance}m`,
    condition: { kind: "race-wins" as const, raceNames: [r.name] },
  }));
}

// ─── 스케줄에 포함된 레이스 이름 목록 ───────

/**
 * 유저가 선택한 슬롯 + 캐릭터의 목표 레이스 (자동 잠금).
 * 카운트 조건을 위해 배열로 반환 (중복 포함).
 */
function getScheduledRaceNames(
  selections: SlotSelections,
  character: Character | null
): string[] {
  const names: string[] = [];

  for (const raceId of Object.values(selections)) {
    if (!raceId) continue;
    const race = allRaces.find((r) => r.id === raceId);
    if (race) names.push(race.name);
  }
  if (character) {
    for (const goal of character.trainingGoals) {
      if (goal.raceName) names.push(goal.raceName);
    }
  }

  return names;
}

// ─── 인자 상태 계산 ─────────────────────────

export function computeFactorStatuses(
  selections: SlotSelections,
  character: Character | null,
  filter: AptitudeFilter
): {
  nickname: FactorStatus[];
  hidden: FactorStatus[];
  g1: FactorStatus[];
} {
  const scheduledNames = getScheduledRaceNames(selections, character);
  const nameCounts = countByName(scheduledNames);
  const uniqueNames = new Set(scheduledNames);

  const effective = character
    ? effectiveAptitudes(character.aptitudes, filter)
    : null;

  const styleAptitudes = character?.aptitudes.style ?? null;

  const context: EvalContext = {
    scheduledNames,
    nameCounts,
    uniqueNames,
    effective,
    styleAptitudes,
  };

  return {
    nickname: factors.nickname.map((f) => evaluateFactor(f, context)),
    hidden: factors.hidden.map((f) => evaluateFactor(f, context)),
    g1: getG1Factors().map((f) => evaluateFactor(f, context)),
  };
}

function countByName(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of names) {
    map.set(n, (map.get(n) ?? 0) + 1);
  }
  return map;
}

// ─── 조건 평가 ─────────────────────────────

interface EvalContext {
  scheduledNames: string[];
  nameCounts: Map<string, number>;
  uniqueNames: Set<string>;
  effective: ReturnType<typeof effectiveAptitudes> | null;
  styleAptitudes: {
    runner: AptitudeGrade;
    leader: AptitudeGrade;
    betweener: AptitudeGrade;
    chaser: AptitudeGrade;
  } | null;
}

function evaluateFactor(factor: FactorDef, ctx: EvalContext): FactorStatus {
  const cond = factor.condition;

  if (!cond) {
    return { factor, satisfied: false };
  }

  switch (cond.kind) {
    case "race-wins": {
      // 모든 레이스 우승
      const wonCount = cond.raceNames.filter((n) => ctx.uniqueNames.has(n)).length;
      const total = cond.raceNames.length;
      return {
        factor,
        satisfied: wonCount === total,
        progress: { current: wonCount, total },
        detail: total > 1 ? `${wonCount}/${total}` : undefined,
      };
    }

    case "race-wins-any": {
      // 하나라도 우승
      const anyWon = cond.raceNames.some((n) => ctx.uniqueNames.has(n));
      return {
        factor,
        satisfied: anyWon,
        detail: anyWon ? "충족" : "0/1",
      };
    }

    case "race-wins-count": {
      // N회 이상 우승 (중복 카운트)
      const totalWins = cond.raceNames.reduce(
        (sum, n) => sum + (ctx.nameCounts.get(n) ?? 0),
        0
      );
      const required = cond.requiredCount;
      return {
        factor,
        satisfied: totalWins >= required,
        progress: { current: Math.min(totalWins, required), total: required },
        detail: `${totalWins}/${required}`,
      };
    }

    case "race-wins-count-unique": {
      // N개 이상 서로 다른 종류 우승
      const uniqueWonCount = cond.raceNames.filter((n) =>
        ctx.uniqueNames.has(n)
      ).length;
      const required = cond.requiredCount;
      return {
        factor,
        satisfied: uniqueWonCount >= required,
        progress: {
          current: Math.min(uniqueWonCount, required),
          total: required,
        },
        detail: `${uniqueWonCount}/${required}`,
      };
    }

    case "aptitude": {
      return evaluateAptitude(factor, cond.check, ctx);
    }

    case "custom": {
      return evaluateCustom(factor, ctx);
    }

    default:
      return { factor, satisfied: false, detail: "미구현" };
  }
}

// ─── 적성 조건 평가 ─────────────────────────

function evaluateAptitude(
  factor: FactorDef,
  check: string,
  ctx: EvalContext
): FactorStatus {
  if (!ctx.effective || !ctx.styleAptitudes) {
    return { factor, satisfied: false, detail: "캐릭터 없음" };
  }

  const isAOrBetter = (g: AptitudeGrade) => g === "S" || g === "A";

  switch (check) {
    case "surface-both-a": {
      const ok = isAOrBetter(ctx.effective.turf) && isAOrBetter(ctx.effective.dirt);
      return { factor, satisfied: ok, detail: ok ? "충족" : "잔디/더트 A 필요" };
    }

    case "style-all-a": {
      const s = ctx.styleAptitudes;
      const ok =
        isAOrBetter(s.runner) &&
        isAOrBetter(s.leader) &&
        isAOrBetter(s.betweener) &&
        isAOrBetter(s.chaser);
      return { factor, satisfied: ok, detail: ok ? "충족" : "모든 각질 A 필요" };
    }

    case "distance-all-a": {
      const e = ctx.effective;
      const ok =
        isAOrBetter(e.sprint) &&
        isAOrBetter(e.mile) &&
        isAOrBetter(e.medium) &&
        isAOrBetter(e.long);
      return { factor, satisfied: ok, detail: ok ? "충족" : "모든 거리 A 필요" };
    }

    default:
      return { factor, satisfied: false, detail: "미구현 적성" };
  }
}

// ─── 커스텀 조건 평가 ───────────────────────

/**
 * 인자 ID 별 커스텀 로직.
 * factors.json 의 condition.kind = "custom" 인 것들은 여기서 개별 처리.
 */
function evaluateCustom(factor: FactorDef, ctx: EvalContext): FactorStatus {
  switch (factor.id) {
    case "all-class-champion":
      return evaluateAllClassChampion(factor, ctx);

    case "perfect-crown":
      return evaluatePerfectCrown(factor, ctx);

    case "perfect-tiara":
      return evaluatePerfectTiara(factor, ctx);

    default:
      return { factor, satisfied: false, detail: "미구현" };
  }
}

/**
 * 전 계급 제패: 단/마일/중/장 G1 각 1회 이상 우승.
 */
function evaluateAllClassChampion(
  factor: FactorDef,
  ctx: EvalContext
): FactorStatus {
  const g1Races = allRaces.filter((r) => r.grade === "G1" && !r.isOverseas);

  const categories = ["단거리", "마일", "중거리", "장거리"] as const;
  const wonCategories = new Set<string>();

  for (const name of ctx.uniqueNames) {
    const race = g1Races.find((r) => r.name === name);
    if (race) wonCategories.add(race.distanceCategory);
  }

  const wonCount = categories.filter((c) => wonCategories.has(c)).length;
  return {
    factor,
    satisfied: wonCount === 4,
    progress: { current: wonCount, total: 4 },
    detail: `${wonCount}/4 계급`,
  };
}

/**
 * 퍼펙트 크라운: 수말 삼관 + 트라이얼 3그룹 (그룹별 OR)
 */
function evaluatePerfectCrown(
  factor: FactorDef,
  ctx: EvalContext
): FactorStatus {
  const triple = ["사츠키상", "도쿄 우준 (일본 더비)", "국화상"];
  const group1 = ["야요이상", "스프링 스테이크스", "새잎 스테이크스"];
  const group2 = ["청엽상", "프린시펄 스테이크스"];
  const group3 = ["고베 신문배", "세인트 라이트 기념"];

  const tripleWon = triple.filter((n) => ctx.uniqueNames.has(n)).length;
  const g1Won = group1.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;
  const g2Won = group2.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;
  const g3Won = group3.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;

  const totalDone = tripleWon + g1Won + g2Won + g3Won;
  const satisfied = tripleWon === 3 && g1Won === 1 && g2Won === 1 && g3Won === 1;

  return {
    factor,
    satisfied,
    progress: { current: totalDone, total: 6 },
    detail: satisfied
      ? "충족"
      : `삼관 ${tripleWon}/3, 트라이얼 ${g1Won + g2Won + g3Won}/3`,
  };
}

/**
 * 퍼펙트 티아라: 암말 삼관 + 트라이얼 3그룹 (그룹별 OR)
 */
function evaluatePerfectTiara(
  factor: FactorDef,
  ctx: EvalContext
): FactorStatus {
  const triple = ["벚꽃상", "오크스", "추화상"];
  const group1 = ["필리스 레뷰", "튤립상", "아네모네 스테이크스"];
  const group2 = ["플로라 스테이크스", "스위트피 스테이크스"];
  const group3 = ["로즈 스테이크스", "개미취 스테이크스"];

  const tripleWon = triple.filter((n) => ctx.uniqueNames.has(n)).length;
  const g1Won = group1.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;
  const g2Won = group2.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;
  const g3Won = group3.some((n) => ctx.uniqueNames.has(n)) ? 1 : 0;

  const totalDone = tripleWon + g1Won + g2Won + g3Won;
  const satisfied = tripleWon === 3 && g1Won === 1 && g2Won === 1 && g3Won === 1;

  return {
    factor,
    satisfied,
    progress: { current: totalDone, total: 6 },
    detail: satisfied
      ? "충족"
      : `삼관 ${tripleWon}/3, 트라이얼 ${g1Won + g2Won + g3Won}/3`,
  };
}