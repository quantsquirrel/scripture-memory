// 가드레일: 기존 사용자 데이터의 생존.
// tests/fixtures/의 골든 fixture는 과거 버전 사용자 데이터의 대역이다 — 수정 금지.
// 저장/export 스키마를 바꾸면 이 테스트가 (마이그레이션과 함께) 계속 통과해야 한다.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  exportAll,
  getAllCards,
  getLearning,
  importAll,
  resetAll,
  runLadder,
  submitReview,
} from '../src/app'
import { DIRECTIONS, type ReviewEntry } from '../src/domain/card'
import { required } from '../src/domain/invariant'
import { isGraduated, stepFromLegacy } from '../src/domain/ladder'
import { type ExportBundle, SCHEMA_VERSION } from '../src/ports/repositories'
import fixtureV1Json from './fixtures/export-v1.json'
import fixtureV2Json from './fixtures/export-v2.json'

const fixtureV1 = fixtureV1Json as unknown as ExportBundle
const fixtureV2 = fixtureV2Json as unknown as ExportBundle
const NOW = new Date('2026-07-18T10:00:00.000Z')

beforeEach(async () => {
  await resetAll()
})

/**
 * 졸업은 사다리를 통과한 결과로만 일어난다 (domain/ladder.ts).
 * 테스트도 같은 경로를 쓴다 — 카드 생성만 따로 부르는 우회로는 없다.
 */
const graduate = (verseId: string, now = new Date()) =>
  runLadder(verseId, { step: 'typing', event: 'graded', perfect: true }, now)

describe('골든 fixture 호환성 (v1)', () => {
  it('v1 export를 import하면 카드·리뷰는 무손실, 학습 단계는 v2로 올라간다', async () => {
    const bundle = fixtureV1
    await importAll(bundle)
    const out = await exportAll()
    expect(out.version).toBe(SCHEMA_VERSION)

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

    // 학습 진행 상태: v1의 숫자 단계가 사다리 단계로 마이그레이션된다.
    // 값이 바뀌는 유일한 필드이며, 대응은 domain/ladder.ts의 stepFromLegacy가 정본이다.
    expect(out.learning).toStrictEqual([
      { verseId: 'AS1a', step: 'graduated', updatedAt: '2026-07-14T12:30:00.000Z' },
      { verseId: 'AS2a', step: 'firstLetter', updatedAt: '2026-07-18T08:55:00.000Z' },
    ])
    // 마이그레이션은 의미를 보존한다 — 졸업 여부가 뒤집히지 않는다.
    // v1의 런타임 step은 숫자이므로 선언 타입이 아니라 원본 JSON에서 센다.
    const v1GraduatedCount = fixtureV1Json.learning.filter((l) => l.step >= 3).length
    expect(out.learning.filter(isGraduated)).toHaveLength(v1GraduatedCount)
  })

  it('v1의 네 단계 숫자가 모두 사다리 단계로 대응된다', () => {
    expect([0, 1, 2, 3].map(stepFromLegacy)).toEqual([
      'intro',
      'firstLetter',
      'typing',
      'graduated',
    ])
    // v1에서 step은 단조 증가였고 3 이상은 모두 '복습 큐 편입'을 뜻했다
    expect(stepFromLegacy(4)).toBe('graduated')
    expect(stepFromLegacy(-1)).toBe('intro')
  })

  it('알 수 없는 버전/앱의 번들은 거부한다 (조용한 데이터 파괴 금지)', async () => {
    await expect(importAll({ ...fixtureV1, version: 3 })).rejects.toThrow()
    await expect(importAll({ ...fixtureV1, version: '2' })).rejects.toThrow()
    await expect(importAll({ ...fixtureV1, app: 'other' })).rejects.toThrow()
    // 형태 자체가 아닌 것도 저장소를 비우기 전에 거부한다
    await expect(importAll(null)).rejects.toThrow()
    await expect(importAll('{}')).rejects.toThrow()
    await expect(importAll({ ...fixtureV1, cards: 'nope' })).rejects.toThrow()
  })

  it('import 후에도 복습 파이프라인이 이어서 동작한다', async () => {
    await importAll(fixtureV1)
    const card = required((await getAllCards()).find((c) => c.key === 'AS1a:topic'))
    const updated = await submitReview(
      card,
      { mode: 'recite', rating: 3, accuracy: null, peeks: null },
      NOW,
    )
    expect(updated.card.reps).toBe(card.card.reps + 1)
    expect(new Date(updated.card.due).getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('골든 fixture 호환성 (v2)', () => {
  it('v2 export는 왕복해도 바이트 단위로 같다 (exportedAt 제외)', async () => {
    await importAll(fixtureV2)
    const out = await exportAll()
    const stripId = ({ id: _id, ...rest }: ReviewEntry) => rest
    const byKey = (cards: typeof out.cards) =>
      [...cards].sort((a, b) => (a.key < b.key ? -1 : 1))
    expect(out.version).toBe(SCHEMA_VERSION)
    // 저장소는 키 순서로 돌려주므로 순서가 아니라 내용을 비교한다
    expect(byKey(out.cards)).toStrictEqual(byKey(fixtureV2.cards))
    expect(out.reviews.map(stripId)).toStrictEqual(fixtureV2.reviews.map(stripId))
    expect(out.learning).toStrictEqual(fixtureV2.learning)
  })

  it('v1과 v2 fixture는 같은 상태로 수렴한다 (마이그레이션 등가성)', async () => {
    await importAll(fixtureV1)
    const fromV1 = await exportAll()
    await resetAll()
    await importAll(fixtureV2)
    const fromV2 = await exportAll()
    expect(fromV1.cards).toStrictEqual(fromV2.cards)
    expect(fromV1.learning).toStrictEqual(fromV2.learning)
    expect(fromV1.reviews.map((r) => r.ts)).toStrictEqual(fromV2.reviews.map((r) => r.ts))
  })
})

describe('졸업 → 3방향 카드 생성', () => {
  it('세 방향 카드가 모두 생성되고 step 3으로 표시된다', async () => {
    await graduate('AS1a', NOW)
    const cards = await getAllCards()
    expect(cards.map((c) => c.direction).sort()).toEqual([...DIRECTIONS].sort())
    expect(cards.every((c) => c.verseId === 'AS1a')).toBe(true)
    expect((await getLearning('AS1a'))?.step).toBe('graduated')
  })

  it('재졸업해도 기존 카드의 FSRS 상태를 덮어쓰지 않는다', async () => {
    await graduate('AS1a', NOW)
    const before = required((await getAllCards()).find((c) => c.key === 'AS1a:ref'))
    const progressed = await submitReview(
      before,
      { mode: 'recite', rating: 3, accuracy: null, peeks: null },
      NOW,
    )
    await graduate('AS1a', new Date(NOW.getTime() + 1000))
    const after = required((await getAllCards()).find((c) => c.key === 'AS1a:ref'))
    expect(after.card).toStrictEqual(progressed.card)
  })
})

describe('submitReview — 등급 적용과 증거 기록의 결합', () => {
  it('등급 적용은 항상 증거(ReviewEntry)와 함께 기록된다', async () => {
    await graduate('AS1a', NOW)
    const card = required((await getAllCards()).find((c) => c.key === 'AS1a:topic'))
    await submitReview(card, { mode: 'typing', rating: 2, accuracy: 0.93, peeks: null }, NOW)
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
    const stored = required(out.cards.find((c) => c.key === 'AS1a:topic'))
    expect(stored.card.reps).toBe(card.card.reps + 1)
  })
})
