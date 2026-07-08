import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { extname } from "node:path";

/**
 * URL의 이미지를 로컬에 저장. 이미 있으면 스킵.
 * 반환값: 로컬 경로 (상대경로, /images/... 로 시작하는 웹 경로 스타일)
 */
export async function downloadImage(
  url: string,
  destDir: string,
  fileNameStem: string
): Promise<string | null> {
  if (!url) return null;

  // URL 정규화 (프로토콜 없는 경우 https 추가)
  const fullUrl = url.startsWith("//") ? `https:${url}` : url;

  // 확장자 추출
  const ext = extname(new URL(fullUrl).pathname).toLowerCase() || ".png";
  const fileName = `${fileNameStem}${ext}`;
  const localPath = `${destDir}/${fileName}`;

  // 이미 있으면 스킵 (재실행 속도 향상)
  if (existsSync(localPath)) {
    return toWebPath(localPath);
  }

  // 폴더 생성
  mkdirSync(destDir, { recursive: true });

  // 다운로드
  try {
    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent": "uma-training-planner-scraper/0.1",
      },
    });
    if (!res.ok) {
      console.warn(`[image] HTTP ${res.status} for ${fullUrl}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(localPath, buffer);
    return toWebPath(localPath);
  } catch (err) {
    console.warn(`[image] failed: ${fullUrl}`, err);
    return null;
  }
}

/**
 * "public/images/chara/xxx.png" → "/images/chara/xxx.png"
 * Vite는 public/ 안의 파일을 루트 경로로 서빙함.
 */
function toWebPath(localPath: string): string {
  return "/" + localPath.replace(/^public\//, "");
}