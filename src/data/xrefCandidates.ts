/**
 * 상호참조 후보표 — "이 장을 읽었을 때 떠올릴 만한 암송구절과 그 참조 사슬".
 *
 * scripts/data/build_xref.ts가 OpenBible.info 상호참조(CC-BY) 34만 간선을 걸어
 * 미리 만든다. 1MB가 넘어 메인 번들에 섞으면 앱 첫 화면까지 무거워지므로
 * 동적 import로 떼어 둔다 — 묵상 탭을 열 때 한 번만 받아 캐시하고, 서비스
 * 워커가 미리 캐시하므로 오프라인에서도 그대로 열린다(하드 경계 4).
 */
export interface Candidate {
  /** 암송구절 id */
  v: string
  /** 그 장 안에서의 상대 점수 (원 점수 ×1e7의 정수) */
  s: number
  /**
   * 참조 사슬들. 각 사슬은 [오늘 읽은 절, …거쳐온 참조, 인용된 목적지] 장절 표기.
   * 오늘 본문의 여러 자리가 같은 말씀을 함께 가리키는 일이 흔해서 하나만
   * 남기지 않는다 — 그 여럿이 곧 "영향을 미친 참조 말씀들"이다.
   */
  c: string[][]
}

/** '창5' → 후보 목록 */
export type CandidateTable = Record<string, Candidate[] | undefined>

let cached: Promise<CandidateTable> | null = null

export function loadCandidates(): Promise<CandidateTable> {
  cached ??= import('./xrefCandidates.json').then((m) => m.default as CandidateTable)
  return cached
}
