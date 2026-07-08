import type { ClassLevel, Turn } from "../types/race";

const CLASS_ORDER: ClassLevel[] = ["주니어급", "클래식급", "시니어급"];

/**
 * (학년, 월, 반) → 전체에서 몇 번째 턴인지 (0부터 시작)
 * 주니어 1월 전반 = 0, 주니어 1월 후반 = 1, ..., 시니어 12월 후반 = 71
 */
export function toTurnIndex(cls: ClassLevel, month: number, half: 1 | 2): number {
  const classIdx = CLASS_ORDER.indexOf(cls);
  if (classIdx < 0) return -1;
  return classIdx * 24 + (month - 1) * 2 + (half - 1);
}

/**
 * flat index → (학년, 월, 반)
 */
export function fromTurnIndex(index: number): {
  cls: ClassLevel;
  month: number;
  half: 1 | 2;
} {
  const cls = CLASS_ORDER[Math.floor(index / 24)];
  const remainder = index % 24;
  const month = Math.floor(remainder / 2) + 1;
  const half = (remainder % 2 === 0 ? 1 : 2) as 1 | 2;
  return { cls, month, half };
}

/**
 * 학년 하나에 해당하는 24개 턴을 생성.
 */
export function turnsOfClass(cls: ClassLevel): {
  cls: ClassLevel;
  month: number;
  half: 1 | 2;
  index: number;
}[] {
  const result: { cls: ClassLevel; month: number; half: 1 | 2; index: number }[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const half of [1, 2] as const) {
      result.push({
        cls,
        month,
        half,
        index: toTurnIndex(cls, month, half),
      });
    }
  }
  return result;
}

/**
 * 레이스 하나가 (턴, 학년) 조합에 매치되는지 판정.
 */
export function raceMatchesSlot(
  raceEligibleClasses: ClassLevel[],
  raceTurn: Turn,
  slotClass: ClassLevel,
  slotMonth: number,
  slotHalf: 1 | 2
): boolean {
  return (
    raceEligibleClasses.includes(slotClass) &&
    raceTurn.month === slotMonth &&
    raceTurn.half === slotHalf
  );
}

export const CLASS_LEVELS = CLASS_ORDER;