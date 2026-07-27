import { describe, expect, it } from 'vitest'
import {
  directionRetention,
  dueForecast,
  knowledgeNow,
  maturity,
  objectiveAccuracy,
  queueProgress,
  reviewHistory,
  selfGradeCalibration,
  trueRetention,
  weakVerses,
} from '../src/lib/stats'
import type { Direction, ReviewEntry, SerializedCard, StoredCard } from '../src/lib/types'

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

/** 카드 필드를 골라 덮어쓰는 헬퍼 — 성숙도/기억률/취약 구절 테스트용 */
const cardWith = (key: string, over: Partial<SerializedCard>): StoredCard => {
  const [verseId, direction] = key.split(':')
  return {
    key,
    verseId,
    direction: direction as Direction,
    card: {
      due: '2026-07-20T09:00:00+09:00',
      stability: 10,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 10,
      reps: 5,
      lapses: 0,
      learning_steps: 0,
      state: 2,
      ...over,
    },
  }
}

describe('knowledgeNow', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')

  it('방금 복습한 카드는 기억률 ≈ 1, New 카드는 표본에서 제외', () => {
    const fresh = cardWith('AS1a:topic', { last_review: now.toISOString() })
    const brandNew = cardWith('AS2a:topic', { state: 0 })
    const k = knowledgeNow([fresh, brandNew], now)
    expect(k.graded).toBe(1)
    expect(k.avgRetrievability).not.toBeNull()
    expect(k.avgRetrievability!).toBeGreaterThan(0.99)
    expect(k.estKnown).toBe(1)
  })

  it('오래 방치된 약한 카드는 평균을 끌어내린다', () => {
    const old = new Date(now.getTime() - 100 * 86400_000).toISOString()
    const fresh = cardWith('AS1a:topic', { last_review: now.toISOString() })
    const decayed = cardWith('AS1a:ref', { stability: 1, last_review: old })
    const k = knowledgeNow([fresh, decayed], now)
    expect(k.graded).toBe(2)
    expect(k.avgRetrievability!).toBeLessThan(0.99)
    expect(k.avgRetrievability!).toBeGreaterThan(0)
  })

  it('궤도에 오른 카드가 없으면 평균은 null', () => {
    expect(knowledgeNow([], now)).toEqual({ graded: 0, avgRetrievability: null, estKnown: 0 })
  })
})

describe('maturity', () => {
  it('복습 카드만 간격 21일 기준으로 어린/성숙을 가르고 나머지는 학습 중', () => {
    const m = maturity([
      cardWith('AS1a:topic', { state: 1 }), // Learning
      cardWith('AS1a:ref', { state: 3 }), // Relearning
      cardWith('AS1a:text', { state: 2, scheduled_days: 20 }),
      cardWith('AS2a:topic', { state: 2, scheduled_days: 21 }),
    ])
    expect(m).toEqual({ learning: 2, young: 1, mature: 1, total: 4 })
  })
})

describe('directionRetention', () => {
  it('방향별로 나눠 각각 true retention을 계산한다', () => {
    const r = directionRetention([
      entry('AS1a:topic', 3, '2026-07-17T10:00:00+09:00'),
      entry('AS1a:ref', 1, '2026-07-17T10:01:00+09:00'),
      entry('AS2a:ref', 3, '2026-07-17T10:02:00+09:00'),
    ])
    expect(r.topic).toEqual({ pass: 1, total: 1, rate: 1 })
    expect(r.ref).toEqual({ pass: 1, total: 2, rate: 0.5 })
    expect(r.text).toEqual({ pass: 0, total: 0, rate: null })
  })
})

describe('selfGradeCalibration', () => {
  const recite = (key: string, rating: 1 | 2 | 3 | 4, ts: string): ReviewEntry => ({
    ...entry(key, rating, ts),
    mode: 'recite',
  })

  it('자가 채점이 후하면 간극이 양수로 드러난다', () => {
    const c = selfGradeCalibration([
      recite('AS1a:topic', 3, '2026-07-17T10:00:00+09:00'),
      recite('AS2a:topic', 4, '2026-07-17T10:01:00+09:00'),
      entry('AS1a:ref', 1, '2026-07-17T10:02:00+09:00'), // typing 실패
      entry('AS2a:ref', 3, '2026-07-17T10:03:00+09:00'),
    ])
    expect(c.recite).toEqual({ pass: 2, total: 2, rate: 1 })
    expect(c.objective).toEqual({ pass: 1, total: 2, rate: 0.5 })
    expect(c.gapPp).toBe(50)
  })

  it('어느 한쪽 표본이 없으면 간극은 null', () => {
    const c = selfGradeCalibration([entry('AS1a:ref', 3, '2026-07-17T10:00:00+09:00')])
    expect(c.recite.rate).toBeNull()
    expect(c.gapPp).toBeNull()
  })
})

describe('objectiveAccuracy', () => {
  it('accuracy 증거가 있는 시도만 평균한다', () => {
    const withAcc = (key: string, accuracy: number | null): ReviewEntry => ({
      ...entry(key, 3, '2026-07-17T10:00:00+09:00'),
      accuracy,
    })
    const a = objectiveAccuracy([
      withAcc('AS1a:topic', 0.9),
      withAcc('AS1a:ref', 1),
      withAcc('AS1a:text', null), // recite 등 증거 없는 시도
    ])
    expect(a.n).toBe(2)
    expect(a.avg).toBeCloseTo(0.95)
  })

  it('표본 없으면 null', () => {
    expect(objectiveAccuracy([])).toEqual({ avg: null, n: 0 })
  })
})

describe('reviewHistory', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')

  it('연속 복습일과 일별 복습량을 로컬 달력일 기준으로 센다', () => {
    const h = reviewHistory(
      [
        entry('AS1a:topic', 3, '2026-07-17T00:30:00+09:00'), // UTC로는 7/16이지만 서울 7/17
        entry('AS1a:ref', 3, '2026-07-17T10:00:00+09:00'),
        entry('AS1a:topic', 1, '2026-07-16T22:00:00+09:00'),
        entry('AS1a:topic', 3, '2026-07-14T09:00:00+09:00'), // 7/15 공백 → streak 단절
      ],
      7,
      now,
    )
    // counts: 7/11 ~ 7/17
    expect(h.counts).toEqual([0, 0, 0, 1, 0, 1, 2])
    expect(h.streak).toBe(2)
    expect(h.avgPerDay).toBeCloseTo(4 / 7)
  })

  it('오늘 아직 복습 전이면 어제까지의 연속을 유지한다', () => {
    const h = reviewHistory(
      [
        entry('AS1a:topic', 3, '2026-07-16T22:00:00+09:00'),
        entry('AS1a:topic', 3, '2026-07-15T09:00:00+09:00'),
      ],
      7,
      now,
    )
    expect(h.streak).toBe(2)
  })

  it('어제도 오늘도 없으면 streak 0, counts 창은 요청한 일수만큼', () => {
    const h = reviewHistory([entry('AS1a:topic', 3, '2026-07-10T09:00:00+09:00')], 3, now)
    expect(h.streak).toBe(0)
    expect(h.counts).toEqual([0, 0, 0])
  })
})

describe('weakVerses', () => {
  it('구절별 lapses 합으로 정렬하고 가장 약한 방향을 알려준다', () => {
    const w = weakVerses(
      [
        cardWith('AS1a:topic', { lapses: 1 }),
        cardWith('AS1a:ref', { lapses: 4 }),
        cardWith('AS1a:text', { lapses: 0 }),
        cardWith('AS2a:topic', { lapses: 2 }),
        cardWith('AS3a:topic', { lapses: 0 }), // lapse 없음 → 제외
      ],
      5,
    )
    expect(w).toEqual([
      { verseId: 'AS1a', lapses: 5, worstDirection: 'ref' },
      { verseId: 'AS2a', lapses: 2, worstDirection: 'topic' },
    ])
  })

  it('limit 개수만 돌려준다', () => {
    const w = weakVerses(
      [cardWith('AS1a:topic', { lapses: 3 }), cardWith('AS2a:topic', { lapses: 1 })],
      1,
    )
    expect(w).toHaveLength(1)
    expect(w[0].verseId).toBe('AS1a')
  })
})
