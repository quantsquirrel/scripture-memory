import { afterEach, describe, expect, it } from 'vitest'
import {
  applyRating,
  DEFAULT_RETENTION,
  getRequestRetention,
  newCard,
  reviveCard,
  serializeCard,
  setRequestRetention,
} from '../src/lib/fsrs'
import { required } from '../src/lib/invariant'

describe('fsrs 래퍼', () => {
  it('직렬화 라운드트립이 유지된다', () => {
    const s = newCard(new Date('2026-07-17T00:00:00Z'))
    const revived = reviveCard(s)
    expect(serializeCard(revived)).toEqual(s)
    expect(typeof s.due).toBe('string')
  })

  it('Good 평가 시 due가 미래로, reps가 증가한다', () => {
    const t0 = new Date('2026-07-17T00:00:00Z')
    const s0 = newCard(t0)
    const s1 = applyRating(s0, 3, t0)
    expect(s1.reps).toBe(1)
    expect(new Date(s1.due).getTime()).toBeGreaterThan(t0.getTime())
  })

  it('연속 Good이면 간격이 늘어난다', () => {
    const t0 = new Date('2026-07-17T00:00:00Z')
    let s = newCard(t0)
    let prev = t0
    const intervals: number[] = []
    for (let i = 0; i < 4; i++) {
      const reviewAt = new Date(new Date(s.due).getTime() + 1000)
      s = applyRating(s, 3, reviewAt)
      intervals.push(new Date(s.due).getTime() - reviewAt.getTime())
      prev = reviewAt
    }
    expect(new Date(s.due).getTime()).toBeGreaterThan(prev.getTime())
    expect(required(intervals[3])).toBeGreaterThan(required(intervals[0]))
  })

  it('Again은 lapse를 기록한다 (Review 상태 이후)', () => {
    const t0 = new Date('2026-07-17T00:00:00Z')
    let s = newCard(t0)
    for (let i = 0; i < 3; i++) {
      s = applyRating(s, 3, new Date(new Date(s.due).getTime() + 1000))
    }
    const lapsesBefore = s.lapses
    s = applyRating(s, 1, new Date(new Date(s.due).getTime() + 1000))
    expect(s.lapses).toBe(lapsesBefore + 1)
  })
})

describe('시험 모드 목표 기억률', () => {
  afterEach(() => setRequestRetention(DEFAULT_RETENTION))

  /** Review 상태의 성숙 카드 하나와 다음 복습 시점을 만든다 */
  const matureCard = () => {
    let s = newCard(new Date('2026-07-17T00:00:00Z'))
    for (let i = 0; i < 3; i++) {
      s = applyRating(s, 3, new Date(new Date(s.due).getTime() + 1000))
    }
    return { s, reviewAt: new Date(new Date(s.due).getTime() + 1000) }
  }

  it('기본 목표 기억률은 0.9', () => {
    expect(getRequestRetention()).toBe(DEFAULT_RETENTION)
  })

  it('0.95로 올리면 같은 카드의 다음 간격이 짧아지고, 되돌리면 복원된다', () => {
    const { s, reviewAt } = matureCard()
    const base = new Date(applyRating(s, 3, reviewAt).due).getTime()
    setRequestRetention(0.95)
    const exam = new Date(applyRating(s, 3, reviewAt).due).getTime()
    expect(exam).toBeLessThan(base)
    setRequestRetention(DEFAULT_RETENTION)
    const restored = new Date(applyRating(s, 3, reviewAt).due).getTime()
    expect(restored).toBeGreaterThan(exam)
  })

  it('목표 기억률 변경은 기억 모델(stability/difficulty)을 바꾸지 않는다', () => {
    const { s, reviewAt } = matureCard()
    const base = applyRating(s, 3, reviewAt)
    setRequestRetention(0.95)
    const exam = applyRating(s, 3, reviewAt)
    expect(exam.stability).toBeCloseTo(base.stability, 10)
    expect(exam.difficulty).toBeCloseTo(base.difficulty, 10)
  })
})
