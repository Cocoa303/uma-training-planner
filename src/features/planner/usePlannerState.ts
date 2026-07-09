import { useEffect, useState, useCallback } from "react";
import charactersData from "../../../data/characters.json";
import racesData from "../../../data/races.json";
import type { Character } from "../../types/character";
import type { Race, ClassLevel } from "../../types/race";
import type { FactorDef } from "../../types/factor";
import {
  INITIAL_STATE,
  autoActivateFilter,
  setFilterGrade,
  selectRaceInSlot,
  clearSlot,
  clearSlotsByOwnership,
  type PlannerState,
  type AptitudeFilter,
  type AptitudeFilterGrade,
  type SlotSelections,
  type SlotOwnerships,
} from "../../domain/scheduler";
import { toTurnIndex } from "../../domain/turn";
import { autoAssignFactor, autoAssignG1, runOptimization } from "../../domain/autoAssign";
import { computeFactorStatuses } from "../../domain/factors";
import {
  loadPlannerState,
  savePlannerState,
  loadMinWinrate,
  saveMinWinrate,
} from "../../domain/persistence";

const characters = charactersData as Character[];
const allRaces = racesData as Race[];

function findRaceByGoal(
  goalName: string,
  classLevel: ClassLevel,
  month: number,
  half: 1 | 2
): Race | null {
  let match = allRaces.find(
    (r) =>
      r.name === goalName &&
      r.eligibleClasses.includes(classLevel) &&
      r.turn.month === month &&
      r.turn.half === half
  );
  if (match) return match;

  match = allRaces.find(
    (r) =>
      r.name.includes(goalName) &&
      r.eligibleClasses.includes(classLevel) &&
      r.turn.month === month &&
      r.turn.half === half
  );
  return match ?? null;
}

function buildInitialGoalSlots(character: Character): {
  selections: SlotSelections;
  ownerships: SlotOwnerships;
} {
  const selections: SlotSelections = {};
  const ownerships: SlotOwnerships = {};

  for (const goal of character.trainingGoals) {
    if (!goal.raceName || !goal.deadline || !goal.raceInfo) continue;

    const race = findRaceByGoal(
      goal.raceName,
      goal.deadline.class,
      goal.deadline.turn.month,
      goal.deadline.turn.half
    );
    if (!race) {
      console.warn(
        `[usePlannerState] 목표 레이스 매칭 실패: ${goal.raceName} @ ${goal.deadline.class} ${goal.deadline.turn.month}/${goal.deadline.turn.half}`
      );
      continue;
    }

    const turnIdx = toTurnIndex(
      goal.deadline.class,
      goal.deadline.turn.month,
      goal.deadline.turn.half
    );
    if (turnIdx < 0) continue;

    selections[turnIdx] = race.id;
    ownerships[turnIdx] = { kind: "goal" };
  }

  return { selections, ownerships };
}

function buildFactorMap(
  character: Character,
  selections: SlotSelections,
  filter: AptitudeFilter
): Map<string, FactorDef> {
  const statuses = computeFactorStatuses(selections, character, filter);
  const map = new Map<string, FactorDef>();

  for (const group of [statuses.nickname, statuses.hidden, statuses.g1]) {
    for (const s of group) {
      map.set(s.factor.id, s.factor);
    }
  }

  return map;
}

export function usePlannerState() {
  const [state, setState] = useState<PlannerState>(INITIAL_STATE);
  const [minWinrate, setMinWinrateState] = useState<number>(100);
  const [lastAssignResult, setLastAssignResult] = useState<{
    factorId?: string;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setState(loadPlannerState());
    setMinWinrateState(loadMinWinrate());
  }, []);

  useEffect(() => {
    if (state === INITIAL_STATE) return;
    savePlannerState(state);
  }, [state]);

  const setMinWinrate = useCallback((value: number) => {
    setMinWinrateState(value);
    saveMinWinrate(value);
  }, []);

  const character: Character | null = state.characterId
    ? characters.find((c) => c.id === state.characterId) ?? null
    : null;

  const selectCharacter = useCallback((id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;

    const originalGrades = {
      turf: c.aptitudes.surface.turf,
      dirt: c.aptitudes.surface.dirt,
      sprint: c.aptitudes.distance.sprint,
      mile: c.aptitudes.distance.mile,
      medium: c.aptitudes.distance.medium,
      long: c.aptitudes.distance.long,
      runner: c.aptitudes.style.runner,
      leader: c.aptitudes.style.leader,
      betweener: c.aptitudes.style.betweener,
      chaser: c.aptitudes.style.chaser,
    };

    const { selections, ownerships } = buildInitialGoalSlots(c);

    setState({
      characterId: id,
      filter: autoActivateFilter(originalGrades),
      selections,
      ownerships,
    });
    setLastAssignResult(null);
  }, []);

  const setAptitudeFilter = useCallback(
    (key: keyof AptitudeFilter, grade: AptitudeFilterGrade) => {
      setState((s) => setFilterGrade(s, key, grade));
    },
    []
  );

  const selectRace = useCallback((turnIndex: number, raceId: string) => {
    setState((s) => {
      if (s.ownerships[turnIndex]?.kind === "goal") return s;
      return selectRaceInSlot(s, turnIndex, raceId);
    });
  }, []);

  const clearRaceSlot = useCallback((turnIndex: number) => {
    setState((s) => {
      if (s.ownerships[turnIndex]?.kind === "goal") return s;
      return clearSlot(s, turnIndex);
    });
  }, []);

  /**
   * 전체 초기화.
   * - 목표 슬롯만 남기고 나머지 슬롯 (수동/자동/인자/G1/filler) 모두 제거
   * - 필터 설정은 유지 (유저가 설정한 A/B/C 등급 그대로)
   */
  const resetAll = useCallback(() => {
    setState((s) => {
      if (!s.characterId) return INITIAL_STATE;
      const c = characters.find((x) => x.id === s.characterId);
      if (!c) return INITIAL_STATE;

      const { selections, ownerships } = buildInitialGoalSlots(c);
      return {
        characterId: s.characterId,
        filter: s.filter, // 필터 유지
        selections,
        ownerships,
      };
    });
    setLastAssignResult(null);
  }, []);

  const toggleFactorAssignment = useCallback(
    (factor: FactorDef) => {
      if (!character) return;

      const hasAssigned = Object.values(state.ownerships).some(
        (o) => o && o.kind === "hidden" && o.factorId === factor.id
      );

      if (hasAssigned) {
        setState((s) =>
          clearSlotsByOwnership(
            s,
            (o) => o.kind === "hidden" && o.factorId === factor.id
          )
        );
        setLastAssignResult({
          factorId: factor.id,
          success: true,
          message: `[${factor.name}] 자동 배치 취소됨`,
        });
        return;
      }

      const { state: newState, result } = autoAssignFactor(
        factor,
        state,
        character,
        { minWinrate }
      );

      if (!result.success) {
        const lines: string[] = [
          `[${factor.name}] 배치 실패`,
          result.reason ?? "알 수 없는 이유",
        ];
        if (result.failureDetails && result.failureDetails.length > 0) {
          lines.push(...result.failureDetails);
        }
        setLastAssignResult({
          factorId: factor.id,
          success: false,
          message: lines.join("\n"),
        });
        return;
      }

      setState(newState);
      setLastAssignResult({
        factorId: factor.id,
        success: true,
        message: `[${factor.name}] ${result.assigned.length}개 배치됨`,
      });
    },
    [character, state, minWinrate]
  );

  const isFactorAssigned = useCallback(
    (factorId: string): boolean => {
      return Object.values(state.ownerships).some(
        (o) => o && o.kind === "hidden" && o.factorId === factorId
      );
    },
    [state.ownerships]
  );

  const runG1AutoAssign = useCallback(() => {
    if (!character) return;

    const { state: newState, result } = autoAssignG1(state, character, {
      minWinrate,
    });

    if (!result.success) {
      setLastAssignResult({
        success: false,
        message: `G1 자동 배치 실패: ${result.reason ?? ""}`,
      });
      return;
    }

    setState(newState);
    setLastAssignResult({
      success: true,
      message: `G1 ${result.assigned.length}개 자동 배치됨`,
    });
  }, [character, state, minWinrate]);

  const clearG1AutoAssign = useCallback(() => {
    setState((s) => clearSlotsByOwnership(s, (o) => o.kind === "g1"));
    setLastAssignResult({ success: true, message: "G1 자동 배치 해제됨" });
  }, []);

  const runOptimize = useCallback(() => {
    if (!character) return;

    const factorMap = buildFactorMap(character, state.selections, state.filter);

    const { state: newState, result } = runOptimization(
      state,
      character,
      factorMap,
      { minWinrate }
    );

    setState(newState);

    const parts: string[] = [];
    parts.push(`인자 ${result.chosenFactorCount}개`);
    parts.push(`총점 ${result.totalScore}`);
    if (result.filledEmptyCount > 0) {
      parts.push(`빈 슬롯 ${result.filledEmptyCount} 채움`);
    }
    if (result.restoredManualCount > 0) {
      parts.push(`수동 ${result.restoredManualCount} 유지`);
    }
    if (result.droppedManualCount > 0) {
      parts.push(`수동 ${result.droppedManualCount} 삭제`);
    }
    parts.push(`${result.method === "exhaustive" ? "완전탐색" : "그리디"}`);
    parts.push(`${result.elapsedMs}ms`);

    const lines: string[] = [`최적화 완료: ${parts.join(", ")}`];
    if (result.reason) lines.push(result.reason);

    setLastAssignResult({
      success: true,
      message: lines.join("\n"),
    });
  }, [character, state, minWinrate]);

  return {
    state,
    character,
    minWinrate,
    setMinWinrate,
    selectCharacter,
    setAptitudeFilter,
    selectRace,
    clearRaceSlot,
    resetAll,
    toggleFactorAssignment,
    isFactorAssigned,
    runG1AutoAssign,
    clearG1AutoAssign,
    runOptimize,
    lastAssignResult,
  };
}