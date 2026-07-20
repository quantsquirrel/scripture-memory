import { describe, expect, it } from 'vitest'
import { computeGoal, GOAL_VERSE_COUNT } from '../src/lib/goal'
import type { LearnProgress } from '../src/lib/types'

const lp = (verseId: string, step: number, updatedAt: string): LearnProgress => ({
  verseId,
  step,
  updatedAt,
})

describe('computeGoal', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')

  it('목표 범위는 DEP242 완결까지 315구절 (180구절 제외)', () => {
    expect(GOAL_VERSE_COUNT).toBe(315)
  })

  it('학습 전: 315구절을 남은 날로 나눈 일일 목표', () => {
    const g = computeGoal('2026-08-20', [], now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT)
    expect(g.daysLeft).toBeGreaterThanOrEqual(34)
    expect(g.dailyTarget).toBe(Math.ceil(GOAL_VERSE_COUNT / g.daysLeft))
    expect(g.past).toBe(false)
  })

  it('180구절 졸업은 목표 페이싱에 잡히지 않는다', () => {
    const g = computeGoal('2026-08-20', [lp('T1-1a', 3, '2026-07-17T10:00:00+09:00')], now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT)
    expect(g.todayNew).toBe(0)
  })

  it('오늘 졸업분은 오늘 목표 분모에 포함된다', () => {
    const learning = [
      lp('AS1a', 3, '2026-07-17T10:00:00+09:00'), // 오늘 졸업
      lp('AS2a', 3, '2026-07-10T10:00:00+09:00'), // 이전 졸업
      lp('AS3a', 1, '2026-07-17T11:00:00+09:00'), // 학습 중 (미졸업)
    ]
    const g = computeGoal('2026-08-20', learning, now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT - 2)
    expect(g.todayNew).toBe(1)
    expect(g.remainingAtDayStart).toBe(GOAL_VERSE_COUNT - 1)
    expect(g.dailyTarget).toBe(Math.ceil((GOAL_VERSE_COUNT - 1) / g.daysLeft))
  })

  it('목표일 당일도 1일로 계산한다', () => {
    const g = computeGoal('2026-08-20', [], new Date('2026-08-20T08:00:00+09:00'))
    expect(g.daysLeft).toBe(1)
    expect(g.past).toBe(false)
  })

  it('목표일 경과 시 past=true, 목표 0', () => {
    const g = computeGoal('2026-08-20', [], new Date('2026-08-21T08:00:00+09:00'))
    expect(g.past).toBe(true)
    expect(g.dailyTarget).toBe(0)
  })
})
