import { BOOK_BY_ABBR } from '../data/canon'

/**
 * QT 본문 위치.
 *
 * 통독 계획은 앱이 통째로 알고 있지만 QT 진도는 그렇지 않다 — 매일 카톡방에
 * 올라오고, 책을 옮겨 다니며, 건너뛰는 날도 있다. 네트워크를 필수 의존으로
 * 만들지 않으려고(하드 경계 4) 마지막으로 확인한 위치를 저장해 두고, 날짜가
 * 지난 만큼 한 장씩 밀어 기본값을 만든다. 틀리면 사용자가 한 번 고치면 된다.
 */
export interface QtPosition {
  /** 개역한글 표준 약칭 */
  book: string
  chapter: number
}

/** 저장 형식 '고전 15' ↔ 위치 */
export function formatQt(p: QtPosition): string {
  return `${p.book} ${p.chapter}`
}

export function parseQt(raw: string): QtPosition | null {
  const m = /^(\S+)\s+(\d+)$/.exec(raw.trim())
  if (!m?.[1] || !m[2]) return null
  const book = BOOK_BY_ABBR.get(m[1])
  if (!book) return null
  const chapter = parseInt(m[2], 10)
  return chapter >= 1 && chapter <= book.chapters ? { book: book.abbr, chapter } : null
}

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)

/**
 * 저장된 위치를 오늘까지 밀어 본 기본값.
 *
 * 하루 한 장이 QT의 보통 속도다. 책 끝을 넘지는 않는다 — 다음 책이 무엇인지는
 * 앱이 알 수 없으므로, 끝에 닿으면 거기 머물러 "이제 직접 골라 달라"는 신호가
 * 된다. 미래 날짜나 형식이 깨진 저장값은 조용히 무시한다.
 */
export function advanceQt(
  saved: QtPosition,
  savedDate: string,
  today: string,
): { position: QtPosition; estimated: boolean } {
  const elapsed = dayDiff(today, savedDate)
  if (!Number.isFinite(elapsed) || elapsed <= 0) return { position: saved, estimated: false }
  const book = BOOK_BY_ABBR.get(saved.book)
  if (!book) return { position: saved, estimated: false }
  const chapter = Math.min(saved.chapter + elapsed, book.chapters)
  return { position: { book: saved.book, chapter }, estimated: true }
}
