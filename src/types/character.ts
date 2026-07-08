import type { Turn, ClassLevel } from "./race";

// 별 등급
export type Rarity = 1 | 2 | 3;

// 적성 등급 (게임 표기)
export type AptitudeGrade = "S" | "A" | "B" | "C" | "D" | "E" | "F" | "G";

// 각질
export type RunningStyle = "도주" | "선행" | "선입" | "추입";

// 5대 스탯
export interface Stats {
  speed: number;    // 스피드
  stamina: number;  // 스태미나
  power: number;    // 파워
  guts: number;     // 근성
  wit: number;      // 지능 (wisdom)
}

// 성장률 (5대 스탯 중 일부에 % 보정)
export type GrowthRate = Partial<Stats>;

// 세부 적성 (G~S)
export interface Aptitudes {
  surface: {
    turf: AptitudeGrade;   // 잔디
    dirt: AptitudeGrade;   // 더트
  };
  distance: {
    sprint: AptitudeGrade; // 단거리
    mile: AptitudeGrade;   // 마일
    medium: AptitudeGrade; // 중거리
    long: AptitudeGrade;   // 장거리
  };
  style: {
    runner: AptitudeGrade; // 도주
    leader: AptitudeGrade; // 선행
    betweener: AptitudeGrade; // 선입
    chaser: AptitudeGrade; // 추입
  };
}

// 육성 목표 레이스
export interface TrainingGoal {
  order: number;                    // 목표 순번 (1~9)
  description: string;              // "사츠키상에서 5착 이내"
  raceName: string | null;          // "사츠키상" (없는 경우 null - 예: 데뷔전)
  placement: string | null;         // "5착 이내", "1착" 등
  deadline: {
    class: ClassLevel;              // "클래식급"
    turn: Turn;                     // { month: 4, half: 1 }
  } | null;
  requiredFans: number | null;      // 필요 팬수
  raceInfo: {
    grade: string;                  // "G1", "G2"
    venue: string;                  // "나카야마"
    surface: "잔디" | "더트";
    distance: number;               // 2000
    distanceCategory: string;       // "중거리"
    rotation: string;               // "우"
    side: string | null;            // "내측"
  } | null;
}

// 캐릭터 하나
export interface Character {
  id: string;                       // "103202"
  name: string;                     // "아그네스 타키온"
  epithet: string;                  // "Lunatic Lab" (별명, 대괄호 안)
  fullName: string;                 // "[Lunatic Lab] 아그네스 타키온"
  rarity: Rarity | null;            // ★ 개수
  cv: string | null;                // "우에사카 스미레"
  images: {
    icon: string;                   // 아이콘 (목록에서 사용)
    casual: string | null;          // 평상복
    race: string | null;            // 승부복
  };
  stats: {
    initial: Stats;                 // 초기 스탯
    max: Stats;                     // 5성 스탯
  };
  growthRate: GrowthRate;           // 성장률
  aptitudes: Aptitudes;             // 세부 적성
  trainingGoals: TrainingGoal[];    // 육성 목표 레이스 목록
  sourceUrl: string;                // 원본 URL (attribution용)
}