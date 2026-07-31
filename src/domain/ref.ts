import { BOOK_ALIASES, type VerseEntry } from '../data/verses'

export interface ParsedRef {
  bookAbbr: string
  chapter: number
  verses: number[]
}

const REF_RE = /^([가-힣]+)\s*(\d+)\s*[:장]\s*(.+?)\s*$/
const RANGE_RE = /^(\d+)\s*[-~]\s*(\d+)$/

/** "빌립보서 4:6-7", "빌4:6,7", "빌립보서 4장 6절" 등을 정규화 */
export function parseRef(input: string): ParsedRef | null {
  const m = REF_RE.exec(input.normalize('NFC').trim())
  if (!m) return null
  const [, bookRaw, chapterRaw, versesRaw] = m
  // 세 그룹 모두 패턴상 필수지만 타입은 optional — 못 읽으면 파싱 실패로 처리한다
  if (bookRaw === undefined || chapterRaw === undefined || versesRaw === undefined) return null
  const bookAbbr = BOOK_ALIASES[bookRaw]
  if (!bookAbbr) return null
  const chapter = parseInt(chapterRaw, 10)
  const verses: number[] = []
  for (const part of versesRaw.replace(/절/g, '').split(/[,、]/)) {
    const p = part.trim()
    if (!p) continue
    const range = RANGE_RE.exec(p)
    if (range) {
      const [, aRaw, bRaw] = range
      if (aRaw === undefined || bRaw === undefined) return null
      const a = parseInt(aRaw, 10)
      const b = parseInt(bRaw, 10)
      if (b < a || b - a > 20) return null
      for (let v = a; v <= b; v++) verses.push(v)
    } else if (/^\d+$/.test(p)) {
      verses.push(parseInt(p, 10))
    } else {
      return null
    }
  }
  if (verses.length === 0) return null
  return { bookAbbr, chapter, verses }
}

export function gradeRef(verse: VerseEntry, input: string): boolean {
  const p = parseRef(input)
  if (!p) return false
  return (
    p.bookAbbr === verse.bookAbbr &&
    p.chapter === verse.chapter &&
    p.verses.length === verse.verses.length &&
    p.verses.every((v, i) => v === verse.verses[i])
  )
}
