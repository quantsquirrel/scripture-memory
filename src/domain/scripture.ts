/**
 * 장절 표기를 본문으로 바꾸는 순수 모듈.
 *
 * 정본은 두 단이다. **495구절은 "외울 본문"** — 원문 소스와 어절 단위로
 * 전수 대조를 통과한, 채점·학습·표시의 정본이다. **전문은 "펼쳐 볼 본문"**
 * — 참조 사슬을 읽는 데 곁들이는 표시 전용 본문이다. 두 코퍼스는 검증
 * 이력이 다르므로 합치지 않고 역할로 가른다. **겹치는 자리는 언제나 495가
 * 이긴다.**
 *
 * 여기서 나온 본문을 채점 대상(gradeTyping의 target)으로 넘기지 말 것 —
 * 하드 경계 1이 지키는 것은 "증거가 검증된 본문에서 나온다"는 사실이다.
 */

/**
 * '창1' → 절 본문 배열. 배열 인덱스+1이 절 번호다.
 *
 * 개역한글에는 두 절이 한 덩어리로 인쇄된 자리가 19개 장에 있다(예: 사 7:8-9).
 * 그 덩어리는 첫 절 자리에 본문을 두고 이어지는 절 자리를 null로 남긴다 —
 * 없는 절 번호를 지어내지도, 뒤 절을 비우지도 않는다.
 */
export type FullText = Record<string, readonly (string | null)[] | undefined>

export interface Passage {
  /**
   * 실제로 실린 본문의 장절. 요청한 장절보다 넓을 수 있다 — 합본 절이거나
   * (사 7:9를 물으면 사 7:8-9가 온다) 암송 구절이 여러 절을 아우를 때다.
   */
  ref: string
  text: string
}

/** '삼하 11:2' → 그 절을 품은 암송 구절 */
export type Corpus = ReadonlyMap<string, Passage>

export interface ScriptureSources {
  readonly corpus: Corpus
  /** 아직 안 실렸으면 null — 그동안에도 495는 그대로 보인다 */
  readonly full: FullText | null
}

const REF_RE = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/

export interface ParsedRef {
  book: string
  chapter: number
  from: number
  to: number
}

export function parseRef(label: string): ParsedRef | null {
  const m = REF_RE.exec(label)
  if (!m?.[1] || !m[2] || !m[3]) return null
  const from = parseInt(m[3], 10)
  const to = m[4] === undefined ? from : parseInt(m[4], 10)
  if (to < from) return null
  return { book: m[1], chapter: parseInt(m[2], 10), from, to }
}

interface Block {
  /** 이 덩어리가 덮는 첫 절 */
  start: number
  /** 마지막 절. 합본이 아니면 start와 같다 */
  end: number
  text: string
}

/** 절 번호가 합본 덩어리 안이면 그 덩어리를 통째로 돌려준다. */
function blockAt(arr: readonly (string | null)[], verse: number): Block | null {
  let i = verse - 1
  if (i < 0 || i >= arr.length) return null
  while (arr[i] === null) i--
  const text = arr[i]
  if (text === undefined || text === null) return null
  let j = i + 1
  while (j < arr.length && arr[j] === null) j++
  return { start: i + 1, end: j, text }
}

function rangeLabel(book: string, chapter: number, from: number, to: number): string {
  return from === to ? `${book} ${chapter}:${from}` : `${book} ${chapter}:${from}-${to}`
}

export function textOf(sources: ScriptureSources, label: string): Passage | null {
  const ref = parseRef(label)
  if (!ref) return null

  // 1. 외울 본문이 먼저다 — 사용자가 실제로 외운 그 문장을 보여준다
  for (let n = ref.from; n <= ref.to; n++) {
    const hit = sources.corpus.get(`${ref.book} ${ref.chapter}:${n}`)
    if (hit) return hit
  }

  // 2. 없으면 펼쳐 볼 본문에서 절 범위를 이어붙인다
  const arr = sources.full?.[`${ref.book}${ref.chapter}`]
  if (!arr) return null
  const texts: string[] = []
  let from = ref.from
  let to = ref.to
  let n = ref.from
  while (n <= ref.to) {
    const block = blockAt(arr, n)
    if (!block) return null
    if (texts.length === 0) from = Math.min(from, block.start)
    to = Math.max(to, block.end)
    texts.push(block.text)
    n = block.end + 1
  }
  if (texts.length === 0) return null
  return { ref: rangeLabel(ref.book, ref.chapter, from, to), text: texts.join(' ') }
}
