import { useEffect, useState, useCallback } from "react";
import charactersData from "../../../data/characters.json";
import racesData from "../../../data/races.json";
import type { Character, TrainingGoal } from "../../types/character";
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
  loadOptimizePriority,
  saveOptimizePriority,
  type OptimizePriority,
} from "../../domain/persistence";

const characters = charactersData as Character[];
const allRaces = racesData as Race[];

/**
 * 캐릭터 목표 레이스를 races.json 의 실제 Race 로 매칭.
 *
 * 매칭 순서:
 *   1. 이름 정확 매칭 (턴+학년 완전 일치)
 *   2. 이름 양방향 부분 매칭 ("일본 더비" ↔ "도쿄 우준 (일본 더비)")
 *   3. raceInfo 매칭 (grade+venue+surface+distance)
 *      3a. 유일하면 채택 — 축약형 이름 대응
 *      3b. 여러 개면 goalName 첫 토큰으로 disambiguate
 *   4. 학년 내 이름 정확 매칭 (턴 무시, 유일하면 채택) — deadline 오류 대응
 */
function findRaceByGoal(
  goalName: string,
  classLevel: ClassLevel,
  month: number,
  half: 1 | 2,
  raceInfo: TrainingGoal["raceInfo"]
): Race | null {
  const slotCandidates = allRaces.filter(
    (r) =>
      r.eligibleClasses.includes(classLevel) &&
      r.turn.month === month &&
      r.turn.half === half
  );

  const exact = slotCandidates.find((r) => r.name === goalName);
  if (exact) return exact;

  const partial = slotCandidates.find(
    (r) => r.name.includes(goalName) || goalName.includes(r.name)
  );
  if (partial) return partial;

  if (raceInfo) {
    const infoMatches = slotCandidates.filter(
      (r) =>
        r.grade === raceInfo.grade &&
        r.venue === raceInfo.venue &&
        r.surface === raceInfo.surface &&
        r.distance === raceInfo.distance
    );

    if (infoMatches.length === 1) return infoMatches[0];

    if (infoMatches.length > 1) {
      const firstToken = goalName.trim().split(/\s+/)[0];
      if (firstToken) {
        const narrowed = infoMatches.filter((r) => r.name.includes(firstToken));
        if (narrowed.length === 1) return narrowed[0];
      }
    }
  }

  const classCandidates = allRaces.filter(
    (r) => r.eligibleClasses.includes(classLevel) && r.name === goalName
  );
  if (classCandidates.length === 1) return classCandidates[0];

  return null;
}

function buildInitialGoalSlots(character: Character): {
  selections: SlotSelections;
  ownerships: SlotOwnerships;
} {
  const selections: SlotSelections = {};
  const ownerships: SlotOwnerships = {};

  for (const goal of character.trainingGoals) {
    if (!goal.raceName || !goal.deadline) continue;

    const race = findRaceByGoal(
      goal.raceName,
      goal.deadline.class,
      goal.deadline.turn.month,
      goal.deadline.turn.half,
      goal.raceInfo
    );
    if (!race) {
      console.warn(
        `[usePlannerState] 목표 레이스 매칭 실패: ${goal.raceName} @ ${goal.deadline.class} ${goal.deadline.turn.month}/${goal.deadline.turn.half}`
      );
      continue;
    }

    // 슬롯 인덱스는 goal.deadline 이 아니라 매칭된 race 의 실제 개최 턴 기준.
    const turnIdx = toTurnIndex(
      goal.deadline.class,
      race.turn.month,
      race.turn.half
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
  const [optimizePriority, setOptimizePriorityState] =
    useState<OptimizePriority>("factor");
  const [lastAssignResult, setLastAssignResult] = useState<{
    factorId?: string;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setState(loadPlannerState());
    setMinWinrateState(loadMinWinrate());
    setOptimizePriorityState(loadOptimizePriority());
  }, []);

  useEffect(() => {
    if (state === INITIAL_STATE) return;
    savePlannerState(state);
  }, [state]);

  const setMinWinrate = useCallback((value: number) => {
    setMinWinrateState(value);
    saveMinWinrate(value);
  }, []);

  const setOptimizePriority = useCallback((value: OptimizePriority) => {
    setOptimizePriorityState(value);
    saveOptimizePriority(value);
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

  const resetAll = useCallback(() => {
    setState((s) => {
      if (!s.characterId) return INITIAL_STATE;
      const c = characters.find((x) => x.id === s.characterId);
      if (!c) return INITIAL_STATE;

      const { selections, ownerships } = buildInitialGoalSlots(c);
      return {
        characterId: s.characterId,
        filter: s.filter,
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
        // 고정된 인자는 클릭으로 해제 불가
        const hasPinned = Object.values(state.ownerships).some(
          (o) =>
            o?.kind === "hidden" && o.factorId === factor.id && o.pinned
        );
        if (hasPinned) {
          setLastAssignResult({
            factorId: factor.id,
            success: false,
            message: `[${factor.name}] 고정된 인자는 해제할 수 없습니다.\n📌 를 먼저 해제하세요.`,
          });
          return;
        }

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

      const lines: string[] = [
        `[${factor.name}] ${result.assigned.length}개 배치됨`,
      ];
      if (result.relocatedInfo && result.relocatedInfo.length > 0) {
        lines.push("자리 조정:");
        for (const info of result.relocatedInfo) {
          lines.push(`  ${info}`);
        }
      }

      setLastAssignResult({
        factorId: factor.id,
        success: true,
        message: lines.join("\n"),
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

  const isFactorPinned = useCallback(
    (factorId: string): boolean =>
      Object.values(state.ownerships).some(
        (o) => o?.kind === "hidden" && o.factorId === factorId && o.pinned
      ),
    [state.ownerships]
  );

  const toggleFactorPin = useCallback((factorId: string) => {
    setState((s) => {
      const nextOwnerships = { ...s.ownerships };
      let changed = false;
      for (const [key, ownership] of Object.entries(nextOwnerships)) {
        if (
          ownership?.kind === "hidden" &&
          ownership.factorId === factorId
        ) {
          const idx = Number(key);
          nextOwnerships[idx] = { ...ownership, pinned: !ownership.pinned };
          changed = true;
        }
      }
      if (!changed) return s;
      return { ...s, ownerships: nextOwnerships };
    });
  }, []);

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
      { minWinrate, priority: optimizePriority }
    );

    setState(newState);

    const parts: string[] = [];
    parts.push(`인자 ${result.chosenFactorCount}개`);
    parts.push(`총점 ${result.totalScore}`);
    parts.push(`${result.priority === "g1" ? "G1 우선" : "인자 우선"}`);
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
  }, [character, state, minWinrate, optimizePriority]);

  return {
    state,
    character,
    minWinrate,
    setMinWinrate,
    optimizePriority,
    setOptimizePriority,
    selectCharacter,
    setAptitudeFilter,
    selectRace,
    clearRaceSlot,
    resetAll,
    toggleFactorAssignment,
    isFactorAssigned,
    isFactorPinned,
    toggleFactorPin,
    runG1AutoAssign,
    clearG1AutoAssign,
    runOptimize,
    lastAssignResult,
  };
}