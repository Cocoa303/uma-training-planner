/**
 * 배포 환경 (GitHub Pages 등)에서 base URL 을 자동으로 붙여주는 헬퍼.
 *
 * data/*.json 에는 이미지 경로가 "/images/..." 형태의 절대 경로로 저장되어 있는데,
 * GitHub Pages 배포 시엔 실제 URL 이 "/uma-training-planner/images/..." 이어야 함.
 *
 * Vite 는 `import.meta.env.BASE_URL` 로 현재 base URL 을 제공하므로
 * 이 값을 앞에 붙여준다. 로컬 dev 에서는 BASE_URL 이 "/" 라 결과가 동일.
 */
export function assetPath(path: string | undefined | null): string | undefined {
  if (!path) return undefined;

  const base = import.meta.env.BASE_URL.replace(/\/$/, ""); // 끝 슬래시 제거
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}