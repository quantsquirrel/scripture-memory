import { describe, expect, it } from 'vitest'

import { decodeLog, encodeLog, sourceChapters } from '../src/app/meditation'
import { BOOK_BY_ABBR } from '../src/data/canon'
import { PLAN, planFor } from '../src/data/readingPlan'
import { VERSE_BY_ID, VERSES } from '../src/data/verses'
import type { CandidateTable } from '../src/data/xrefCandidates'
import rawTable from '../src/data/xrefCandidates.json'
import {
  chapterKey,
  pickMeditation,
  type ShownEntry,
  type SourceChapter,
} from '../src/domain/meditation'
import { advanceQt, formatQt, parseQt } from '../src/domain/qt'

const TABLE = rawTable as unknown as Record<string, { v: string; s: number; c: string[][] }[]>
const T = rawTable as unknown as CandidateTable

const chaptersOf = (dateKey: string): SourceChapter[] => sourceChapters(planFor(dateKey), null)

describe('상호참조 후보표 (빌드 산출물)', () => {
  it('1189개 장을 모두 담는다', () => {
    let expected = 0
    for (const [, book] of BOOK_BY_ABBR) expected += book.chapters
    expect(Object.keys(TABLE)).toHaveLength(expected)
    expect(expected).toBe(1189)
  })

  it('모든 후보가 실재하는 암송구절을 가리킨다', () => {
    for (const [key, list] of Object.entries(TABLE))
      for (const cand of list) expect(VERSE_BY_ID[cand.v], `${key} → ${cand.v}`).toBeDefined()
  })

  it('사슬은 2~3노드이고, 마지막 노드가 그 암송구절의 장절과 겹친다', () => {
    const overlaps = (label: string, verseId: string): boolean => {
      const v = VERSE_BY_ID[verseId]
      const m = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(label)
      if (!v || !m?.[1] || !m[2] || !m[3]) return false
      if (m[1] !== v.bookAbbr || parseInt(m[2], 10) !== v.chapter) return false
      const from = parseInt(m[3], 10)
      const to = m[4] === undefined ? from : parseInt(m[4], 10)
      return v.verses.some((n) => n >= from && n <= to)
    }
    for (const [key, list] of Object.entries(TABLE))
      for (const cand of list)
        for (const chain of cand.c) {
          expect(chain.length, `${key} ${cand.v}`).toBeGreaterThanOrEqual(2)
          expect(chain.length, `${key} ${cand.v}`).toBeLessThanOrEqual(3)
          const last = chain[chain.length - 1] ?? ''
          expect(overlaps(last, cand.v), `${key} ${cand.v}: ${chain.join(' → ')}`).toBe(true)
        }
  })

  it('사슬의 중간 지점은 출발·도착과 다른 장이다 — 같은 장을 거치면 헛걸음이다', () => {
    const chapterOfLabel = (label: string): string => {
      const m = /^(\S+)\s+(\d+):/.exec(label)
      return m ? `${m[1]}${m[2]}` : label
    }
    for (const [key, list] of Object.entries(TABLE))
      for (const cand of list)
        for (const chain of cand.c) {
          if (chain.length < 3) continue
          const mid = chapterOfLabel(chain[1] ?? '')
          expect(mid, `${key} ${cand.v}: ${chain.join(' → ')}`).not.toBe(key)
          expect(mid, `${key} ${cand.v}: ${chain.join(' → ')}`).not.toBe(
            chapterOfLabel(chain[2] ?? ''),
          )
        }
  })

  it('사슬의 출발 노드는 그 장 안의 절이다 — 오늘 읽은 자리여야 설명이 성립한다', () => {
    for (const [key, list] of Object.entries(TABLE)) {
      const m = /^(\D+)(\d+)$/.exec(key)
      if (!m?.[1] || !m[2]) throw new Error(`후보표 키 형식 오류: ${key}`)
      const prefix = `${m[1]} ${m[2]}:`
      for (const cand of list)
        for (const chain of cand.c)
          expect(chain[0]?.startsWith(prefix), `${key} ${cand.v}: ${chain[0] ?? ''}`).toBe(true)
    }
  })
})

describe('오늘의 묵상 고르기', () => {
  it('같은 날짜·같은 본문이면 늘 같은 구절이다 (기기가 달라도)', () => {
    const chapters = chaptersOf('2026-08-28')
    const a = pickMeditation(T, chapters, [], '2026-08-28')
    const b = pickMeditation(T, [...chapters].reverse(), [], '2026-08-28')
    expect(a.pick?.verseId).toBe(b.pick?.verseId)
    expect(a.pick?.verseId).not.toBeUndefined()
  })

  it('기록을 이어가면 날마다 다른 구절이 온다', () => {
    // 기록 없이 각 날을 따로 계산하면 이웃한 날이 같은 구절을 낼 수 있다.
    // 연속으로 이어 볼 때 달라지는 것이 실제 사용 조건이다.
    const shown: ShownEntry[] = []
    const picks: (string | undefined)[] = []
    for (const d of ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']) {
      const pick = pickMeditation(T, chaptersOf(d), shown, d).pick
      picks.push(pick?.verseId)
      shown.push({ date: d, verseId: pick?.verseId ?? '' })
    }
    expect(new Set(picks).size).toBe(4)
  })

  it('고르기는 날짜가 아니라 본문에 달려 있다 — 날짜 해시는 동점일 때만 흔든다', () => {
    const chapters = chaptersOf('2026-08-28')
    const a = pickMeditation(T, chapters, [], '2026-08-28').pick?.verseId
    const b = pickMeditation(T, chapters, [], '2027-03-14').pick?.verseId
    expect(a).toBe(b)
  })

  it('오늘 읽은 장 안에 있는 구절은 고르지 않는다 — "다른 말씀"이 아니다', () => {
    for (const day of PLAN.slice(0, 60)) {
      const chapters = sourceChapters(day, null)
      const keys = new Set(chapters.map((c) => c.key))
      const { pick, alternates } = pickMeditation(T, chapters, [], day.date)
      for (const p of [pick, ...alternates]) {
        if (!p) continue
        const v = VERSE_BY_ID[p.verseId]
        if (!v) continue
        expect(keys.has(chapterKey(v.bookAbbr, v.chapter)), `${day.date} ${v.refAbbr}`).toBe(
          false,
        )
      }
    }
  })

  it('최근 60일 안에 보여준 구절은 뒤로 밀린다', () => {
    const chapters = chaptersOf('2026-08-28')
    const first = pickMeditation(T, chapters, [], '2026-08-28').pick
    expect(first).not.toBeNull()
    const shown: ShownEntry[] = [{ date: '2026-08-20', verseId: first?.verseId ?? '' }]
    const second = pickMeditation(T, chapters, shown, '2026-08-28').pick
    expect(second?.verseId).not.toBe(first?.verseId)
  })

  it('60일이 지난 구절은 다시 고를 수 있다', () => {
    const chapters = chaptersOf('2026-08-28')
    const first = pickMeditation(T, chapters, [], '2026-08-28').pick
    const long: ShownEntry[] = [{ date: '2026-05-01', verseId: first?.verseId ?? '' }]
    expect(pickMeditation(T, chapters, long, '2026-08-28').pick?.verseId).toBe(first?.verseId)
  })

  it('모든 후보가 최근에 나왔어도 빈 화면을 내놓지 않는다', () => {
    const chapters = chaptersOf('2026-08-28')
    const all = pickMeditation(T, chapters, [], '2026-08-28')
    const everything: ShownEntry[] = [all.pick, ...all.alternates]
      .flatMap((p) => (p ? [p.verseId] : []))
      .map((verseId) => ({ date: '2026-08-27', verseId }))
    // 대안까지 전부 막아도 무언가는 나와야 한다
    const again = pickMeditation(T, chapters, everything, '2026-08-28')
    expect(again.pick).not.toBeNull()
  })

  it('QT 본문이 결과에 실제로 영향을 준다', () => {
    const plan = planFor('2026-08-28')
    const withoutQt = pickMeditation(T, sourceChapters(plan, null), [], '2026-08-28')
    const withQt = pickMeditation(
      T,
      sourceChapters(plan, { book: '고전', chapter: 15 }),
      [],
      '2026-08-28',
    )
    const before = new Set([withoutQt.pick, ...withoutQt.alternates].map((p) => p?.verseId))
    const after = [withQt.pick, ...withQt.alternates].map((p) => p?.verseId)
    expect(after.some((v) => !before.has(v))).toBe(true)
  })

  it('같은 주제가 최근에 나왔으면 눌러 둔다 — 열흘 내내 같은 주제를 반복하지 않게', () => {
    const chapters = chaptersOf('2026-08-28')
    const top = pickMeditation(T, chapters, [], '2026-08-28')
    const first = top.pick
    const sameTopic = VERSES.filter(
      (v) =>
        v.topicKey === VERSE_BY_ID[first?.verseId ?? '']?.topicKey && v.id !== first?.verseId,
    )
    // 같은 주제의 다른 구절을 사흘 전에 보여줬다고 하면 오늘 점수가 절반이 된다
    const shown: ShownEntry[] =
      sameTopic[0] === undefined ? [] : [{ date: '2026-08-25', verseId: sameTopic[0].id }]
    const after = pickMeditation(T, chapters, shown, '2026-08-28')
    if (shown.length > 0) expect(after.pick?.score).toBeLessThan(first?.score ?? 0)
  })

  it('기록에 없는 구절 id가 섞여 있어도 견딘다 (다른 버전 백업에서 온 값)', () => {
    const chapters = chaptersOf('2026-08-28')
    const clean = pickMeditation(T, chapters, [], '2026-08-28').pick?.verseId
    const dirty = pickMeditation(
      T,
      chapters,
      [{ date: '2026-08-27', verseId: '없는구절id' }],
      '2026-08-28',
    ).pick?.verseId
    expect(dirty).toBe(clean)
  })

  it('QT 본문만 있어도 (통독 계획 기간 밖) 한 구절을 고른다', () => {
    const only = sourceChapters(null, { book: '고전', chapter: 15 })
    expect(only).toHaveLength(1)
    const { pick } = pickMeditation(T, only, [], '2027-09-01')
    expect(pick).not.toBeNull()
    expect(pick?.from.origin).toBe('qt')
  })

  it('본문이 하나도 없으면 고를 것이 없다', () => {
    expect(pickMeditation(T, [], [], '2026-08-28').pick).toBeNull()
  })

  it('365일 내내 고르기에 실패하는 날이 없고, 같은 구절이 두 달 안에 되돌아오지 않는다', () => {
    const shown: ShownEntry[] = []
    const seenAt = new Map<string, number>()
    PLAN.forEach((day, i) => {
      const { pick } = pickMeditation(T, sourceChapters(day, null), shown, day.date)
      expect(pick, `${day.date} 선택 실패`).not.toBeNull()
      const id = pick?.verseId ?? ''
      const prev = seenAt.get(id)
      if (prev !== undefined) expect(i - prev, `${id} 재등장 간격`).toBeGreaterThanOrEqual(60)
      seenAt.set(id, i)
      shown.push({ date: day.date, verseId: id })
    })
    // 한 해 동안 충분히 다양한 말씀을 만난다
    expect(seenAt.size).toBeGreaterThan(150)
  })
})

describe('QT 본문 위치', () => {
  it('저장 형식을 왕복한다', () => {
    expect(parseQt('고전 15')).toEqual({ book: '고전', chapter: 15 })
    expect(formatQt({ book: '고전', chapter: 15 })).toBe('고전 15')
  })

  it('없는 책·범위를 벗어난 장은 받지 않는다', () => {
    expect(parseQt('없는책 3')).toBeNull()
    expect(parseQt('고전 17')).toBeNull() // 고린도전서는 16장까지
    expect(parseQt('고전 0')).toBeNull()
    expect(parseQt('고전')).toBeNull()
    expect(parseQt('')).toBeNull()
  })

  it('지난 날짜만큼 한 장씩 밀되 책 끝을 넘지 않는다', () => {
    expect(advanceQt({ book: '고전', chapter: 14 }, '2026-08-27', '2026-08-28')).toEqual({
      position: { book: '고전', chapter: 15 },
      estimated: true,
    })
    expect(
      advanceQt({ book: '고전', chapter: 15 }, '2026-08-28', '2026-09-30').position,
    ).toEqual({
      book: '고전',
      chapter: 16,
    })
  })

  it('저장값의 책 약칭이 깨졌으면 밀지 않고 그대로 둔다', () => {
    expect(advanceQt({ book: '없는책', chapter: 3 }, '2026-08-01', '2026-08-28')).toEqual({
      position: { book: '없는책', chapter: 3 },
      estimated: false,
    })
  })

  it('같은 날이나 미래 날짜면 밀지 않는다', () => {
    expect(advanceQt({ book: '고전', chapter: 15 }, '2026-08-28', '2026-08-28')).toEqual({
      position: { book: '고전', chapter: 15 },
      estimated: false,
    })
    expect(advanceQt({ book: '고전', chapter: 15 }, '2026-09-01', '2026-08-28').estimated).toBe(
      false,
    )
  })
})

describe('묵상 기록', () => {
  it('왕복한다', () => {
    const entries: ShownEntry[] = [
      { date: '2026-08-27', verseId: 'AS1a' },
      { date: '2026-08-28', verseId: 'C6b' },
    ]
    expect(decodeLog(encodeLog(entries))).toEqual([
      { date: '2026-08-28', verseId: 'C6b' },
      { date: '2026-08-27', verseId: 'AS1a' },
    ])
  })

  it('120건까지만 남긴다 — 두 달 억제에 필요한 것보다 넉넉하다', () => {
    const many: ShownEntry[] = Array.from({ length: 400 }, (_, i) => ({
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
      verseId: `v${i}`,
    }))
    expect(decodeLog(encodeLog(many))).toHaveLength(120)
  })

  it('손상된 값은 기록 없음으로 본다 — 파생 상태라 잃어도 해가 없다', () => {
    expect(decodeLog(undefined)).toEqual([])
    expect(decodeLog('{')).toEqual([])
    expect(decodeLog('{"a":1}')).toEqual([])
    expect(decodeLog('[1, null, "쓰레기", "2026-13-99|x", "2026-08-28|"]')).toEqual([])
    expect(decodeLog('["2026-02-30|x"]')).toEqual([]) // 형식은 맞지만 없는 날짜
    expect(decodeLog('["2026-08-28|C6b"]')).toEqual([{ date: '2026-08-28', verseId: 'C6b' }])
  })
})

describe('코퍼스와 후보표의 정합', () => {
  it('암송 495구절의 고유 장절이 모두 어딘가의 후보로 등장한다', () => {
    const appearing = new Set(Object.values(TABLE).flatMap((l) => l.map((e) => e.v)))
    const canonical = new Set<string>()
    for (const v of VERSES) {
      const key = `${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`
      if (!canonical.has(key)) canonical.add(key)
    }
    // 후보표는 같은 장절 중 학습 순서상 첫 구절만 담는다
    expect(appearing.size).toBe(canonical.size)
  })
})
