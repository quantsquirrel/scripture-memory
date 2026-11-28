import { describe, expect, it } from 'vitest'

import type { Rating, SerializedCard } from '../src/domain/card'
import {
  forecastReviews,
  formatInterval,
  intervalPreview,
  newCard,
  rateCard,
  State,
} from '../src/domain/scheduler'

/**
 * 학습·재학습 카드가 '좋음'과 '쉬움' 둘 다로 복습 상태에 졸업할 때 '쉬움'은 '좋음'보다 최소 1일
 * 길다(Anki의 FSRS 학습 카드 쉬움 졸업과 같은 규칙). ts-fsrs 5.4는 복습 상태 카드에서만 이를
 * 강제해, 안정도가 낮은 학습 카드에서는 등급 칸이 '24시간 / 24시간'을 보였다.
 *
 * 카드는 모두 rateCard(증거 필수) 경로로 만든다. 흔들림(fuzz)은 같은 카드·시각이면 결정적이다.
 */
const rate = (c: SerializedCard, r: Rating, now: Date): SerializedCard =>
  rateCard(
    { key: 'v1:ref', verseId: 'v1', direction: 'ref', card: c },
    { mode: 'typing', rating: r, accuracy: 1, peeks: null },
    now,
  ).card.card

const START = new Date('2026-03-01T00:00:00Z')

/** 새 카드에 ratings를 차례로, 매번 기한에 매긴 카드와 그 기한 */
function walk(ratings: readonly Rating[]): { card: SerializedCard; now: Date } {
  let card = newCard(START)
  for (const r of ratings) card = rate(card, r, new Date(card.due))
  return { card, now: new Date(card.due) }
}

const RATINGS: readonly Rating[] = [1, 2, 3, 4]
const learning = (c: SerializedCard) =>
  c.state === State.Learning || c.state === State.Relearning

describe('학습 중 졸업 — 쉬움은 좋음보다 하루 이상 길다', () => {
  // 수정 전 ts-fsrs 그대로는 셋 다 좋음 = 쉬움이었다(학습 1일/1일, 재학습 1일/1일, 2일/2일)
  it.each([
    ['학습: 다시 → 좋음', [1, 3], State.Learning, '24시간', '2일'],
    ['재학습: 좋음 둘 → 다시', [3, 3, 1], State.Relearning, '24시간', '2일'],
    ['재학습: 좋음 셋 → 다시', [3, 3, 3, 1], State.Relearning, '2일', '3일'],
  ] as const)('%s', (_name, ratings, state, goodLabel, easyLabel) => {
    const { card, now } = walk(ratings)
    expect(card.state).toBe(state)

    const p = intervalPreview(card, now)
    expect(p[3]).toBe(goodLabel)
    expect(p[4]).toBe(easyLabel)
    expect(p[4]).not.toBe(p[3])

    const good = rate(card, 3, now)
    const easy = rate(card, 4, now)
    expect(good.state).toBe(State.Review)
    expect(easy.state).toBe(State.Review)
    expect(easy.scheduled_days).toBe(good.scheduled_days + 1)
    expect(Date.parse(easy.due) - Date.parse(good.due)).toBe(86_400_000)
  })

  it('쉬움 졸업에서 바뀌는 것은 간격·기한뿐 — 안정도·난이도 등은 ts-fsrs 값 그대로', () => {
    // 아래 값은 수정 전 rateCard(…, 4)가 낸 값이다
    const before = {
      '[3,3,1]': { stability: 1.13505133, difficulty: 6.50607402, reps: 4, lapses: 1 },
      '[3,3,3,1]': { stability: 2.72954085, difficulty: 6.5030557, reps: 5, lapses: 1 },
      '[1,3]': { stability: 0.48892084, difficulty: 5.18509795, reps: 3, lapses: 0 },
    }
    for (const [seq, want] of Object.entries(before)) {
      const { card, now } = walk(JSON.parse(seq) as Rating[])
      const easy = rate(card, 4, now)
      expect(easy).toMatchObject({
        ...want,
        state: State.Review,
        learning_steps: 0,
        last_review: now.toISOString(),
      })
    }
  })

  it('길이 4 이하의 모든 등급 순서에서: 등급 칸 = 실제 기한, 학습 중 졸업이면 쉬움 ≥ 좋음 + 1일', () => {
    let graduations = 0
    const visit = (ratings: Rating[]) => {
      const { card, now } = walk(ratings)
      const p = intervalPreview(card, now)
      const next = RATINGS.map((r) => rate(card, r, now))
      next.forEach((n, i) => {
        expect(p[RATINGS[i] ?? 1]).toBe(formatInterval(Date.parse(n.due) - now.getTime()))
      })
      const [, , good, easy] = next
      if (learning(card) && good?.state === State.Review && easy?.state === State.Review) {
        graduations++
        expect(easy.scheduled_days).toBeGreaterThanOrEqual(good.scheduled_days + 1)
      }
      if (ratings.length < 4) for (const r of RATINGS) visit([...ratings, r])
    }
    visit([])
    expect(graduations).toBeGreaterThan(20)
  })
})

describe('학습 중 졸업이 아닌 경우는 수정 전과 같다', () => {
  // [등급 순서, 등급 칸(다시·어려움·좋음·쉬움), 각 등급 뒤의 [state, scheduled_days, due]] — 수정 전
  // 값. null은 이 노드가 고친 칸(학습 중 쉬움 졸업)이라 위에서 따로 본다.
  type Row = [string, string[], ([number, number, string] | null)[]]
  const ROWS: Row[] = [
    [
      '[]',
      ['1분', '6분', '10분', '9일'],
      [
        [1, 0, '2026-03-01T00:01:00.000Z'],
        [1, 0, '2026-03-01T00:06:00.000Z'],
        [1, 0, '2026-03-01T00:10:00.000Z'],
        [2, 9, '2026-03-10T00:00:00.000Z'],
      ],
    ],
    [
      '[1]',
      ['1분', '6분', '10분', '24시간'],
      [
        [1, 0, '2026-03-01T00:02:00.000Z'],
        [1, 0, '2026-03-01T00:07:00.000Z'],
        [1, 0, '2026-03-01T00:11:00.000Z'],
        [2, 1, '2026-03-02T00:01:00.000Z'],
      ],
    ],
    [
      '[1,1]',
      ['1분', '6분', '10분', '24시간'],
      [
        [1, 0, '2026-03-01T00:03:00.000Z'],
        [1, 0, '2026-03-01T00:08:00.000Z'],
        [1, 0, '2026-03-01T00:12:00.000Z'],
        [2, 1, '2026-03-02T00:02:00.000Z'],
      ],
    ],
    [
      '[2]',
      ['1분', '6분', '10분', '2일'],
      [
        [1, 0, '2026-03-01T00:07:00.000Z'],
        [1, 0, '2026-03-01T00:12:00.000Z'],
        [1, 0, '2026-03-01T00:16:00.000Z'],
        [2, 2, '2026-03-03T00:06:00.000Z'],
      ],
    ],
    [
      '[1,2]',
      ['1분', '6분', '10분', '24시간'],
      [
        [1, 0, '2026-03-01T00:08:00.000Z'],
        [1, 0, '2026-03-01T00:13:00.000Z'],
        [1, 0, '2026-03-01T00:17:00.000Z'],
        [2, 1, '2026-03-02T00:07:00.000Z'],
      ],
    ],
    [
      '[2,1]',
      ['1분', '6분', '10분', '24시간'],
      [
        [1, 0, '2026-03-01T00:08:00.000Z'],
        [1, 0, '2026-03-01T00:13:00.000Z'],
        [1, 0, '2026-03-01T00:17:00.000Z'],
        [2, 1, '2026-03-02T00:07:00.000Z'],
      ],
    ],
    [
      '[3]',
      ['1분', '6분', '2일', '5일'],
      [
        [1, 0, '2026-03-01T00:11:00.000Z'],
        [1, 0, '2026-03-01T00:16:00.000Z'],
        [2, 2, '2026-03-03T00:10:00.000Z'],
        [2, 5, '2026-03-06T00:10:00.000Z'],
      ],
    ],
    [
      '[3,3]',
      ['10분', '9일', '12일', '21일'],
      [
        [3, 0, '2026-03-03T00:20:00.000Z'],
        [2, 9, '2026-03-12T00:10:00.000Z'],
        [2, 12, '2026-03-15T00:10:00.000Z'],
        [2, 21, '2026-03-24T00:10:00.000Z'],
      ],
    ],
    [
      '[3,3,3]',
      ['10분', '1.0개월', '1.5개월', '2.5개월'],
      [
        [3, 0, '2026-03-15T00:20:00.000Z'],
        [2, 31, '2026-04-15T00:10:00.000Z'],
        [2, 46, '2026-04-30T00:10:00.000Z'],
        [2, 77, '2026-05-31T00:10:00.000Z'],
      ],
    ],
    [
      '[3,3,3,3]',
      ['10분', '4개월', '6개월', '9개월'],
      [
        [3, 0, '2026-04-30T00:20:00.000Z'],
        [2, 121, '2026-08-29T00:10:00.000Z'],
        [2, 169, '2026-10-16T00:10:00.000Z'],
        [2, 272, '2027-01-27T00:10:00.000Z'],
      ],
    ],
    [
      '[4]',
      ['10분', '1.0개월', '1.4개월', '2.4개월'],
      [
        [3, 0, '2026-03-10T00:10:00.000Z'],
        [2, 30, '2026-04-09T00:00:00.000Z'],
        [2, 44, '2026-04-23T00:00:00.000Z'],
        [2, 74, '2026-05-23T00:00:00.000Z'],
      ],
    ],
    [
      '[4,4]',
      ['10분', '6개월', '9개월', '1.2년'],
      [
        [3, 0, '2026-05-23T00:10:00.000Z'],
        [2, 197, '2026-12-06T00:00:00.000Z'],
        [2, 277, '2027-02-24T00:00:00.000Z'],
        [2, 454, '2027-08-20T00:00:00.000Z'],
      ],
    ],
    [
      '[3,3,2]',
      ['10분', '23일', '1.0개월', '1.6개월'],
      [
        [3, 0, '2026-03-12T00:20:00.000Z'],
        [2, 23, '2026-04-04T00:10:00.000Z'],
        [2, 31, '2026-04-12T00:10:00.000Z'],
        [2, 50, '2026-05-01T00:10:00.000Z'],
      ],
    ],
    [
      '[3,3,4,3]',
      ['10분', '7개월', '9개월', '1.3년'],
      [
        [3, 0, '2026-06-13T00:20:00.000Z'],
        [2, 206, '2027-01-05T00:10:00.000Z'],
        [2, 288, '2027-03-28T00:10:00.000Z'],
        [2, 467, '2027-09-23T00:10:00.000Z'],
      ],
    ],
    // 재학습이지만 쉬움이 이미 좋음보다 길다 — 손대지 않는다
    [
      '[4,1]',
      ['10분', '15분', '24시간', '2일'],
      [
        [3, 0, '2026-03-10T00:20:00.000Z'],
        [3, 0, '2026-03-10T00:25:00.000Z'],
        [2, 1, '2026-03-11T00:10:00.000Z'],
        [2, 2, '2026-03-12T00:10:00.000Z'],
      ],
    ],
    [
      '[3,3,3,3,1]',
      ['10분', '15분', '4일', '6일'],
      [
        [3, 0, '2026-04-30T00:30:00.000Z'],
        [3, 0, '2026-04-30T00:35:00.000Z'],
        [2, 4, '2026-05-04T00:20:00.000Z'],
        [2, 6, '2026-05-06T00:20:00.000Z'],
      ],
    ],
    // 고친 사례의 다시·어려움·좋음(등급 칸의 쉬움은 고친 값)
    [
      '[3,3,1]',
      ['10분', '15분', '24시간', '2일'],
      [
        [3, 0, '2026-03-03T00:30:00.000Z'],
        [3, 0, '2026-03-03T00:35:00.000Z'],
        [2, 1, '2026-03-04T00:20:00.000Z'],
        null,
      ],
    ],
    [
      '[3,3,3,1]',
      ['10분', '15분', '2일', '3일'],
      [
        [3, 0, '2026-03-15T00:30:00.000Z'],
        [3, 0, '2026-03-15T00:35:00.000Z'],
        [2, 2, '2026-03-17T00:20:00.000Z'],
        null,
      ],
    ],
    [
      '[1,3]',
      ['1분', '6분', '24시간', '2일'],
      [
        [1, 0, '2026-03-01T00:12:00.000Z'],
        [1, 0, '2026-03-01T00:17:00.000Z'],
        [2, 1, '2026-03-02T00:11:00.000Z'],
        null,
      ],
    ],
  ]

  it.each(ROWS)('%s', (seq, preview, after) => {
    const { card, now } = walk(JSON.parse(seq) as Rating[])
    expect(Object.values(intervalPreview(card, now))).toEqual(preview)
    after.forEach((want, i) => {
      if (want === null) return
      const n = rate(card, RATINGS[i] ?? 1, now)
      expect([n.state, n.scheduled_days, n.due]).toEqual(want)
    })
  })
})

describe('소개 장면 예상치는 수정 전과 같다', () => {
  it('재학습 쉬움 졸업이 섞인 순서도 같은 값', () => {
    // 수정 전 forecastReviews가 낸 값 — 14일째 재학습에서 쉬움(2일)은 이미 좋음보다 길었다
    expect(forecastReviews([1, 3, 4, 2, 1, 4, 3])).toEqual({
      preview: { 1: '10분', 2: '8일', 3: '11일', 4: '19일' },
      reviews: [
        { day: 0, rating: 1, stability: 0.60770166, due: 0, interval: '10분' },
        { day: 0, rating: 3, stability: 0.65979762, due: 1, interval: '24시간' },
        { day: 1, rating: 4, stability: 4.08614772, due: 5, interval: '4일' },
        { day: 5, rating: 2, stability: 8.73764108, due: 14, interval: '9일' },
        { day: 14, rating: 1, stability: 1.26886862, due: 14, interval: '10분' },
        { day: 14, rating: 4, stability: 2.25789505, due: 16, interval: '2일' },
        { day: 16, rating: 3, stability: 4.26451419, due: 20, interval: '4일' },
      ],
      unreviewedRecall: 0.58252074,
    })
  })
})
