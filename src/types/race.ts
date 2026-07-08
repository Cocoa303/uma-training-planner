// 레이스 등급
export type RaceGrade = "G1" | "G2" | "G3" | "OP" | "Pre-OP";

// 바탕 (경기장 표면)
export type Surface = "잔디" | "더트";

// 거리 구분
export type DistanceCategory = "단거리" | "마일" | "중거리" | "장거리";

// 회전 방향
export type Rotation = "우" | "좌" | "직선";

// 안팎 (있는 경기만)
export type Side = "내측" | "외측";

// 출전 시기 (학년)
export type ClassLevel = "주니어급" | "클래식급" | "시니어급";

// 턴 (월 + 전/후반)
export interface Turn {
  month: number; // 1-12
  half: 1 | 2;   // 1=전반, 2=후반
}

// 레이스 하나
export interface Race {
  id: string;              // 고유 ID (직접 만들어야 함)
  name: string;            // "사츠키상"
  grade: RaceGrade;        // "G1"
  venue: string;           // "나카야마"
  surface: Surface;        // "잔디"
  distance: number;        // 2000
  distanceCategory: DistanceCategory; // "중거리"
  rotation: Rotation;      // "우"
  side: Side | null;       // "내측" 또는 없음
  turn: Turn;              // { month: 4, half: 1 }
  eligibleClasses: ClassLevel[]; // ["클래식급"] 또는 ["클래식급", "시니어급"]
  fansGained: number;      // 11000
  isOverseas: boolean;     // 롱샹 등 해외
}