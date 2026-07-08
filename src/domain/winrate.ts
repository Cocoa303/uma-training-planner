import type { AptitudeGrade } from "../types/character";

/**
 * 승률 표.
 * 세로축(행) = 거리 적성 등급
 * 가로축(열) = 잔디/더트 적성 등급
 * 셀 값 = 최종 승률 (%)
 *
 * 예: 잔디 A + 중거리 C → WINRATE_TABLE.C.A = 90
 *     더트 G + 단거리 G → WINRATE_TABLE.G.G = 0
 */
const WINRATE_TABLE: Record<AptitudeGrade, Record<AptitudeGrade, number>> = {
  // [거리등급]: { [잔디/더트등급]: 승률 }
  S: { S: 110, A: 110, B: 100, C: 90, D: 80, E: 70, F: 60, G: 50 },
  A: { S: 110, A: 110, B: 100, C: 90, D: 80, E: 70, F: 60, G: 50 },
  B: { S: 100, A: 100, B: 90, C: 80, D: 70, E: 60, F: 50, G: 40 },
  C: { S: 90, A: 90, B: 80, C: 70, D: 60, E: 50, F: 40, G: 30 },
  D: { S: 80, A: 80, B: 70, C: 60, D: 50, E: 40, F: 30, G: 20 },
  E: { S: 70, A: 70, B: 60, C: 50, D: 40, E: 30, F: 20, G: 10 },
  F: { S: 60, A: 60, B: 50, C: 40, D: 30, E: 20, F: 10, G: 0 },
  G: { S: 50, A: 50, B: 40, C: 30, D: 20, E: 10, F: 0, G: 0 },
};

/**
 * 표에서 승률 조회.
 */
export function lookupWinrate(
  surfaceAptitude: AptitudeGrade,
  distanceAptitude: AptitudeGrade
): number {
  return WINRATE_TABLE[distanceAptitude][surfaceAptitude];
}

/**
 * "필터가 켜진 축은 인자로 A까지 올릴 예정" 로직을 반영한 실효 등급.
 */
export function effectiveGrade(
  originalGrade: AptitudeGrade,
  isPlannedToRaise: boolean
): AptitudeGrade {
  if (isPlannedToRaise && !isBetterOrEqual(originalGrade, "A")) {
    return "A";
  }
  return originalGrade;
}

/**
 * a가 b보다 좋거나 같은지 (S=최고, G=최저).
 */
export function isBetterOrEqual(a: AptitudeGrade, b: AptitudeGrade): boolean {
  return APT_ORDER[a] >= APT_ORDER[b];
}

export const APT_ORDER: Record<AptitudeGrade, number> = {
  S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, G: 0,
};

/**
 * 캐릭터가 특정 레이스를 뛸 때의 기본 승률 (연전 감점 제외).
 *
 * @param surfaceGrade  캐릭터의 잔디/더트 적성 (실효 등급)
 * @param distanceGrade 캐릭터의 거리 적성 (실효 등급)
 */
export function baseWinrate(
  surfaceGrade: AptitudeGrade,
  distanceGrade: AptitudeGrade
): number {
  return lookupWinrate(surfaceGrade, distanceGrade);
}

/**
 * 연전 감점 (같은 캐릭터가 연속 턴 출전 시).
 * 3연전 -10%, 4연전 -25%, 5연전 -35%, 6연전 이상 -50%
 */
export function consecutivePenalty(consecutiveCount: number): number {
  if (consecutiveCount <= 2) return 0;
  if (consecutiveCount === 3) return -10;
  if (consecutiveCount === 4) return -25;
  if (consecutiveCount === 5) return -35;
  return -50;
}

/**
 * 최종 승률 = 기본 승률 + 연전 감점.
 */
export function finalWinrate(base: number, consecutiveCount: number): number {
  return Math.max(0, base + consecutivePenalty(consecutiveCount));
}