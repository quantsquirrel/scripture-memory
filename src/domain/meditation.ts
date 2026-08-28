import { VERSE_BY_ID } from '../data/verses'
import type { CandidateTable } from '../data/xrefCandidates'

/**
 * 오늘 읽은 본문에서 묵상할 말씀 하나를 고른다.
 *
 * 무거운 계산은 빌드 때 끝나 있다 — scripts/data/build_xref.ts가 상호참조
 * 34만 간선을 걸어 "장 하나 → 떠올릴 만한 암송구절 10개 + 그 구절에 이르는
 * 참조 사슬"을 미리 만들어 둔다. 여기서 하는 일은 오늘 읽은 장들의 표를 합치고,
 * 최근에 보여준 구절을 눌러 두고, 하나를 고르는 것뿐이다.
 *
 * 표는 인자로 받는다 — 1MB짜리 데이터를 도메인이 직접 import하면 메인 번들에
 * 섞여 첫 화면까지 무거워진다(src/data/xrefCandidates.ts의 동적 로더 참고).
 *
 * 고르기는 날짜의 순수 함수다 — 같은 날 다시 열어도, 다른 기기에서 열어도
 * 같은 구절이 나온다. 무작위성은 동점일 때 날짜 해시로만 들어간다.
 */

/** 통독 본문과 QT 본문 중 어느 쪽에서 왔는가 */
export type Origin = 'reading' | 'qt'

export interface SourceChapter {
  /** 후보표 키 — '창5', '고전15' */
  key: string
  /** 사람이 읽는 표기 — '창 5' */
  label: string
  origin: Origin
}

export interface MeditationPick {
  verseId: string
  /**
   * 이 구절에 이르는 참조 사슬들 — 각 사슬은 [오늘 읽은 절, …거쳐온 참조,
   * 묵상 구절]. 마지막 항목이 묵상 구절 자신이므로 화면에서는 앞부분만
   * "참조"로 보인다.
   */
  chains: readonly (readonly string[])[]
  /** 사슬이 시작된 오늘의 본문 */
  from: SourceChapter
  score: number
}

export interface MeditationResult {
  pick: MeditationPick | null
  /** 같은 날 함께 떠오른 다른 말씀들 (점수 순) */
  alternates: readonly MeditationPick[]
}

/** 최근에 보여준 기록 — 같은 말씀이 금방 다시 오지 않게 한다 */
export interface ShownEntry {
  /** 'YYYY-MM-DD' */
  date: string
  verseId: string
}

const W = {
  /**
   * QT 본문의 몫. 통독은 하루 3-5장을 훑고 QT는 한 장을 깊이 파므로, 장 수로
   * 나누면 QT가 늘 밀린다. 절반씩 나눠 둘 다 목소리를 내게 한다.
   */
  qtShare: 0.5,
  /** 이 기간 안에 보여준 구절은 다시 고르지 않는다 (다른 후보가 있는 한) */
  holdDays: 60,
  /** 같은 주제가 이 기간 안에 나왔으면 점수를 절반으로 */
  topicHoldDays: 10,
  topicPenalty: 0.5,
  /** 화면에 함께 보여줄 대안 개수 */
  alternates: 3,
}

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)

/** 동점일 때만 쓰는 결정적 흔들기 — 같은 날짜면 늘 같은 값이다 */
function tieBreak(dateKey: string, verseId: string): number {
  let h = 2166136261
  for (const ch of `${dateKey}|${verseId}`) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1e9 // 점수 차보다 훨씬 작게
}

/** 후보표 키 — '창5' */
export const chapterKey = (book: string, chapter: number): string => `${book}${chapter}`

/**
 * 오늘의 묵상 구절.
 *
 * @param table 빌드 때 만든 후보표 (loadCandidates())
 * @param chapters 오늘 읽은 장들 (통독 + QT)
 * @param shown 최근 보여준 기록 (최신순일 필요 없음)
 * @param dateKey 오늘 'YYYY-MM-DD'
 */
export function pickMeditation(
  table: CandidateTable,
  chapters: readonly SourceChapter[],
  shown: readonly ShownEntry[],
  dateKey: string,
): MeditationResult {
  const readingChapters = chapters.filter((c) => c.origin === 'reading')
  const qtChapters = chapters.filter((c) => c.origin === 'qt')
  // 통독만 있으면 통독이 전부를 갖는다 — QT를 아직 적어두지 않은 날에도 동작한다
  const readingShare = qtChapters.length === 0 ? 1 : 1 - W.qtShare
  const qtShare = readingChapters.length === 0 ? 1 : W.qtShare

  const massOf = (c: SourceChapter): number =>
    c.origin === 'qt' ? qtShare / qtChapters.length : readingShare / readingChapters.length

  /** 오늘 읽은 장 — 여기 있는 구절은 "다른 말씀"이 아니므로 고르지 않는다 */
  const todayKeys = new Set(chapters.map((c) => c.key))

  /** 암송구절 id → 누적 점수 + 가장 강하게 이끈 장의 경로 */
  const acc = new Map<
    string,
    { score: number; best: number; chains: readonly (readonly string[])[]; from: SourceChapter }
  >()
  for (const chapter of chapters) {
    const mass = massOf(chapter)
    for (const cand of table[chapter.key] ?? []) {
      const verse = VERSE_BY_ID[cand.v]
      if (!verse) continue // 코퍼스가 바뀌어 사라진 구절은 조용히 건너뛴다
      if (todayKeys.has(chapterKey(verse.bookAbbr, verse.chapter))) continue
      const contribution = cand.s * mass
      const prev = acc.get(cand.v)
      if (!prev) {
        acc.set(cand.v, {
          score: contribution,
          best: contribution,
          chains: cand.c,
          from: chapter,
        })
      } else {
        prev.score += contribution
        if (contribution > prev.best) {
          prev.best = contribution
          prev.chains = cand.c
          prev.from = chapter
        }
      }
    }
  }
  if (acc.size === 0) return { pick: null, alternates: [] }

  // ── 최근에 본 것 누르기 ─────────────────────────────────────
  const lastShown = new Map<string, string>()
  for (const e of shown) {
    const prev = lastShown.get(e.verseId)
    if (prev === undefined || prev < e.date) lastShown.set(e.verseId, e.date)
  }
  const lastTopic = new Map<string, string>()
  for (const e of shown) {
    const topic = VERSE_BY_ID[e.verseId]?.topicKey
    if (topic === undefined) continue
    const prev = lastTopic.get(topic)
    if (prev === undefined || prev < e.date) lastTopic.set(topic, e.date)
  }

  const scored = [...acc].map(([verseId, v]) => {
    const seenAt = lastShown.get(verseId)
    const held = seenAt !== undefined && dayDiff(dateKey, seenAt) < W.holdDays
    const topic = VERSE_BY_ID[verseId]?.topicKey
    const topicAt = topic === undefined ? undefined : lastTopic.get(topic)
    const topicHeld = topicAt !== undefined && dayDiff(dateKey, topicAt) < W.topicHoldDays
    const adjusted = v.score * (topicHeld ? W.topicPenalty : 1) + tieBreak(dateKey, verseId)
    return { verseId, chains: v.chains, from: v.from, score: adjusted, held }
  })

  // 최근에 보여준 구절은 뒤로 미룬다. 남는 게 없으면 그때는 허용한다 —
  // 빈 화면을 내놓느니 한 번 더 만나는 편이 낫다.
  const fresh = scored.filter((s) => !s.held)
  const pool = (fresh.length > 0 ? fresh : scored).sort((a, b) => b.score - a.score)

  const toPick = ({ verseId, chains, from, score }: (typeof pool)[number]): MeditationPick => ({
    verseId,
    chains,
    from,
    score,
  })
  return {
    pick: pool[0] ? toPick(pool[0]) : null,
    alternates: pool.slice(1, 1 + W.alternates).map(toPick),
  }
}
