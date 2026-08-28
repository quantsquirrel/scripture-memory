import { describe, expect, it } from 'vitest'

import { BOOK_BY_ABBR, BOOKS } from '../src/data/canon'
import { localDateKey, PLAN, planFor, portionLabel } from '../src/data/readingPlan'

describe('통독 계획 정본', () => {
  it('365일이고 일차가 1부터 연속이다', () => {
    expect(PLAN).toHaveLength(365)
    PLAN.forEach((d, i) => {
      expect(d.n).toBe(i + 1)
    })
  })

  it('날짜가 2026-08-18부터 하루도 건너뛰지 않는다', () => {
    expect(PLAN[0]?.date).toBe('2026-08-18')
    expect(PLAN[364]?.date).toBe('2027-08-17')
    for (let i = 1; i < PLAN.length; i++) {
      const prev = Date.parse(`${PLAN[i - 1]?.date ?? ''}T00:00:00Z`)
      const cur = Date.parse(`${PLAN[i]?.date ?? ''}T00:00:00Z`)
      expect(cur - prev).toBe(86_400_000)
    }
  })

  it('모든 본문 토큰이 정경 66권 안의 실재하는 장을 가리킨다', () => {
    for (const day of PLAN) {
      expect(day.portions.length).toBeGreaterThan(0)
      for (const p of day.portions) {
        const book = BOOK_BY_ABBR.get(p.book)
        expect(book, `${day.n}일차 알 수 없는 책 ${p.book}`).toBeDefined()
        expect(p.from).toBeGreaterThanOrEqual(1)
        expect(p.to).toBeGreaterThanOrEqual(p.from)
        expect(p.to, `${day.n}일차 ${p.book}${p.to}장`).toBeLessThanOrEqual(book?.chapters ?? 0)
      }
    }
  })

  it('66권 1189장을 빠짐없이 덮는다', () => {
    const covered = new Set<string>()
    for (const day of PLAN)
      for (const p of day.portions)
        for (let c = p.from; c <= p.to; c++) covered.add(`${p.book}${c}`)

    const missing: string[] = []
    let total = 0
    for (const b of BOOKS) {
      total += b.chapters
      for (let c = 1; c <= b.chapters; c++)
        if (!covered.has(`${b.abbr}${c}`)) missing.push(`${b.abbr}${c}`)
    }
    expect(total).toBe(1189)
    expect(missing).toEqual([])
    // 원 계획이 민 32장을 52·53일차에 겹쳐 배치했다 — 원문 그대로 보존한다
    expect(covered.size).toBe(1189)
  })

  it('날짜로 조회하고, 계획 밖 날짜는 null이다', () => {
    expect(planFor('2026-08-28')?.n).toBe(11)
    expect(portionLabel(planFor('2026-08-19')?.portions ?? [])).toBe('창 4-7')
    expect(planFor('2026-08-17')).toBeNull()
    expect(planFor('2027-08-18')).toBeNull()
  })

  it('여러 권이 한 날에 오는 경우를 보존한다', () => {
    // 352일차: 디도서 · 빌레몬서
    const day = PLAN.find((d) => d.n === 352)
    expect(day?.portions.map((p) => p.book)).toEqual(['딛', '몬'])
    expect(portionLabel(day?.portions ?? [])).toBe('딛 1-3 · 몬 1')
  })

  it('localDateKey는 로컬 자정 기준 달력 날짜다', () => {
    expect(localDateKey(new Date('2026-08-28T23:59:00+09:00'))).toBe('2026-08-28')
    expect(localDateKey(new Date('2026-08-29T00:01:00+09:00'))).toBe('2026-08-29')
  })
})
