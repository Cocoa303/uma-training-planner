import * as cheerio from "cheerio";
import type {
  Race,
  RaceGrade,
  Surface,
  DistanceCategory,
  Rotation,
  Side,
  ClassLevel,
  Turn,
} from "../src/types/race.js";

/**
 * 인벤 레이스 DB HTML에서 레이스 목록을 파싱.
 */
export function parseRaces(html: string): Race[] {
  const $ = cheerio.load(html);
  const races: Race[] = [];

  // 인벤 페이지의 레이스 테이블: 각 행은 tr, 필터 UI의 tr 제외.
  // 페이지 구조를 실제로 확인해야 하지만, 일단 6개 컬럼짜리 tr을 대상으로.
  $("table tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");

    // 헤더나 안 맞는 행은 스킵. 최소 5개 컬럼 필요.
    if (cells.length < 5) return;

    // 각 셀의 텍스트 추출
    const gradeText = cells.eq(1).text().trim();
    const nameText = cells.eq(2).text().trim();
    const infoText = cells.eq(3).text().trim();
    const timingText = cells.eq(4).text().trim();
    const fansText = cells.eq(5).text().trim();

    // 등급이 유효한 값이 아니면 스킵 (헤더 등)
    if (!isValidGrade(gradeText)) return;

    const info = parseRaceInfo(infoText);
    if (!info) return;

    const timing = parseTiming(timingText);
    if (!timing) return;

    const race: Race = {
      id: makeRaceId(nameText),
      name: nameText,
      grade: gradeText as RaceGrade,
      venue: info.venue,
      surface: info.surface,
      distance: info.distance,
      distanceCategory: info.distanceCategory,
      rotation: info.rotation,
      side: info.side,
      turn: timing.turn,
      eligibleClasses: timing.eligibleClasses,
      fansGained: parseFans(fansText),
      isOverseas: OVERSEAS_VENUES.includes(info.venue),
    };

    races.push(race);
  });

  return races;
}

// ─── 헬퍼 함수들 ─────────────────────────────────────

const VALID_GRADES: RaceGrade[] = ["G1", "G2", "G3", "OP", "Pre-OP"];
const OVERSEAS_VENUES = ["롱샹"]; // 필요시 추가

function isValidGrade(text: string): boolean {
  return (VALID_GRADES as string[]).includes(text);
}

/**
 * "나카야마 / 잔디 / 2000m (중거리) / 우 / 내측" 형태 파싱.
 */
function parseRaceInfo(text: string): {
  venue: string;
  surface: Surface;
  distance: number;
  distanceCategory: DistanceCategory;
  rotation: Rotation;
  side: Side | null;
} | null {
  const parts = text.split("/").map((p) => p.trim());
  if (parts.length < 4) return null;

  const venue = parts[0];
  const surface = parts[1] as Surface;

  // "2000m (중거리)" → distance=2000, category="중거리"
  const distanceMatch = parts[2].match(/(\d+)m\s*\((.+?)\)/);
  if (!distanceMatch) return null;
  const distance = parseInt(distanceMatch[1], 10);
  const distanceCategory = distanceMatch[2] as DistanceCategory;

  const rotation = parts[3] as Rotation;
  const side = (parts[4] as Side | undefined) ?? null;

  return { venue, surface, distance, distanceCategory, rotation, side };
}

/**
 * "41클래식급 4월 전반", "102클래식급 10월 후반", "0 10월 전반" 등 파싱.
 * - 앞의 숫자는 sort key (가변 길이) — 무시
 * - 학년 정보는 없을 수도 있음 (해외 레이스)
 */
function parseTiming(text: string): {
  turn: Turn;
  eligibleClasses: ClassLevel[];
} | null {
  // "N월 전반|후반"을 먼저 찾음
  const monthMatch = text.match(/(\d+)월\s+(전반|후반)/);
  if (!monthMatch) return null;

  const month = parseInt(monthMatch[1], 10);
  const half: 1 | 2 = monthMatch[2] === "전반" ? 1 : 2;

  // "월" 앞부분에서 sort key(숫자)를 제거하고 학년 정보만 추출
  const monthIdx = text.indexOf(monthMatch[0]);
  const beforeMonth = text.slice(0, monthIdx).trim();
  const classesRaw = beforeMonth.replace(/^\d+/, "").trim();

  const eligibleClasses: ClassLevel[] = classesRaw
    ? classesRaw
        .split("/")
        .map((s) => s.trim())
        .filter((s): s is ClassLevel =>
          s === "주니어급" || s === "클래식급" || s === "시니어급"
        )
    : [];

  return {
    turn: { month, half },
    eligibleClasses,
  };
}

/**
 * "11,000명" → 11000
 */
function parseFans(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  return parseInt(digits, 10) || 0;
}

/**
 * 이름 기반 ID 생성. 나중에 안정적인 다른 방법으로 바꿔도 됨.
 * 지금은 이름만 남기고 특수문자 제거 + 공백 하이픈.
 */
function makeRaceId(name: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "")
    .toLowerCase();
}