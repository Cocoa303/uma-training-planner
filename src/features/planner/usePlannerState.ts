import { useEffect, useState, useCallback } from "react";
import charactersData from "../../../data/characters.json";
import type { Character } from "../../types/character";
import {
  INITIAL_STATE,
  autoActivateFilter,
  toggleFilterKey,
  selectRaceInSlot,
  clearSlot,
  type PlannerState,
  type AptitudeFilter,
} from "../../domain/scheduler";
import { loadPlannerState, savePlannerState } from "../../domain/persistence";

const characters = charactersData as Character[];

/**
 * 스케줄러 전역 상태와 조작 함수들을 반환하는 훅.
 */
export function usePlannerState() {
  const [state, setState] = useState<PlannerState>(INITIAL_STATE);

  // 초기 로드
  useEffect(() => {
    setState(loadPlannerState());
  }, []);

  // 변경 시 자동 저장 (INITIAL_STATE와 동일할 땐 저장 안 함)
  useEffect(() => {
    if (state === INITIAL_STATE) return;
    savePlannerState(state);
  }, [state]);

  // 현재 선택된 캐릭터 객체
  const character: Character | null = state.characterId
    ? characters.find((c) => c.id === state.characterId) ?? null
    : null;

  // ─── 액션들 ─────────────────────────────

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

    setState({
      characterId: id,
      filter: autoActivateFilter(originalGrades),
      selections: {}, // 새 캐릭터 선택 시 스케줄 초기화
    });
  }, []);

  const toggleFilter = useCallback((key: keyof AptitudeFilter) => {
    setState((s) => toggleFilterKey(s, key));
  }, []);

  const selectRace = useCallback((turnIndex: number, raceId: string) => {
    setState((s) => selectRaceInSlot(s, turnIndex, raceId));
  }, []);

  const clearRaceSlot = useCallback((turnIndex: number) => {
    setState((s) => clearSlot(s, turnIndex));
  }, []);

  const resetAll = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    character,
    selectCharacter,
    toggleFilter,
    selectRace,
    clearRaceSlot,
    resetAll,
  };
}