import * as cheerio from "cheerio";

export interface CharacterListEntry {
  id: string;
  iconUrl: string;
}

/**
 * 캐릭터 목록 페이지에서 (id, iconUrl) 쌍을 추출.
 * 아이콘 파일명은 캐릭터 ID와 규칙이 다르므로 링크에 함께 있는 img를 매핑해서 저장한다.
 */
export function parseCharacterList(html: string): CharacterListEntry[] {
  const $ = cheerio.load(html);
  const entries = new Map<string, string>();

  $('a[href*="/db/chara/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") || "";
    const match = href.match(/\/db\/chara\/(\d+)/);
    if (!match) return;

    const id = match[1];
    const $img = $el.find('img[src*="charaicon"]').first();
    const iconUrl = $img.attr("src") || "";

    // 아이콘 있는 첫 번째 링크만 채택 (같은 캐릭터가 여러 링크로 존재하는 경우 대비)
    if (!entries.has(id) && iconUrl) {
      entries.set(id, iconUrl);
    }
  });

  return Array.from(entries.entries())
    .map(([id, iconUrl]) => ({ id, iconUrl }))
    .sort((a, b) => a.id.localeCompare(b.id));
}