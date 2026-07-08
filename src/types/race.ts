export type ClassLevel = "주니어급" | "클래식급" | "시니어급";

export type RaceGrade = "G1" | "G2" | "G3" | "OP" | "Pre-OP";

export type Surface = "잔디" | "더트";

export type DistanceCategory = "단거리" | "마일" | "중거리" | "장거리";

export type Rotation = "좌" | "우" | "직선";

export type Side = "내측" | "외측";

export interface Turn {
  month: number; // 1-12
  half: 1 | 2; // 1=전반, 2=후반
}

export interface Race {
  id: string;
  name: string;
  grade: RaceGrade;
  venue: string;
  surface: Surface;
  distance: number;
  distanceCategory: DistanceCategory;
  rotation: Rotation;
  side: Side | null;
  turn: Turn;
  eligibleClasses: ClassLevel[];
  fansGained: number;
  isOverseas: boolean;
  /** GameTora 배너 이미지 경로 (예: "/images/race/1005.png"). 없을 수 있음. */
  image?: string;
}