import type { Race, ClassLevel } from "../types/race";
import racesData from "../../data/races.json";
import { toTurnIndex } from "./turn";

const allRaces = racesData as Race[];

/**
 * (학년, 월, 반)별로 개최되는 레이스들을 미리 인덱싱.
 * key: turnIndex (0~71)
 * value: 그 턴에 열리는 레이스들
 */
const RACES_BY_TURN = buildRaceIndex();

function buildRaceIndex(): Map<number, Race[]> {
  const map = new Map<number, Race[]>();

  for (const race of allRaces) {
    for (const cls of race.eligibleClasses) {
      const idx = toTurnIndex(cls, race.turn.month, race.turn.half);
      if (idx < 0) continue;
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx)!.push(race);
    }
  }

  return map;
}

/**
 * 특정 (학년, 월, 반)에 개최되는 레이스 목록.
 */
export function getRacesAt(
  cls: ClassLevel,
  month: number,
  half: 1 | 2
): Race[] {
  const idx = toTurnIndex(cls, month, half);
  return RACES_BY_TURN.get(idx) ?? [];
}

/**
 * 학년별 12개월 × 2 = 24턴을 순회하기 위한 유틸.
 */
export interface Slot {
  cls: ClassLevel;
  month: number;
  half: 1 | 2;
  turnIndex: number;
  races: Race[];
}

export function getSlotsForClass(cls: ClassLevel): Slot[] {
  const slots: Slot[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const half of [1, 2] as const) {
      const turnIndex = toTurnIndex(cls, month, half);
      slots.push({
        cls,
        month,
        half,
        turnIndex,
        races: getRacesAt(cls, month, half),
      });
    }
  }
  return slots;
}