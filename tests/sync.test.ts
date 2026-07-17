import { describe, expect, it } from 'vitest'
import { mergeBundles } from '../src/lib/sync'
import type { ExportBundle } from '../src/lib/db'
import type { ReviewEntry, SerializedCard, StoredCard } from '../src/lib/types'

const card = (key: string, reps: number, due: string): StoredCard => ({
  key,
  verseId: key.split(':')[0],
  direction: 'ref',
  card: {
    due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps,
    lapses: 0,
    learning_steps: 0,
    state: 2,
  } as SerializedCard,
})

const review = (cardKey: string, ts: string): ReviewEntry => ({
  cardKey,
  verseId: cardKey.split(':')[0],
  direction: 'ref',
  mode: 'recite',
  rating: 3,
  accuracy: null,
  peeks: null,
  ts,
})

const bundle = (over: Partial<ExportBundle>): ExportBundle => ({
  app: 'scripture-memory',
  version: 1,
  exportedAt: '2026-07-17T00:00:00Z',
  cards: [],
  reviews: [],
  learning: [],
  ...over,
})

describe('mergeBundles', () => {
  it('리뷰는 중복 없이 합집합', () => {
    const shared = review('A1a:ref', '2026-07-16T01:00:00Z')
    const a = bundle({ reviews: [shared, review('A1a:ref', '2026-07-17T01:00:00Z')] })
    const b = bundle({ reviews: [shared, review('A1a:topic', '2026-07-17T02:00:00Z')] })
    const m = mergeBundles(a, b)
    expect(m.reviews).toHaveLength(3)
  })

  it('카드는 reps가 많은 쪽이 이긴다 (동률이면 due가 늦은 쪽)', () => {
    const a = bundle({ cards: [card('A1a:ref', 5, '2026-07-20T00:00:00Z')] })
    const b = bundle({ cards: [card('A1a:ref', 3, '2026-09-01T00:00:00Z')] })
    expect(mergeBundles(a, b).cards[0].card.reps).toBe(5)

    const c = bundle({ cards: [card('A1a:ref', 5, '2026-07-20T00:00:00Z')] })
    const d = bundle({ cards: [card('A1a:ref', 5, '2026-08-01T00:00:00Z')] })
    expect(mergeBundles(c, d).cards[0].card.due).toBe('2026-08-01T00:00:00Z')
  })

  it('학습 상태는 step이 높은 쪽이 이긴다', () => {
    const a = bundle({ learning: [{ verseId: 'AS1a', step: 3, updatedAt: '2026-07-16T00:00:00Z' }] })
    const b = bundle({ learning: [{ verseId: 'AS1a', step: 1, updatedAt: '2026-07-17T00:00:00Z' }] })
    expect(mergeBundles(a, b).learning[0].step).toBe(3)
  })

  it('한쪽이 비어 있으면 다른 쪽 그대로', () => {
    const a = bundle({
      cards: [card('A1a:ref', 1, '2026-07-18T00:00:00Z')],
      reviews: [review('A1a:ref', '2026-07-17T01:00:00Z')],
      learning: [{ verseId: 'A1a', step: 3, updatedAt: '2026-07-17T00:00:00Z' }],
    })
    const m = mergeBundles(a, bundle({}))
    expect(m.cards).toHaveLength(1)
    expect(m.reviews).toHaveLength(1)
    expect(m.learning).toHaveLength(1)
  })
})
