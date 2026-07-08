import { writeFileSync, mkdirSync } from "node:fs";
import { fetchHtml, sleep } from "./utils.js";
import { parseCharacterList } from "./parse-character-list.js";
import { parseCharacterDetail } from "./parse-character-detail.js";
import { downloadImage } from "./download-image.js";
import type { Character } from "../src/types/character.js";

const LIST_URL = "https://uma.inven.co.kr/db/chara/";
const DETAIL_URL = (id: string) => `https://uma.inven.co.kr/db/chara/${id}`;
const OUTPUT_PATH = "data/characters.json";
const IMAGE_DIR = "public/images/chara";

const REQUEST_DELAY_MS = 800;

async function main() {
  console.log("=== Uma Character Crawler ===");

  console.log("[1/3] Fetching character list...");
  const listHtml = await fetchHtml(LIST_URL);
  const entries = parseCharacterList(listHtml);
  console.log(`Found ${entries.length} character entries.`);

  console.log(`[2/3] Fetching detail pages (delay: ${REQUEST_DELAY_MS}ms)...`);
  mkdirSync(IMAGE_DIR, { recursive: true });

  const characters: Character[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const { id, iconUrl } = entries[i];
    const progress = `[${i + 1}/${entries.length}]`;

    try {
      await sleep(REQUEST_DELAY_MS);
      const detailUrl = DETAIL_URL(id);
      const detailHtml = await fetchHtml(detailUrl);
      const character = parseCharacterDetail(id, detailHtml, detailUrl, iconUrl);

      if (!character) {
        console.warn(`${progress} parse failed: ${id}`);
        failCount++;
        continue;
      }

      const iconWebPath = await downloadImage(character.images.icon, IMAGE_DIR, `${id}_icon`);
      const casualWebPath = character.images.casual
        ? await downloadImage(character.images.casual, IMAGE_DIR, `${id}_casual`)
        : null;
      const raceWebPath = character.images.race
        ? await downloadImage(character.images.race, IMAGE_DIR, `${id}_race`)
        : null;

      character.images = {
        icon: iconWebPath ?? character.images.icon,
        casual: casualWebPath,
        race: raceWebPath,
      };

      characters.push(character);
      successCount++;
      console.log(`${progress} ✓ ${character.fullName}`);
    } catch (err) {
      console.error(`${progress} ✗ ${id}:`, err instanceof Error ? err.message : err);
      failCount++;
    }
  }

  console.log(`[3/3] Writing ${OUTPUT_PATH}...`);
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(characters, null, 2), "utf-8");
  console.log("");
  console.log(`Done. Success: ${successCount}, Fail: ${failCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});