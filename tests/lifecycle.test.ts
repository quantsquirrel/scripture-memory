/**
 * 학습 사다리 전체 시나리오를 실제 트랜잭션 경로로 통과시킨다.
 * 소개 → 첫글자 → 타이핑 → 졸업 → 3방향 카드 → 복습 → lapse → 재학습 → 복귀.
 *
 * MemoryStore가 아니라 IndexedDB 어댑터를 쓴다 — 트랜잭션·인덱스·마이그레이션이
 * 걸린 실제 경로에서도 같은 규칙이 성립하는지 보기 위해서다.
 */
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { closeConnection, idbStore } from '../src/adapters/indexeddb'
import { openLadder, runLadder, submitReview } from '../src/app/review'
import { VERSE_BY_ID } from '../src/data/verses'
import type { StoredCard } from '../src/domain/card'
import { gradeTyping, ratingFromAccuracy, ratingFromPeeks } from '../src/domain/grading'
import { required } from '../src/domain/invariant'
import { LEARN_AHEAD_MS, reviewMode } from '../src/domain/policy'
import { State } from '../src/domain/scheduler'

const VERSE_ID = 'AS1a'
const T0 = new Date('2026-07-31T01:00:00.000Z')
const store = idbStore

const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000)

beforeEach(async () => {
  await closeConnection()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('tms-krv')
    req.onsuccess = () => {
      resolve()
    }
    req.onerror = () => {
      resolve()
    }
  })
})

describe('사다리 전체 생애주기 (실제 트랜잭션 경로)', () => {
  it('소개→첫글자→타이핑→졸업→복습→lapse→재학습이 한 흐름으로 이어진다', async () => {
    const verse = required(VERSE_BY_ID[VERSE_ID], VERSE_ID)

    // ── 1. 소개 단계에서 시작
    expect(await openLadder(store, VERSE_ID)).toBe('intro')
    expect(await store.cards.all()).toHaveLength(0)

    // ── 2. 낭송 완료 → 첫글자
    const toFirstLetter = await runLadder(
      store,
      VERSE_ID,
      { step: 'intro', event: 'recited' },
      at(1),
    )
    expect(toFirstLetter).toEqual({ kind: 'move', step: 'firstLetter' })
    expect((await store.learning.get(VERSE_ID))?.step).toBe('firstLetter')

    // ── 3. 엿보기 3회 → 통과 실패, 같은 단계에 머문다
    const tooManyPeeks = await runLadder(
      store,
      VERSE_ID,
      { step: 'firstLetter', event: 'attempted', peeks: 3 },
      at(2),
    )
    expect(tooManyPeeks).toEqual({
      kind: 'stay',
      step: 'firstLetter',
      reason: 'peeksExceeded',
    })
    expect((await store.learning.get(VERSE_ID))?.step).toBe('firstLetter')
    expect(await store.cards.all()).toHaveLength(0)

    // ── 4. 엿보기 1회 → 타이핑 단계로
    await runLadder(
      store,
      VERSE_ID,
      { step: 'firstLetter', event: 'attempted', peeks: 1 },
      at(3),
    )
    expect((await store.learning.get(VERSE_ID))?.step).toBe('typing')

    // ── 5. 오타가 있으면 졸업하지 못한다 (word-perfect 요구)
    const wrong = gradeTyping(
      verse.text,
      verse.text.slice(0, Math.floor(verse.text.length / 2)),
    )
    expect(wrong.perfect).toBe(false)
    const notPerfect = await runLadder(
      store,
      VERSE_ID,
      { step: 'typing', event: 'graded', perfect: wrong.perfect },
      at(4),
    )
    expect(notPerfect).toEqual({ kind: 'stay', step: 'typing', reason: 'notPerfect' })
    expect(await store.cards.all()).toHaveLength(0)

    // ── 6. 정확히 입력하면 졸업 + 3방향 카드 생성
    const perfect = gradeTyping(verse.text, verse.text)
    expect(perfect.perfect).toBe(true)
    const graduated = await runLadder(
      store,
      VERSE_ID,
      { step: 'typing', event: 'graded', perfect: perfect.perfect },
      at(5),
    )
    expect(graduated.kind).toBe('graduate')
    expect((await store.learning.get(VERSE_ID))?.step).toBe('graduated')

    const cards = await store.cards.all()
    expect(cards.map((c) => c.direction).sort()).toEqual(['ref', 'text', 'topic'])
    expect(cards.every((c) => c.card.state === State.New)).toBe(true)

    // ── 7. 첫 복습: 어린 카드는 첫글자 모드, 증거는 엿보기 횟수
    let topic = required(await store.cards.get(`${VERSE_ID}:topic`))
    expect(reviewMode(topic.direction, topic.card.reps)).toBe('firstLetter')
    topic = await submitReview(
      store,
      topic,
      { mode: 'firstLetter', rating: ratingFromPeeks(0), accuracy: null, peeks: 0 },
      at(10),
    )
    expect(topic.card.reps).toBe(1)
    expect(await store.reviews.count()).toBe(1)

    // ── 8. Review 상태까지 올린다
    for (let i = 0; i < 3; i++) {
      const mode = reviewMode(topic.direction, topic.card.reps)
      topic = await submitReview(
        store,
        topic,
        {
          mode,
          rating: 3,
          accuracy: mode === 'typing' ? 1 : null,
          peeks: mode === 'firstLetter' ? 0 : null,
        },
        new Date(new Date(topic.card.due).getTime() + 1000),
      )
    }
    expect(topic.card.state).toBe(State.Review)
    const lapsesBefore = topic.card.lapses

    // ── 9. lapse: 타이핑 감사에서 크게 틀리면 Again → 재학습
    const failed = gradeTyping(verse.text, '전혀 다른 문장')
    expect(ratingFromAccuracy(failed)).toBe(1)
    const lapseAt = new Date(new Date(topic.card.due).getTime() + 1000)
    topic = await submitReview(
      store,
      topic,
      {
        mode: 'typing',
        rating: ratingFromAccuracy(failed),
        accuracy: failed.accuracy,
        peeks: null,
      },
      lapseAt,
    )
    expect(topic.card.state).toBe(State.Relearning)
    expect(topic.card.lapses).toBe(lapsesBefore + 1)

    // ── 10. 재학습 카드는 learn-ahead 창에 잡혀 같은 세션에서 다시 나온다
    const ahead = await store.cards.upcomingLearning(LEARN_AHEAD_MS, lapseAt)
    expect(ahead.map((c) => c.key)).toContain(topic.key)

    // ── 11. 재학습을 통과하면 복습 궤도로 복귀한다
    topic = await submitReview(
      store,
      topic,
      { mode: 'typing', rating: 3, accuracy: 1, peeks: null },
      new Date(new Date(topic.card.due).getTime() + 1000),
    )
    expect(topic.card.state).toBe(State.Review)

    // ── 12. 모든 등급에 증거가 남아 있다 (경계 1)
    const reviews = await store.reviews.all()
    expect(reviews).toHaveLength(topic.card.reps)
    expect(reviews.filter((r) => r.mode === 'typing').length).toBeGreaterThan(0)
    for (const r of reviews) {
      expect(r.cardKey).toBe(topic.key)
      expect(r.ts).toBeTruthy()
    }

    // ── 13. export가 전 과정을 담고 왕복한다
    const bundle = await store.exportAll(at(999))
    expect(bundle.cards).toHaveLength(3)
    expect(bundle.reviews).toHaveLength(reviews.length)
    expect(bundle.learning).toEqual([
      { verseId: VERSE_ID, step: 'graduated', updatedAt: at(5).toISOString() },
    ])
  })

  it('말씀→장절 카드는 모든 복습에서 장절 입력으로만 채점된다', async () => {
    await runLadder(store, VERSE_ID, { step: 'typing', event: 'graded', perfect: true }, T0)
    let text: StoredCard = required(await store.cards.get(`${VERSE_ID}:text`))
    const modes: string[] = []
    for (let i = 0; i < 12; i++) {
      const mode = reviewMode(text.direction, text.card.reps)
      modes.push(mode)
      text = await submitReview(
        store,
        text,
        { mode, rating: 3, accuracy: 1, peeks: null },
        new Date(new Date(text.card.due).getTime() + 1000),
      )
    }
    expect(new Set(modes)).toEqual(new Set(['refInput']))
  })

  it('재졸업은 진도를 초기화하지 않는다', async () => {
    await runLadder(store, VERSE_ID, { step: 'typing', event: 'graded', perfect: true }, T0)
    const before = required(await store.cards.get(`${VERSE_ID}:ref`))
    const progressed = await submitReview(
      store,
      before,
      { mode: 'firstLetter', rating: 3, accuracy: null, peeks: 0 },
      at(10),
    )
    // 이미 졸업한 구절을 다시 훈련해 또 졸업시킨다
    expect(await openLadder(store, VERSE_ID)).toBe('typing')
    await runLadder(store, VERSE_ID, { step: 'typing', event: 'graded', perfect: true }, at(20))
    const after = required(await store.cards.get(`${VERSE_ID}:ref`))
    expect(after.card).toStrictEqual(progressed.card)
    expect(await store.reviews.count()).toBe(1)
  })
})
