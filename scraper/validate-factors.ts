import racesData from "../data/races.json";
import factorsData from "../data/factors.json";
import type { Race } from "../src/types/race";

const races = racesData as Race[];
const raceNames = new Set(races.map((r) => r.name));

interface FactorsFile {
  nickname: Array<{ id: string; name: string; condition: any }>;
  hidden: Array<{ id: string; name: string; condition: any }>;
}

const factors = factorsData as unknown as FactorsFile;

// 조건에서 레이스명 추출
function extractRaceNames(condition: any): string[] {
  if (!condition) return [];
  if (condition.kind === "race-wins" || 
      condition.kind === "race-wins-any" || 
      condition.kind === "race-wins-count" || 
      condition.kind === "race-wins-count-unique") {
    return condition.raceNames ?? [];
  }
  return [];
}

const allFactors = [...factors.nickname, ...factors.hidden];
const problems: { factor: string; missing: string[] }[] = [];

for (const factor of allFactors) {
  const requiredNames = extractRaceNames(factor.condition);
  const missing = requiredNames.filter((n) => !raceNames.has(n));
  if (missing.length > 0) {
    problems.push({ factor: factor.name, missing });
  }
}

console.log(`\n=== 인자 조건 레이스명 검증 결과 ===\n`);
console.log(`총 레이스: ${races.length}개`);
console.log(`검증한 인자: ${allFactors.length}개\n`);

if (problems.length === 0) {
  console.log("✅ 모든 레이스명이 매칭됩니다!");
} else {
  console.log(`❌ ${problems.length}개 인자에서 매칭 실패:\n`);
  for (const p of problems) {
    console.log(`  [${p.factor}]`);
    for (const name of p.missing) {
      console.log(`    - ${name}`);
    }
    console.log();
  }
  console.log(`\n총 ${problems.reduce((sum, p) => sum + p.missing.length, 0)}개의 이름이 races.json에서 발견되지 않았습니다.`);
  console.log(`인벤 크롤 데이터와 이름 표기가 다를 수 있습니다. 게임/나무위키 확인 후 factors.json 수정 필요.`);
}