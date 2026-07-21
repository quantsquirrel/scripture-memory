import { describe, expect, it } from 'vitest'
import { dueForecast, queueProgress, trueRetention } from '../src/lib/stats'
import type { Direction, ReviewEntry, StoredCard } from '../src/lib/types'

const entry = (cardKey: string, rating: 1 | 2 | 3 | 4, ts: string): ReviewEntry => ({
  cardKey,
  verseId: cardKey.split(':')[0],
  direction: cardKey.split(':')[1] as Direction,
  mode: 'typing',
  rating,
  accuracy: null,
  peeks: null,
  ts,
})

const cardDue = (key: string, due: string): StoredCard => {
  const [verseId, direction] = key.split(':')
  return {
    key,
    verseId,
    direction: direction as Direction,
    card: {
      due,
      stability: 10,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 10,
      reps: 5,
      lapses: 0,
      learning_steps: 0,
      state: 2,
    },
  }
}

describe('trueRetention', () => {
  it('카드당 하루 첫 시도만 집계 — 같은 날 재도전으로 부풀릴 수 없다', () => {
    // 순서를 섞어 전달해도 ts가 빠른 시도가 표본이 된다
    const r = trueRetention([
      entry('AS1a:topic', 3, '2026-07-17T10:30:00+09:00'),
      entry('AS1a:topic', 1, '2026-07-17T10:00:00+09:00'),
    ])
    expect(r).toEqual({ pass: 0, total: 1, rate: 0 })
  })

  it('다른 날의 복습은 별도 표본이고 하루 경계는 로컬(Asia/Seoul) 기준', () => {
    // UTC로는 같은 날(7/16 14:30Z, 15:30Z)이지만 서울 기준 7/16과 7/17
    const r = trueRetention([
      entry('AS1a:topic', 1, '2026-07-16T23:30:00+09:00'),
      entry('AS1a:topic', 3, '2026-07-17T00:30:00+09:00'),
    ])
    expect(r).toEqual({ pass: 1, total: 2, rate: 0.5 })
  })

  it('Hard(2)는 통과, Again(1)만 실패', () => {
    const r = trueRetention([
      entry('AS1a:topic', 2, '2026-07-17T10:00:00+09:00'),
      entry('AS1a:ref', 4, '2026-07-17T10:01:00+09:00'),
      entry('AS1a:text', 1, '2026-07-17T10:02:00+09:00'),
    ])
    expect(r).toEqual({ pass: 2, total: 3, rate: 2 / 3 })
  })

  it('표본이 없으면 rate는 null', () => {
    expect(trueRetention([])).toEqual({ pass: 0, total: 0, rate: null })
  })
})

describe('queueProgress', () => {
  it('처리분은 고유 카드 수로 세고 분모는 처리분+대기분', () => {
    const today = [
      entry('AS1a:topic', 3, '2026-07-17T10:00:00+09:00'),
      entry('AS1a:topic', 3, '2026-07-17T10:05:00+09:00'), // 같은 카드 재복습
      entry('AS1a:ref', 3, '2026-07-17T10:01:00+09:00'),
      entry('AS2a:topic', 1, '2026-07-17T10:02:00+09:00'),
    ]
    expect(queueProgress(today, 2)).toEqual({ done: 3, remaining: 2, rate: 0.6 })
  })

  it('처리도 대기도 없으면 rate는 null, 대기 0이면 100%', () => {
    expect(queueProgress([], 0)).toEqual({ done: 0, remaining: 0, rate: null })
    const done = [entry('AS1a:topic', 3, '2026-07-17T10:00:00+09:00')]
    expect(queueProgress(done, 0)).toEqual({ done: 1, remaining: 0, rate: 1 })
  })
})

describe('dueForecast', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')

  it('내일부터 days일까지 로컬 달력일로 버킷팅한다', () => {
    const cards = [
      cardDue('AS1a:topic', '2026-07-18T09:00:00+09:00'), // 내일
      cardDue('AS1a:ref', '2026-07-18T23:00:00+09:00'), // 내일
      cardDue('AS2a:topic', '2026-07-20T01:00:00+09:00'), // 3일째
    ]
    const f = dueForecast(cards, 7, now)
    expect(f.counts).toEqual([2, 0, 1, 0, 0, 0, 0])
    expect(f.tomorrow).toBe(2)
    expect(f.avgPerDay).toBeCloseTo(3 / 7)
  })

  it('오늘 몫(오늘 남은 due·밀린 카드)과 범위 밖은 제외한다', () => {
    const cards = [
      cardDue('AS1a:topic', '2026-07-17T20:00:00+09:00'), // 오늘 저녁
      cardDue('AS1a:ref', '2026-07-15T09:00:00+09:00'), // 밀림
      cardDue('AS2a:topic', '2026-07-24T23:00:00+09:00'), // 7일째 마지막 — 포함
      cardDue('AS2a:ref', '2026-07-25T00:30:00+09:00'), // 8일째 — 제외
    ]
    const f = dueForecast(cards, 7, now)
    expect(f.counts).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(f.tomorrow).toBe(0)
  })
})
