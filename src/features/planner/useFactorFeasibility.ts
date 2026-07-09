import { useEffect, useState } from "react";
import type { Character } from "../../types/character";
import type { PlannerState } from "../../domain/scheduler";
import type { FactorDef } from "../../types/factor";
import { autoAssignFactor } from "../../domain/autoAssign";

export interface FactorFeasibility {
  canAssign: boolean;
  summary?: string; // "슬롯 부족", "승률 미달" 등 짧은 한 줄
  details?: string[]; // 상세 실패 로그
}

const DEBOUNCE_MS = 300;

/**
 * 각 인자 ID → 배치 가능성 매핑을 반환.
 * 상태가 변경되면 300ms 후 재계산 (debounce).
 */
export function useFactorFeasibility(
  factors: FactorDef[],
  state: PlannerState,
  character: Character | null,
  minWinrate: number
): Map<string, FactorFeasibility> {
  const [feasibility, setFeasibility] = useState<Map<string, FactorFeasibility>>(
    new Map()
  );

  useEffect(() => {
    if (!character) {
      setFeasibility(new Map());
      return;
    }

    const timer = setTimeout(() => {
      const nextMap = new Map<string, FactorFeasibility>();

      for (const factor of factors) {
        // 자동 배치 미지원 인자
        if (!factor.condition) {
          nextMap.set(factor.id, {
            canAssign: false,
            summary: "자동 배치 미지원",
          });
          continue;
        }

        if (factor.condition.kind === "aptitude") {
          nextMap.set(factor.id, {
            canAssign: false,
            summary: "적성 조건 (수동 확인)",
          });
          continue;
        }

        // 캐릭터 전용 인자 체크
        if (factor.characterIds && factor.characterIds.length > 0) {
          if (!factor.characterIds.includes(character.id)) {
            nextMap.set(factor.id, {
              canAssign: false,
              summary: "다른 캐릭터 전용",
            });
            continue;
          }
        }

        // 실제 시뮬레이션
        const { result } = autoAssignFactor(factor, state, character, {
          minWinrate,
        });

        if (result.success) {
          nextMap.set(factor.id, { canAssign: true });
        } else {
          nextMap.set(factor.id, {
            canAssign: false,
            summary: summarizeReason(result.reason),
            details: result.failureDetails,
          });
        }
      }

      setFeasibility(nextMap);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [factors, state, character, minWinrate]);

  return feasibility;
}

/**
 * 실패 이유를 짧은 요약으로 변환.
 */
function summarizeReason(reason: string | undefined): string {
  if (!reason) return "배치 불가";

  if (reason.includes("승률")) return "승률 미달";
  if (reason.includes("슬롯")) return "슬롯 부족";
  if (reason.includes("개최")) return "개최 없음";
  if (reason.includes("트라이얼")) return "트라이얼 부족";
  if (reason.includes("G1")) return "G1 슬롯 부족";
  if (reason.length > 30) return reason.slice(0, 30) + "…";
  return reason;
}