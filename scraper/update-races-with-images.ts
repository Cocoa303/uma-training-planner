/**
 * races.json 에 image 필드 추가.
 * gametora-races.json 의 name_ko 로 매칭하여 banner_id → image path 부여.
 *
 * 결과: races.json 을 직접 덮어씀 (원본 백업 권장)
 */
import * as fs from "fs";
import * as path from "path";
import racesData from "../data/races.json";
import gametoraData from "../data/gametora-races.json";

interface GametoraRace {
  banner_id: number;
  name_ko: string;
  unreleased_servers?: string[];
}

interface Race {
  id: string;
  name: string;
  grade: string;
  venue: string;
  surface: string;
  distance: number;
  distanceCategory: string;
  rotation: string;
  side: string | null;
  turn: { month: number; half: 1 | 2 };
  eligibleClasses: string[];
  fansGained: number;
  isOverseas: boolean;
  image?: string;
}

const ourRaces = racesData as Race[];
const gametoraRaces = gametoraData as GametoraRace[];

// GameTora 데이터를 name_ko → banner_id 로 인덱싱
// 같은 name_ko 에 여러 banner_id 가 있으면 첫 번째 사용
const bannerByName = new Map<string, number>();
for (const gt of gametoraRaces) {
  if (!gt.name_ko || !gt.banner_id) continue;
  if (gt.unreleased_servers?.includes("ko")) continue;
  if (!bannerByName.has(gt.name_ko)) {
    bannerByName.set(gt.name_ko, gt.banner_id);
  }
}

console.log(`\nGameTora 매핑: ${bannerByName.size}개 레이스\n`);

// 이미지 파일 존재 확인용
const IMAGE_DIR = path.join(process.cwd(), "public", "images", "race");

let matchedCount = 0;
let missingImageCount = 0;
let noMappingCount = 0;
const noMappingList: string[] = [];
const missingImageList: { name: string; bannerId: number }[] = [];

const updated: Race[] = ourRaces.map((race) => {
  const bannerId = bannerByName.get(race.name);
  if (!bannerId) {
    noMappingCount++;
    noMappingList.push(race.name);
    return race;
  }

  // 이미지 파일 실제 존재 확인
  const imagePath = path.join(IMAGE_DIR, `${bannerId}.png`);
  if (!fs.existsSync(imagePath)) {
    missingImageCount++;
    missingImageList.push({ name: race.name, bannerId });
    return race;
  }

  matchedCount++;
  return {
    ...race,
    image: `/images/race/${bannerId}.png`,
  };
});

console.log(`✓ 이미지 매칭 성공: ${matchedCount}개`);
console.log(`✗ 매핑 없음: ${noMappingCount}개`);
console.log(`✗ 이미지 파일 없음: ${missingImageCount}개`);

if (noMappingList.length > 0) {
  console.log(`\n=== GameTora 매핑 없는 레이스 ===`);
  for (const name of noMappingList) {
    console.log(`  ${name}`);
  }
}

if (missingImageList.length > 0) {
  console.log(`\n=== 이미지 파일 없는 레이스 ===`);
  for (const { name, bannerId } of missingImageList) {
    console.log(`  ${name} (banner_id: ${bannerId})`);
  }
}

// 백업 및 저장
const RACES_PATH = path.join(process.cwd(), "data", "races.json");
const BACKUP_PATH = path.join(process.cwd(), "data", "races.backup.json");

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(RACES_PATH, BACKUP_PATH);
  console.log(`\n원본 백업: ${BACKUP_PATH}`);
}

fs.writeFileSync(RACES_PATH, JSON.stringify(updated, null, 2), "utf-8");
console.log(`\n업데이트 완료: ${RACES_PATH}`);