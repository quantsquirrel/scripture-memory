import { describe, expect, it } from 'vitest'
import {
  computeGoal,
  computeReadiness,
  DEFAULT_REVIEW_BUFFER_DAYS,
  GOAL_VERSE_COUNT,
} from '../src/lib/goal'
import type { Direction, LearnProgress, StoredCard } from '../src/lib/types'

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

  it('학습 전: 정착 기간을 뺀 학습 가능일로 나눈 일일 목표', () => {
    const g = computeGoal('2026-08-20', [], now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT)
    expect(g.daysLeft).toBeGreaterThanOrEqual(34)
    expect(g.learnDaysLeft).toBe(g.daysLeft - DEFAULT_REVIEW_BUFFER_DAYS)
    expect(g.dailyTarget).toBe(Math.ceil(GOAL_VERSE_COUNT / g.learnDaysLeft))
    expect(g.past).toBe(false)
  })

  it('정착 기간은 인자로 조절되고 학습일은 최소 1로 클램프', () => {
    const g0 = computeGoal('2026-08-20', [], now, 0)
    expect(g0.learnDaysLeft).toBe(g0.daysLeft)
    const gLate = computeGoal('2026-08-20', [], new Date('2026-08-18T08:00:00+09:00'))
    expect(gLate.learnDaysLeft).toBe(1)
    expect(gLate.dailyTarget).toBe(gLate.remainingAtDayStart)
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
    expect(g.dailyTarget).toBe(Math.ceil((GOAL_VERSE_COUNT - 1) / g.learnDaysLeft))
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

describe('computeReadiness', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')
  const card = (
    verseId: string,
    direction: Direction,
    stability: number,
    state = 2,
  ): StoredCard => ({
    key: `${verseId}:${direction}`,
    verseId,
    direction,
    card: {
      due: '2026-08-01T00:00:00.000Z',
      stability,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 10,
      reps: 5,
      lapses: 0,
      learning_steps: 0,
      state,
      last_review: '2026-07-17T00:00:00.000Z',
    },
  })
  const strong = (id: string) =>
    (['topic', 'ref', 'text'] as Direction[]).map((d) => card(id, d, 500))

  it('3방향 모두 시험일 기억률 90% 이상이면 준비 완료', () => {
    const r = computeReadiness(strong('AS1a'), '2026-08-20', now)
    expect(r).toEqual({ ready: 1, total: GOAL_VERSE_COUNT })
  })

  it('한 방향이라도 안정도가 낮으면 미준비', () => {
    const cards = [card('AS1a', 'topic', 500), card('AS1a', 'ref', 500), card('AS1a', 'text', 1)]
    expect(computeReadiness(cards, '2026-08-20', now).ready).toBe(0)
  })

  it('방향 누락·New 카드는 미준비, 180구절 카드는 집계 제외', () => {
    const missing = [card('AS2a', 'topic', 500), card('AS2a', 'ref', 500)]
    expect(computeReadiness(missing, '2026-08-20', now).ready).toBe(0)
    const fresh = (['topic', 'ref', 'text'] as Direction[]).map((d) => card('AS3a', d, 500, 0))
    expect(computeReadiness(fresh, '2026-08-20', now).ready).toBe(0)
    const tms180 = strong('T1-1a')
    expect(computeReadiness(tms180, '2026-08-20', now)).toEqual({
      ready: 0,
      total: GOAL_VERSE_COUNT,
    })
  })
})
