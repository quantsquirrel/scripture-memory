import { describe, expect, it } from 'vitest'
import { applyRating, newCard, reviveCard, serializeCard } from '../src/lib/fsrs'

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
    expect(intervals[3]).toBeGreaterThan(intervals[0])
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
