/**
 * 365일치 묵상 구절을 미리 뽑아 눈으로 확인하는 도구.
 *
 * 알고리즘 파라미터를 건드릴 때마다 이걸 돌려 "매일 다른, 그러나 억지스럽지
 * 않은 말씀이 나오는가"를 사람이 직접 본다. 자동 테스트는 분포와 결정성만
 * 지킬 수 있고, 어울림은 결국 읽어봐야 안다.
 *
 * 사용: npx vite-node scripts/preview_meditation.ts [시작일차] [개수]
 */
import { PLAN } from '../src/data/readingPlan'
import { topicOf, VERSE_BY_ID } from '../src/data/verses'
import type { CandidateTable } from '../src/data/xrefCandidates'
import rawTable from '../src/data/xrefCandidates.json'
import {
  chapterKey,
  pickMeditation,
  type ShownEntry,
  type SourceChapter,
} from '../src/domain/meditation'

const TABLE = rawTable as unknown as CandidateTable

const from = Number(process.argv[2] ?? 1)
const count = Number(process.argv[3] ?? 30)

const shown: ShownEntry[] = []
const picks: {
  day: number
  date: string
  portion: string
  verseId: string
  chains: readonly (readonly string[])[]
}[] = []
let misses = 0

for (const day of PLAN) {
  const chapters: SourceChapter[] = []
  for (const p of day.portions)
    for (let c = p.from; c <= p.to; c++)
      chapters.push({ key: chapterKey(p.book, c), label: `${p.book} ${c}`, origin: 'reading' })
  const { pick } = pickMeditation(TABLE, chapters, shown, day.date)
  if (!pick) {
    misses++
    continue
  }
  shown.push({ date: day.date, verseId: pick.verseId })
  picks.push({
    day: day.n,
    date: day.date,
    portion: day.portions
      .map((p) => (p.from === p.to ? `${p.book}${p.from}` : `${p.book}${p.from}-${p.to}`))
      .join(' '),
    verseId: pick.verseId,
    chains: pick.chains,
  })
}

for (const p of picks.slice(from - 1, from - 1 + count)) {
  const v = VERSE_BY_ID[p.verseId]
  if (!v) continue
  console.log(
    `${String(p.day).padStart(3)} ${p.date}  ${p.portion.padEnd(11)} │ ${v.refAbbr.padEnd(12)} ${topicOf(v).title.slice(0, 16).padEnd(18)} │ ${p.chains.map((c) => c.join(' → ')).join('  ·  ')}`,
  )
}

const counts = new Map<string, number>()
for (const p of picks) counts.set(p.verseId, (counts.get(p.verseId) ?? 0) + 1)
const repeats = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
let minGap = Infinity
const lastAt = new Map<string, number>()
picks.forEach((p, i) => {
  const prev = lastAt.get(p.verseId)
  if (prev !== undefined) minGap = Math.min(minGap, i - prev)
  lastAt.set(p.verseId, i)
})

console.log(`\n── 365일 통계 ──`)
console.log(`선택 실패: ${misses}일`)
console.log(`고유 구절: ${counts.size}개`)
console.log(
  `2회 이상: ${repeats.length}구절 (최다 ${repeats[0]?.[1] ?? 0}회) ` +
    repeats
      .slice(0, 6)
      .map(([k, n]) => `${VERSE_BY_ID[k]?.refAbbr ?? k}×${n}`)
      .join(' '),
)
console.log(`최소 재등장 간격: ${minGap === Infinity ? '재등장 없음' : `${minGap}일`}`)
const hops = new Map<number, number>()
for (const p of picks)
  for (const c of p.chains) hops.set(c.length, (hops.get(c.length) ?? 0) + 1)
console.log(
  `사슬 길이 분포: ${[...hops]
    .sort()
    .map(([k, n]) => `${k}노드 ${n}일`)
    .join(' · ')}`,
)
