/**
 * 인자 (Factor) 시스템 타입.
 */

export type FactorCategory = "nickname" | "hidden" | "g1";

/**
 * 인자 획득 조건.
 */
export type FactorCondition =
  // 리스트의 모든 레이스 우승
  | { kind: "race-wins"; raceNames: string[] }
  // 하나라도 우승
  | { kind: "race-wins-any"; raceNames: string[] }
  // N회 이상 우승 (중복 카운트)
  | { kind: "race-wins-count"; raceNames: string[]; requiredCount: number }
  // N개 이상 서로 다른 종류 우승
  | { kind: "race-wins-count-unique"; raceNames: string[]; requiredCount: number }
  // 적성 조건
  | { kind: "aptitude"; check: "surface-both-a" | "style-all-a" | "distance-all-a" }
  // 커스텀 (인자별 개별 처리)
  | { kind: "custom"; description: string };

export interface FactorDef {
  id: string;
  category: FactorCategory;
  name: string;
  description: string;
  condition: FactorCondition | null;
  characterIds?: string[];
  sourceUrl?: string;
}

export interface FactorStatus {
  factor: FactorDef;
  satisfied: boolean;
  progress?: {
    current: number;
    total: number;
  };
  detail?: string;
}