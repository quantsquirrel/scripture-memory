import raw from './verses.json'

export interface VerseEntry {
  id: string
  topicKey: string
  ref: string
  refAbbr: string
  book: string
  bookAbbr: string
  chapter: number
  verses: number[]
  text: string
}

export interface SeriesInfo {
  key: string
  title: string
  subtitle: string
}

const data = raw as {
  series: Record<string, { title: string; subtitle: string }>
  topics: Record<string, string>
  verses: VerseEntry[]
}

export const SERIES: SeriesInfo[] = Object.entries(data.series).map(([key, s]) => ({
  key,
  ...s,
}))

export const TOPIC_TITLES: Record<string, string> = data.topics

export const VERSES: VerseEntry[] = data.verses

export const VERSE_BY_ID: Record<string, VerseEntry> = Object.fromEntries(
  VERSES.map((v) => [v.id, v]),
)

export function seriesOf(v: VerseEntry): SeriesInfo {
  const s = SERIES.find((s) => s.key === v.topicKey[0])
  if (!s) throw new Error(`unknown series for ${v.id}`)
  return s
}

export function topicOf(v: VerseEntry): string {
  return TOPIC_TITLES[v.topicKey]
}

/** 책 이름/약칭 → 약칭 (장절 입력 채점용) */
export const BOOK_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const v of VERSES) {
    m[v.book] = v.bookAbbr
    m[v.bookAbbr] = v.bookAbbr
  }
  return m
})()
