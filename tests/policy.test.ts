// 가드레일: 자가 채점(recite)은 주기적 객관 감사와 함께만 존재한다.
// 이 정책이 무너지면 자가 신고가 FSRS 데이터를 무한정 오염시킬 수 있다 — 앱의 창립 가치 위반.
import { describe, expect, it } from 'vitest'
import { orderQueue, reviewMode } from '../src/lib/policy'
import { DIRECTIONS, type Direction, type StoredCard } from '../src/lib/types'

describe('reviewMode 정책', () => {
  it('말씀→장절 방향은 언제나 장절 입력(객관 채점)', () => {
    for (const reps of [0, 1, 3, 10, 100]) {
      expect(reviewMode('text', reps)).toBe('refInput')
    }
  })

  it('어린 카드(reps<3)는 첫글자 훈련으로 축자 회상을 강제', () => {
    for (const reps of [0, 1, 2]) {
      expect(reviewMode('topic', reps)).toBe('firstLetter')
      expect(reviewMode('ref', reps)).toBe('firstLetter')
    }
  })

  it('성숙한 카드는 5회마다 타이핑 감사가 낀다', () => {
    expect(reviewMode('topic', 4)).toBe('typing')
    expect(reviewMode('topic', 9)).toBe('typing')
    expect(reviewMode('ref', 14)).toBe('typing')
  })

  it('불변식: 어떤 방향에서도 자가 채점만으로 5회 연속 진행할 수 없다', () => {
    for (const dir of ['topic', 'ref', 'text'] as const) {
      for (let start = 0; start <= 100; start++) {
        const window = [0, 1, 2, 3, 4].map((i) => reviewMode(dir, start + i))
        expect(
          window.some((m) => m !== 'recite'),
          `${dir} reps ${start}~${start + 4}가 전부 recite`,
        ).toBe(true)
      }
    }
  })
})

// 가드레일: 복습 큐가 같은 구절의 카드를 연달아 내보내면, 직전 카드가 장절 답을
// 유출해 말씀→장절 객관 채점이 무의미해진다. 또 due 순 고정 정렬은 외운 순서를
// 재생해 순서 단서를 만든다.
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function card(verseId: string, direction: Direction): StoredCard {
  return {
    key: `${verseId}:${direction}`,
    verseId,
    direction,
    card: {
      due: '2026-07-18T00:00:00.000Z',
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: 0,
    },
  }
}

const fullDeck = (verses: string[]) => verses.flatMap((v) => DIRECTIONS.map((d) => card(v, d)))

describe('orderQueue 정책', () => {
  it('입력의 순열이다 — 카드를 잃거나 만들지 않는다', () => {
    const deck = fullDeck(['v1', 'v2', 'v3', 'v4'])
    const out = orderQueue(deck, seeded(1))
    expect(out.map((c) => c.key).sort()).toEqual(deck.map((c) => c.key).sort())
  })

  it('같은 구절의 카드가 연달아 나오지 않는다 (구절 2개 이상)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const out = orderQueue(fullDeck(['v1', 'v2', 'v3', 'v4', 'v5']), seeded(seed))
      for (let i = 1; i < out.length; i++) {
        expect(out[i].verseId, `seed ${seed} 위치 ${i}`).not.toBe(out[i - 1].verseId)
      }
    }
  })

  it('같은 구절 카드 사이 간격이 due 구절 수만큼 벌어진다', () => {
    const verses = ['v1', 'v2', 'v3', 'v4', 'v5']
    const out = orderQueue(fullDeck(verses), seeded(7))
    const lastAt = new Map<string, number>()
    out.forEach((c, i) => {
      const prev = lastAt.get(c.verseId)
      if (prev !== undefined) expect(i - prev).toBeGreaterThanOrEqual(verses.length)
      lastAt.set(c.verseId, i)
    })
  })

  it('순서가 셔플된다 — 외운 순서(입력 순서) 그대로 나오지 않는다', () => {
    const deck = fullDeck(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])
    const inputOrder = deck.map((c) => c.key)
    // 시드 몇 개 중 하나라도 입력 순서와 다르면 셔플이 동작하는 것
    const anyShuffled = [1, 2, 3].some(
      (s) => orderQueue(deck, seeded(s)).map((c) => c.key).join() !== inputOrder.join(),
    )
    expect(anyShuffled).toBe(true)
  })

  it('같은 시드는 같은 순서(결정적)', () => {
    const deck = fullDeck(['v1', 'v2', 'v3'])
    expect(orderQueue(deck, seeded(9)).map((c) => c.key)).toEqual(
      orderQueue(deck, seeded(9)).map((c) => c.key),
    )
  })

  it('한 구절만 남으면 인접이 불가피 — 그래도 전부 나온다', () => {
    const deck = [...DIRECTIONS.map((d) => card('v1', d)), card('v2', 'ref')]
    const out = orderQueue(deck, seeded(3))
    expect(out).toHaveLength(4)
    expect(out.map((c) => c.key).sort()).toEqual(deck.map((c) => c.key).sort())
  })

  it('빈 큐는 빈 큐', () => {
    expect(orderQueue([], seeded(1))).toEqual([])
  })
})
