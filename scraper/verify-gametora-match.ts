/**
 * races.json 과 gametora-races.json 매칭 검증.
 * name_ko 기준으로 매칭 시도, 매칭 안 되는 항목 리포트.
 */
import racesData from "../data/races.json";
import gametoraData from "../data/gametora-races.json";
import type { Race } from "../src/types/race";

interface GametoraRace {
  banner_id: number;
  race_id: number;
  id: number;
  name_ko: string;
  name_jp: string;
  name_en: string;
  grade: number;
  distance: number;
  terrain: number;
  unreleased_servers?: string[];
}

const ourRaces = racesData as Race[];
const gametoraRaces = gametoraData as GametoraRace[];

console.log(`\n=== 매칭 검증 ===`);
console.log(`우리 races.json: ${ourRaces.length}개`);
console.log(`GameTora races: ${gametoraRaces.length}개\n`);

// GameTora 데이터 인덱싱: name_ko → 배열 (동명 레이스가 여러 개 있을 수 있음)
const byNameKo = new Map<string, GametoraRace[]>();
for (const gt of gametoraRaces) {
  if (!gt.name_ko) continue;
  // 한국 서버 미출시 레이스 제외
  if (gt.unreleased_servers?.includes("ko")) continue;

  const list = byNameKo.get(gt.name_ko) ?? [];
  list.push(gt);
  byNameKo.set(gt.name_ko, list);
}

// 매칭 시도
let exactMatchCount = 0;
let partialMatchCount = 0;
let noMatchCount = 0;
const noMatchList: string[] = [];
const partialMatchList: { our: string; gametora: string }[] = [];

for (const race of ourRaces) {
  // 1. 정확 매칭
  const exact = byNameKo.get(race.name);
  if (exact && exact.length > 0) {
    exactMatchCount++;
    continue;
  }

  // 2. 부분 매칭 (양방향 includes)
  let matched: string | null = null;
  for (const [gtName] of byNameKo) {
    if (race.name.includes(gtName) || gtName.includes(race.name)) {
      matched = gtName;
      break;
    }
  }

  if (matched) {
    partialMatchCount++;
    partialMatchList.push({ our: race.name, gametora: matched });
    continue;
  }

  noMatchCount++;
  noMatchList.push(race.name);
}

console.log(`✓ 정확 매칭: ${exactMatchCount}개`);
console.log(`~ 부분 매칭: ${partialMatchCount}개`);
console.log(`✗ 매칭 실패: ${noMatchCount}개`);

if (partialMatchList.length > 0) {
  console.log(`\n=== 부분 매칭 목록 ===`);
  for (const p of partialMatchList) {
    console.log(`  "${p.our}"  ↔  "${p.gametora}"`);
  }
}

if (noMatchList.length > 0) {
  console.log(`\n=== 매칭 실패 목록 ===`);
  for (const name of noMatchList) {
    console.log(`  "${name}"`);
  }
}

console.log();