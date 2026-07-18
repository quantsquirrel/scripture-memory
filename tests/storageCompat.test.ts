// 가드레일: 기존 사용자 데이터의 생존.
// tests/fixtures/의 골든 fixture는 과거 버전 사용자 데이터의 대역이다 — 수정 금지.
// 저장/export 스키마를 바꾸면 이 테스트가 (마이그레이션과 함께) 계속 통과해야 한다.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportAll,
  getAllCards,
  getLearning,
  graduateVerse,
  importAll,
  resetAll,
  submitReview,
  type ExportBundle,
} from '../src/lib/db'
import { DIRECTIONS, type ReviewEntry } from '../src/lib/types'
import fixtureJson from './fixtures/export-v1.json'

const fixtureV1 = fixtureJson as unknown as ExportBundle
const NOW = new Date('2026-07-18T10:00:00.000Z')

beforeEach(async () => {
  await resetAll()
})

describe('골든 fixture 호환성 (v1)', () => {
  it('v1 export를 무손실로 import → export한다', async () => {
    const bundle = fixtureV1
    await importAll(bundle)
    const out = await exportAll()

    // 카드: FSRS 상태의 모든 필드가 보존되어야 한다 (초기화되면 사용자 진도 손실)
    const byKey = Object.fromEntries(out.cards.map((c) => [c.key, c]))
    for (const c of bundle.cards) {
      expect(byKey[c.key], `card ${c.key} 유실`).toBeDefined()
      expect(byKey[c.key]).toStrictEqual(c)
    }
    expect(out.cards).toHaveLength(bundle.cards.length)

    // 리뷰: id는 재발급되지만 내용은 전부 보존
    const stripId = ({ id: _id, ...rest }: ReviewEntry) => rest
    expect(out.reviews.map(stripId)).toStrictEqual(bundle.reviews.map(stripId))

    // 학습 진행 상태 보존
    expect(out.learning).toStrictEqual(bundle.learning)
  })

  it('알 수 없는 버전/앱의 번들은 거부한다 (조용한 데이터 파괴 금지)', async () => {
    await expect(importAll({ ...fixtureV1, version: 2 as 1 })).rejects.toThrow()
    await expect(
      importAll({ ...fixtureV1, app: 'other' as 'scripture-memory' }),
    ).rejects.toThrow()
  })

  it('import 후에도 복습 파이프라인이 이어서 동작한다', async () => {
    await importAll(fixtureV1)
    const card = (await getAllCards()).find((c) => c.key === 'AS1a:topic')!
    const updated = await submitReview(card, 3, 'recite', { accuracy: null, peeks: null }, NOW)
    expect(updated.card.reps).toBe(card.card.reps + 1)
    expect(new Date(updated.card.due).getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('졸업 → 3방향 카드 생성', () => {
  it('세 방향 카드가 모두 생성되고 step 3으로 표시된다', async () => {
    await graduateVerse('AS1a', NOW)
    const cards = await getAllCards()
    expect(cards.map((c) => c.direction).sort()).toEqual([...DIRECTIONS].sort())
    expect(cards.every((c) => c.verseId === 'AS1a')).toBe(true)
    expect((await getLearning('AS1a'))?.step).toBe(3)
  })

  it('재졸업해도 기존 카드의 FSRS 상태를 덮어쓰지 않는다', async () => {
    await graduateVerse('AS1a', NOW)
    const before = (await getAllCards()).find((c) => c.key === 'AS1a:ref')!
    const progressed = await submitReview(before, 3, 'recite', { accuracy: null, peeks: null }, NOW)
    await graduateVerse('AS1a', new Date(NOW.getTime() + 1000))
    const after = (await getAllCards()).find((c) => c.key === 'AS1a:ref')!
    expect(after.card).toStrictEqual(progressed.card)
  })
})

describe('submitReview — 등급 적용과 증거 기록의 결합', () => {
  it('등급 적용은 항상 증거(ReviewEntry)와 함께 기록된다', async () => {
    await graduateVerse('AS1a', NOW)
    const card = (await getAllCards()).find((c) => c.key === 'AS1a:topic')!
    await submitReview(card, 2, 'typing', { accuracy: 0.93, peeks: null }, NOW)
    const out = await exportAll()
    expect(out.reviews).toHaveLength(1)
    expect(out.reviews[0]).toMatchObject({
      cardKey: 'AS1a:topic',
      mode: 'typing',
      rating: 2,
      accuracy: 0.93,
      peeks: null,
      ts: NOW.toISOString(),
    })
    const stored = out.cards.find((c) => c.key === 'AS1a:topic')!
    expect(stored.card.reps).toBe(card.card.reps + 1)
  })
})
