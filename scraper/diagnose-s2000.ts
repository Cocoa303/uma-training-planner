import racesData from "../data/races.json";
import factorsData from "../data/factors.json";
import type { Race } from "../src/types/race";

const races = racesData as Race[];

interface FactorsFile {
  hidden: Array<{ id: string; name: string; condition: any }>;
}

const factors = factorsData as unknown as FactorsFile;

const s2000 = factors.hidden.find((f) => f.id === "s2000");
if (!s2000) {
  console.log("s2000 인자를 찾을 수 없음");
  process.exit(1);
}

console.log(`\n=== ${s2000.name} 진단 ===\n`);
console.log(`조건 종류: ${s2000.condition.kind}`);
console.log(`필요 카운트: ${s2000.condition.requiredCount}\n`);

const raceNames: string[] = s2000.condition.raceNames;

console.log(`대상 레이스 ${raceNames.length}개:\n`);

for (const name of raceNames) {
  const matches = races.filter((r) => r.name === name);
  if (matches.length === 0) {
    console.log(`  ❌ "${name}" — races.json 에서 못 찾음`);
    // 유사 이름 제안
    const similar = races.filter(
      (r) => r.name.includes(name.slice(0, 3)) || name.includes(r.name.slice(0, 3))
    );
    if (similar.length > 0) {
      console.log(`     유사 후보:`);
      for (const s of similar.slice(0, 5)) {
        console.log(`     - "${s.name}"`);
      }
    }
  } else {
    for (const race of matches) {
      const cls = race.eligibleClasses.join(",");
      console.log(
        `  ✓ "${name}" | ${cls} ${race.turn.month}/${race.turn.half} | ${race.venue} · ${race.surface} · ${race.distance}m`
      );
    }
  }
}

console.log();