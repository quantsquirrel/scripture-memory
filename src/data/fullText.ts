/**
 * 개역한글 전문 — 참조 사슬을 "펼쳐 볼 본문".
 *
 * 대한성서공회 『성경전서 개역한글판』에서 받아 `scripts/data/build_fulltext.py`가
 * 게이트 네 개(구조·골든 495 대조·역본 판별·사슬 해석)를 통과시킨 것만 만든다.
 * 출처와 저작권은 `fullText.LICENSE.txt`에 있다.
 *
 * 4.5MB라 메인 번들에 섞으면 홈·복습 화면까지 무거워진다 — 동적 import로
 * 떼어 두고, 묵상 탭을 열 때 한 번만 받아 캐시한다. 서비스 워커가 미리
 * 캐시하므로 오프라인에서도 그대로 열린다(하드 경계 4). 상호참조 후보표를
 * 떼어 둔 것과 같은 이유이며, `tests/boundaries.test.ts`가 지킨다.
 *
 * precache에 실으려면 workbox의 `maximumFileSizeToCacheInBytes` 기본값
 * 2 MiB를 넘겨야 한다 — `vite.config.ts`를 함께 볼 것.
 */
import type { FullText } from '../domain/scripture'

let cached: Promise<FullText> | null = null

export function loadFullText(): Promise<FullText> {
  cached ??= import('./fullText.json').then((m) => m.default as FullText)
  return cached
}
