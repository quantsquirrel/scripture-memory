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

export interface CollectionInfo {
  key: string
  title: string
  short: string
  order: number
}

export interface SectionInfo {
  key: string
  collection: string
  title: string
  subtitle: string
}

export interface TopicInfo {
  key: string
  section: string
  group: string
  title: string
}

const data = raw as {
  collections: CollectionInfo[]
  sections: SectionInfo[]
  topics: TopicInfo[]
  verses: VerseEntry[]
}

export const COLLECTIONS: CollectionInfo[] = [...data.collections].sort(
  (a, b) => a.order - b.order,
)
export const SECTIONS: SectionInfo[] = data.sections
export const TOPICS: TopicInfo[] = data.topics
/** 학습 권장 순서(5확신 → 8동행 → 60구절 → DEP) 그대로 정렬되어 있다 */
export const VERSES: VerseEntry[] = data.verses

export const VERSE_BY_ID: Record<string, VerseEntry> = Object.fromEntries(
  VERSES.map((v) => [v.id, v]),
)
const TOPIC_BY_KEY: Record<string, TopicInfo> = Object.fromEntries(
  TOPICS.map((t) => [t.key, t]),
)
const SECTION_BY_KEY: Record<string, SectionInfo> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
)
const COLLECTION_BY_KEY: Record<string, CollectionInfo> = Object.fromEntries(
  COLLECTIONS.map((c) => [c.key, c]),
)

export function topicOf(v: VerseEntry): TopicInfo {
  return TOPIC_BY_KEY[v.topicKey]
}

export function sectionOf(v: VerseEntry): SectionInfo {
  return SECTION_BY_KEY[topicOf(v).section]
}

export function collectionOf(v: VerseEntry): CollectionInfo {
  return COLLECTION_BY_KEY[sectionOf(v).collection]
}

/** 프롬프트/칩 표기용 경로: [컬렉션, 섹션?, 그룹?] (주제 제외) */
export function crumbOf(v: VerseEntry): string[] {
  const t = topicOf(v)
  const s = sectionOf(v)
  const c = collectionOf(v)
  const parts = [c.short]
  if (s.title !== c.title) parts.push(s.title)
  if (t.group) parts.push(t.group)
  return parts
}

export const sectionsOf = (collectionKey: string): SectionInfo[] =>
  SECTIONS.filter((s) => s.collection === collectionKey)

export const topicsOf = (sectionKey: string): TopicInfo[] =>
  TOPICS.filter((t) => t.section === sectionKey)

export const versesOfTopic = (topicKey: string): VerseEntry[] =>
  VERSES.filter((v) => v.topicKey === topicKey)

/** 장절 동일성 키 (컬렉션 간 중복 구절 탐지) */
export function refKeyOf(v: VerseEntry): string {
  return `${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`
}

/** refKey → 해당 장절을 공유하는 구절 id 목록 (2개 이상만) */
export const DUPLICATES: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const v of VERSES) {
    const k = refKeyOf(v)
    ;(m[k] ??= []).push(v.id)
  }
  for (const k of Object.keys(m)) if (m[k].length < 2) delete m[k]
  return m
})()

/** 책 이름/약칭 → 약칭 (장절 입력 채점용) */
export const BOOK_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const v of VERSES) {
    m[v.book] = v.bookAbbr
    m[v.bookAbbr] = v.bookAbbr
  }
  return m
})()
