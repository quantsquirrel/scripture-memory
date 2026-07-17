import { BOOK_ALIASES, type VerseEntry } from '../data/verses'

export interface ParsedRef {
  bookAbbr: string
  chapter: number
  verses: number[]
}

/** "빌립보서 4:6-7", "빌4:6,7", "빌립보서 4장 6절" 등을 정규화 */
export function parseRef(input: string): ParsedRef | null {
  const m = input
    .normalize('NFC')
    .trim()
    .match(/^([가-힣]+)\s*(\d+)\s*[:장]\s*(.+?)\s*$/)
  if (!m) return null
  const bookAbbr = BOOK_ALIASES[m[1]]
  if (!bookAbbr) return null
  const chapter = parseInt(m[2], 10)
  const verses: number[] = []
  for (const part of m[3].replace(/절/g, '').split(/[,、]/)) {
    const p = part.trim()
    if (!p) continue
    const range = p.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const a = parseInt(range[1], 10)
      const b = parseInt(range[2], 10)
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
