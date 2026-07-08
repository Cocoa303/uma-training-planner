import { writeFileSync, mkdirSync } from "node:fs";
import { fetchHtml } from "./utils.js";
import { parseRaces } from "./parse-races.js";

const INVEN_RACE_URL = "https://uma.inven.co.kr/db/race/";
const OUTPUT_PATH = "data/races.json";

async function main() {
  console.log("Fetching race list from Inven...");
  const html = await fetchHtml(INVEN_RACE_URL);

  console.log("Parsing...");
  const races = parseRaces(html);

  console.log(`Parsed ${races.length} races.`);

  // data 폴더 없으면 생성
  mkdirSync("data", { recursive: true });

  // JSON 파일로 저장 (들여쓰기 2칸, 한글 그대로)
  writeFileSync(OUTPUT_PATH, JSON.stringify(races, null, 2), "utf-8");
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});