/**
 * URL에서 HTML을 다운로드해 문자열로 반환.
 * Node.js 내장 fetch를 사용 (Node 18+).
 */
export async function fetchHtml(url: string): Promise<string> {
  console.log(`[fetch] ${url}`);
  const res = await fetch(url, {
    headers: {
      // User-Agent를 명시하는 게 예의. 봇으로 보여도 되지만 정직하게.
      "User-Agent": "uma-training-planner-scraper/0.1 (hobby project)",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  return await res.text();
}

/**
 * 요청 간 잠시 대기 (서버 부담 완화).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}