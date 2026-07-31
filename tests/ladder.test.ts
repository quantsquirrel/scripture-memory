// 이 파일은 fake-indexeddb를 import하지 않는다 — 도메인·앱 규칙이 저장소 구현과
// 분리되어 있음을 그 자체로 보여준다. 저장은 인메모리 어댑터가 받는다.
import { describe, expect, it } from 'vitest'

import { MemoryStore } from '../src/adapters/memory'
import { openLadder, runLadder, submitReview } from '../src/app/review'
import { DIRECTIONS } from '../src/domain/card'
import { required } from '../src/domain/invariant'
import {
  advance,
  isGraduated,
  isInProgress,
  type LadderStep,
  MAX_PEEKS_TO_PASS,
  resumeStep,
  stepFromLegacy,
  stepOrdinal,
  stepToLegacy,
} from '../src/domain/ladder'

const NOW = new Date('2026-07-31T10:00:00.000Z')

describe('사다리 전이 (순수 함수)', () => {
  it('소개 → 첫글자, 중복 구절은 타이핑으로 건너뛴다', () => {
    expect(advance({ step: 'intro', event: 'recited' })).toEqual({
      kind: 'move',
      step: 'firstLetter',
    })
    expect(advance({ step: 'intro', event: 'skipToTyping' })).toEqual({
      kind: 'move',
      step: 'typing',
    })
  })

  it('첫글자는 엿보기 2회 이하만 통과 — 3회부터는 같은 단계에 머문다', () => {
    for (const peeks of [0, 1, 2]) {
      expect(advance({ step: 'firstLetter', event: 'attempted', peeks })).toEqual({
        kind: 'move',
        step: 'typing',
      })
    }
    expect(advance({ step: 'firstLetter', event: 'attempted', peeks: 3 })).toEqual({
      kind: 'stay',
      step: 'firstLetter',
      reason: 'peeksExceeded',
    })
    expect(MAX_PEEKS_TO_PASS).toBe(2)
  })

  it('타이핑은 word-perfect만 졸업이고, 졸업은 3방향을 결과로 낸다', () => {
    const out = advance({ step: 'typing', event: 'graded', perfect: true })
    expect(out).toEqual({ kind: 'graduate', step: 'graduated', directions: DIRECTIONS })
    expect(advance({ step: 'typing', event: 'graded', perfect: false })).toEqual({
      kind: 'stay',
      step: 'typing',
      reason: 'notPerfect',
    })
  })

  it('재도전은 단계를 되돌리지 않는다', () => {
    expect(advance({ step: 'firstLetter', event: 'retry' }).kind).toBe('stay')
    expect(advance({ step: 'typing', event: 'retry' }).kind).toBe('stay')
  })

  it('졸업 단계에서는 어떤 명령도 만들 수 없다 (타입 수준)', () => {
    // @ts-expect-error graduated를 step으로 갖는 LadderCommand 멤버가 없다
    expect(() => advance({ step: 'graduated', event: 'recited' })).toBeDefined()
    // @ts-expect-error intro는 'graded'를 받지 않는다
    expect(() => advance({ step: 'intro', event: 'graded', perfect: true })).toBeDefined()
    // @ts-expect-error 첫글자 시도는 peeks 증거 없이는 만들 수 없다
    expect(() => advance({ step: 'firstLetter', event: 'attempted' })).toBeDefined()
  })

  it('v1 숫자 단계와 왕복한다', () => {
    const steps: LadderStep[] = ['intro', 'firstLetter', 'typing', 'graduated']
    expect(steps.map(stepToLegacy).map(stepFromLegacy)).toEqual(steps)
    expect(stepOrdinal('intro')).toEqual({ nth: 1, total: 4 })
    expect(stepOrdinal('graduated')).toEqual({ nth: 4, total: 4 })
  })

  it('다시 열 때: 기록 없으면 처음부터, 졸업한 구절은 타이핑부터 재훈련', () => {
    expect(resumeStep(undefined)).toBe('intro')
    expect(resumeStep('graduated')).toBe('typing')
    expect(resumeStep('firstLetter')).toBe('firstLetter')
  })

  it('진행 판정 헬퍼', () => {
    expect(isInProgress({ step: 'firstLetter' })).toBe(true)
    expect(isInProgress({ step: 'typing' })).toBe(true)
    expect(isInProgress({ step: 'intro' })).toBe(false)
    expect(isInProgress({ step: 'graduated' })).toBe(false)
    expect(isGraduated({ step: 'graduated' })).toBe(true)
  })
})

describe('사다리 유스케이스 (인메모리 저장소)', () => {
  it('소개→첫글자→타이핑→졸업을 거치면 3방향 카드가 생긴다', async () => {
    const store = new MemoryStore()
    expect(await openLadder(store, 'AS1a')).toBe('intro')

    await runLadder(store, 'AS1a', { step: 'intro', event: 'recited' }, NOW)
    expect((await store.learning.get('AS1a'))?.step).toBe('firstLetter')
    expect(await store.cards.all()).toHaveLength(0)

    await runLadder(store, 'AS1a', { step: 'firstLetter', event: 'attempted', peeks: 1 }, NOW)
    expect((await store.learning.get('AS1a'))?.step).toBe('typing')
    expect(await store.cards.all()).toHaveLength(0)

    const out = await runLadder(
      store,
      'AS1a',
      { step: 'typing', event: 'graded', perfect: true },
      NOW,
    )
    expect(out.kind).toBe('graduate')
    expect((await store.learning.get('AS1a'))?.step).toBe('graduated')
    const cards = await store.cards.all()
    expect(cards.map((c) => c.direction).sort()).toEqual([...DIRECTIONS].sort())
  })

  it('통과하지 못한 시도는 단계를 올리지도, 카드를 만들지도 않는다', async () => {
    const store = new MemoryStore()
    await runLadder(store, 'AS1a', { step: 'intro', event: 'recited' }, NOW)

    await runLadder(store, 'AS1a', { step: 'firstLetter', event: 'attempted', peeks: 5 }, NOW)
    expect((await store.learning.get('AS1a'))?.step).toBe('firstLetter')

    await runLadder(store, 'AS1a', { step: 'typing', event: 'graded', perfect: false }, NOW)
    expect((await store.learning.get('AS1a'))?.step).toBe('firstLetter')
    expect(await store.cards.all()).toHaveLength(0)
  })

  it('등급 적용은 인메모리 어댑터에서도 증거와 함께만 기록된다', async () => {
    const store = new MemoryStore()
    await runLadder(store, 'AS1a', { step: 'typing', event: 'graded', perfect: true }, NOW)
    const card = required(await store.cards.get('AS1a:topic'))

    await submitReview(
      store,
      card,
      { mode: 'typing', rating: 2, accuracy: 0.93, peeks: null },
      NOW,
    )

    const reviews = await store.reviews.all()
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      cardKey: 'AS1a:topic',
      mode: 'typing',
      rating: 2,
      accuracy: 0.93,
      ts: NOW.toISOString(),
    })
    expect(required(await store.cards.get('AS1a:topic')).card.reps).toBe(card.card.reps + 1)
  })
})
