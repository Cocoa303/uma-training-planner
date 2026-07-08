import * as cheerio from "cheerio";
import type {
  Character,
  Rarity,
  Stats,
  Aptitudes,
  AptitudeGrade,
  TrainingGoal,
  GrowthRate,
} from "../src/types/character.js";
import type { ClassLevel } from "../src/types/race.js";

const APTITUDE_GRADES: AptitudeGrade[] = ["S", "A", "B", "C", "D", "E", "F", "G"];

export function parseCharacterDetail(
  id: string,
  html: string,
  sourceUrl: string,
  iconUrlFromList: string
): Character | null {
  const $ = cheerio.load(html);

  // 헤딩 찾기 (내부 링크 제거 후 텍스트만)
  const $heading = $("h2, h3")
    .filter((_, el) => $(el).text().includes("[") && $(el).text().includes("]"))
    .first();
  if ($heading.length === 0) {
    console.warn(`[parse] no heading for character ${id}`);
    return null;
  }
  const $headingClone = $heading.clone();
  $headingClone.find("a").remove(); // "목록으로" 등 내부 링크 제거
  const heading = $headingClone.text().trim();

  const { epithet, name, fullName, rarity } = parseHeading(heading);
  const cv = extractCv($);
  const images = extractImages($, iconUrlFromList);
  const stats = extractStats($);
  const growthRate = extractGrowthRate($);
  const aptitudes = extractAptitudes($);
  const trainingGoals = extractTrainingGoals($);

  return {
    id,
    name,
    epithet,
    fullName,
    rarity,
    cv,
    images,
    stats,
    growthRate,
    aptitudes,
    trainingGoals,
    sourceUrl,
  };
}

// ─── 헤딩 파싱 ────────────────────────────────────

function parseHeading(text: string): {
  epithet: string;
  name: string;
  fullName: string;
  rarity: Rarity | null;
} {
  const rarityMatch = text.match(/★+/);
  const rarity = rarityMatch ? (rarityMatch[0].length as Rarity) : null;

  // ★, "목록으로" 같은 UI 텍스트 제거
  const cleaned = text
    .replace(/★+/g, "")
    .replace(/목록으로/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const bracketMatch = cleaned.match(/\[(.+?)\]\s*(.+)/);

  if (bracketMatch) {
    const epi = bracketMatch[1].trim();
    const nm = bracketMatch[2].trim();
    return {
      epithet: epi,
      name: nm,
      fullName: `[${epi}] ${nm}`,
      rarity,
    };
  }

  return { epithet: "", name: cleaned, fullName: cleaned, rarity };
}

// ─── CV ────────────────────────────────────────

function extractCv($: cheerio.CheerioAPI): string | null {
  const cvText = $("body").text().match(/CV\s*[:：]\s*([^\n(（]+)/);
  return cvText ? cvText[1].trim() : null;
}

// ─── 이미지 ─────────────────────────────────────

function extractImages(
  $: cheerio.CheerioAPI,
  iconFromList: string
): { icon: string; casual: string | null; race: string | null } {
  const casualImg = $('img[src*="illustnormal"], img[src*="charaillust_n"]').first().attr("src") || null;
  const raceImg = $('img[src*="illustrace"], img[src*="charaillust_r"]').first().attr("src") || null;

  return {
    icon: iconFromList,
    casual: casualImg,
    race: raceImg,
  };
}

// ─── 능력치 ─────────────────────────────────────

function extractStats($: cheerio.CheerioAPI): { initial: Stats; max: Stats } {
  const empty: Stats = { speed: 0, stamina: 0, power: 0, guts: 0, wit: 0 };
  const result = { initial: { ...empty }, max: { ...empty } };

  const $statsTable = findTableByHeaders($, ["스피드", "스태미나", "파워", "근성", "지능"]);
  if (!$statsTable) return result;

  const rows = $statsTable.find("tr").toArray();

  for (const row of rows) {
    const cells = getRowCells($, row);
    if (cells.length < 6) continue;

    const rowLabel = cells[0];
    const values = cells.slice(1, 6).map(parseStatCell);

    if (rowLabel.includes("초기")) {
      result.initial = toStats(values);
    } else if (rowLabel.includes("5성")) {
      result.max = toStats(values);
    }
  }

  return result;
}

function parseStatCell(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function toStats(values: number[]): Stats {
  return {
    speed: values[0] ?? 0,
    stamina: values[1] ?? 0,
    power: values[2] ?? 0,
    guts: values[3] ?? 0,
    wit: values[4] ?? 0,
  };
}

// ─── 성장률 ─────────────────────────────────────

function extractGrowthRate($: cheerio.CheerioAPI): GrowthRate {
  const $statsTable = findTableByHeaders($, ["스피드", "스태미나", "파워", "근성", "지능"]);
  if (!$statsTable) return {};

  const result: GrowthRate = {};
  const rows = $statsTable.find("tr").toArray();

  for (const row of rows) {
    const cells = getRowCells($, row);
    if (cells.length < 6) continue;
    if (!cells[0].includes("성장")) continue;

    const keys: (keyof Stats)[] = ["speed", "stamina", "power", "guts", "wit"];
    for (let i = 0; i < 5; i++) {
      const match = cells[i + 1].match(/([+-]?\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num !== 0) result[keys[i]] = num;
      }
    }
    break;
  }

  return result;
}

// ─── 적성 ──────────────────────────────────────

function extractAptitudes($: cheerio.CheerioAPI): Aptitudes {
  const empty: Aptitudes = {
    surface: { turf: "G", dirt: "G" },
    distance: { sprint: "G", mile: "G", medium: "G", long: "G" },
    style: { runner: "G", leader: "G", betweener: "G", chaser: "G" },
  };

  const $aptTable = findTableByCellText($, "경기장 적성");
  if (!$aptTable) return empty;

  const result = structuredClone(empty);
  const rows = $aptTable.find("tr").toArray();

  for (const row of rows) {
    const cells = getRowCells($, row);
    if (cells.length < 2) continue;

    const [label, value] = cells;
    if (label.includes("경기장")) {
      result.surface.turf = extractGrade(value, "잔디") ?? "G";
      result.surface.dirt = extractGrade(value, "더트") ?? "G";
    } else if (label.includes("거리")) {
      result.distance.sprint = extractGrade(value, "단거리") ?? "G";
      result.distance.mile = extractGrade(value, "마일") ?? "G";
      result.distance.medium = extractGrade(value, "중거리") ?? "G";
      result.distance.long = extractGrade(value, "장거리") ?? "G";
    } else if (label.includes("각질")) {
      result.style.runner = extractGrade(value, "도주") ?? "G";
      result.style.leader = extractGrade(value, "선행") ?? "G";
      result.style.betweener = extractGrade(value, "선입") ?? "G";
      result.style.chaser = extractGrade(value, "추입") ?? "G";
    }
  }

  return result;
}

function extractGrade(text: string, label: string): AptitudeGrade | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*([SABCDEFG])`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const g = match[1].toUpperCase() as AptitudeGrade;
  return APTITUDE_GRADES.includes(g) ? g : null;
}

// ─── 육성 목표 ───────────────────────────────────

function extractTrainingGoals($: cheerio.CheerioAPI): TrainingGoal[] {
  const goals: TrainingGoal[] = [];

  const $goalTable = findTableByCellText($, "목표 1");
  if (!$goalTable) return goals;

  const rows = $goalTable.find("tr").toArray();

  for (let i = 0; i < rows.length; i += 2) {
    const headerCells = getRowCells($, rows[i]);
    if (headerCells.length < 2) continue;

    const orderMatch = headerCells[0].match(/목표\s*(\d+)/);
    if (!orderMatch) continue;

    const order = parseInt(orderMatch[1], 10);
    const description = headerCells[1];

    let deadline: TrainingGoal["deadline"] = null;
    let requiredFans: TrainingGoal["requiredFans"] = null;
    let raceInfo: TrainingGoal["raceInfo"] = null;

    if (i + 1 < rows.length) {
      const detailText = $(rows[i + 1]).text();
      deadline = parseDeadline(detailText);
      requiredFans = parseRequiredFans(detailText);
      raceInfo = parseGoalRaceInfo(detailText);
    }

    const raceNameMatch = description.match(/^(.+?)에서/);
    const raceName = raceNameMatch ? raceNameMatch[1].trim() : null;
    const placementMatch = description.match(/(\d+착[^,\s]*)/);
    const placement = placementMatch ? placementMatch[1] : null;

    goals.push({
      order,
      description,
      raceName,
      placement,
      deadline,
      requiredFans,
      raceInfo,
    });
  }

  return goals;
}

function parseDeadline(text: string): TrainingGoal["deadline"] {
  const match = text.match(/기한\s*[:：]\s*(주니어급|클래식급|시니어급)\s*(\d+)월\s*(전반|후반)/);
  if (!match) return null;
  return {
    class: match[1] as ClassLevel,
    turn: {
      month: parseInt(match[2], 10),
      half: match[3] === "전반" ? 1 : 2,
    },
  };
}

function parseRequiredFans(text: string): number | null {
  const match = text.match(/필요\s*팬수\s*[:：]\s*([\d,]+)/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10);
}

function parseGoalRaceInfo(text: string): TrainingGoal["raceInfo"] {
  const gradeMatch = text.match(
    /(G1|G2|G3|OP|Pre-OP)\s*\/\s*([^/]+?)\s*\/\s*(잔디|더트)\s*\/\s*(\d+)m\s*\(([^)]+)\)\s*\/\s*(우|좌|직선)(?:\s*\/\s*(내측|외측))?/
  );
  if (!gradeMatch) return null;
  return {
    grade: gradeMatch[1],
    venue: gradeMatch[2].trim(),
    surface: gradeMatch[3] as "잔디" | "더트",
    distance: parseInt(gradeMatch[4], 10),
    distanceCategory: gradeMatch[5].trim(),
    rotation: gradeMatch[6],
    side: gradeMatch[7] || null,
  };
}

// ─── 테이블 검색 & 셀 헬퍼 ────────────────────────

/**
 * 한 행에서 td와 th를 순서대로 모두 추출.
 * 이 프로젝트의 인벤 테이블은 행 라벨이 <th>인 경우가 많아서 함께 처리해야 함.
 */
function getRowCells($: cheerio.CheerioAPI, row: any): string[] {
  return $(row)
    .find("td, th")
    .toArray()
    .map((c) => $(c).text().trim());
}

function findTableByHeaders(
  $: cheerio.CheerioAPI,
  headers: string[]
): cheerio.Cheerio<any> | null {
  let result: cheerio.Cheerio<any> | null = null;
  $("table").each((_, table) => {
    if (result) return;
    const text = $(table).text();
    if (headers.every((h) => text.includes(h))) {
      result = $(table);
    }
  });
  return result;
}

function findTableByCellText(
  $: cheerio.CheerioAPI,
  text: string
): cheerio.Cheerio<any> | null {
  let result: cheerio.Cheerio<any> | null = null;
  $("table").each((_, table) => {
    if (result) return;
    const $table = $(table);
    $table.find("td, th").each((__, cell) => {
      if ($(cell).text().includes(text)) {
        result = $table;
        return false;
      }
    });
  });
  return result;
}