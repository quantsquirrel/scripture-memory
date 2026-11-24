/**
 * 복습 화면이 받는 큐(loadReviewQueue·reloadQueuedCard)가 싣는 방식의 차례.
 *
 * 난이도는 첫글자 힌트 < 낭송(자가 채점) < 타이핑 감사다. 어려운 방식 뒤에 쉬운
 * 방식이 오면 안 된다 — 예전 reps 기준 정책은 '다시'와 10분 재도전까지 세어서
 * 졸업 뒤 간격 복습이 첫글자였고, 감사에서 틀린 카드의 재도전과 그다음 간격 복습이
 * 자가 채점 낭송이었다. 여기서는 화면과 같은 길(큐 → 보인 방식 그대로 증거 →
 * submitReview)로 한 카드를 몰아 차례를 확인한다. 메모리·IndexedDB 양쪽에서 같다.
 */
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { idbStore } from '../../src/adapters/indexeddb'
import { MemoryStore } from '../../src/adapters/memory'
import {
  loadReviewQueue,
  modeFor,
  type QueuedCard,
  reloadQueuedCard,
} from '../../src/app/queries'
import { submitReview } from '../../src/app/review'
import {
  cardKey,
  type Rating,
  type ReviewEvidence,
  type ReviewMode,
  type StoredCard,
} from '../../src/domain/card'
import { required } from '../../src/domain/invariant'
import { LEARN_AHEAD_MS } from '../../src/domain/policy'
import { State } from '../../src/domain/scheduler'
import type { Store } from '../../src/ports/repositories'

const V = 'AS1a'
const KEY = cardKey(V, 'topic')
const NOW = new Date('2026-07-31T01:00:00.000Z')
const DAY = 86400_000

/** 화면의 각 방식이 모으는 증거 모양 그대로 */
function evidence(mode: ReviewMode, rating: Rating): ReviewEvidence {
  return {
    mode,
    rating,
    accuracy: mode === 'typing' || mode === 'refInput' ? (rating === 1 ? 0.2 : 1) : null,
    peeks: mode === 'firstLetter' ? (rating === 1 ? 3 : 0) : null,
  }
}

/** 복습 화면이 받는 그 큐에서 이 카드를 꺼낸다 (큐에 없으면 실패) */
async function pick(store: Store, at: Date): Promise<QueuedCard> {
  const queue = await loadReviewQueue(store, () => true, at)
  return required(
    queue.find((q) => q.sc.key === KEY),
    `${at.toISOString()} 큐에 ${KEY}가 없다`,
  )
}

/**
 * 다음 출제 시각: 분 단위 단계는 방금 채점한 직후 — due 전이라 learn-ahead 창이
 * 다시 꺼낸다(같은 세션의 재도전). 간격 복습은 due가 된 날.
 */
function nextAt(sc: StoredCard): Date {
  if (sc.card.state === State.Review) return new Date(sc.card.due)
  return new Date(Date.parse(required(sc.card.last_review, 'last_review')) + 1000)
}

interface Turn {
  mode: ReviewMode
  state: State
  reps: number
  /** 직전 채점에서 이 출제까지의 시간 (첫 출제는 0) */
  gapMs: number
}

/** 등급 순서대로 큐에서 꺼내 채점한다 — 방식은 큐가 정한 것만 쓴다 */
async function walk(store: Store, ratings: readonly Rating[]): Promise<Turn[]> {
  const turns: Turn[] = []
  let at = NOW
  let last = NOW
  for (const rating of ratings) {
    const q = await pick(store, at)
    turns.push({
      mode: q.mode,
      state: q.sc.card.state,
      reps: q.sc.card.reps,
      gapMs: at.getTime() - last.getTime(),
    })
    const rated = await submitReview(store, q.sc, evidence(q.mode, rating), at)
    last = at
    at = nextAt(rated)
  }
  return turns
}

const modes = (turns: Turn[]) => turns.map((t) => t.mode)

const STORES: [string, () => Promise<Store>][] = [
  ['메모리', () => Promise.resolve(new MemoryStore())],
  [
    'IndexedDB',
    async () => {
      await idbStore.reset()
      return idbStore
    },
  ],
]

describe.each(STORES)('복습 큐의 방식 차례 (%s)', (_name, makeStore) => {
  let store: Store
  beforeEach(async () => {
    store = await makeStore()
    // 한 방향만 졸업시켜 큐에 이 카드 하나만 둔다 — due가 비면 learn-ahead가 꺼낸다
    await store.graduate(V, ['topic'], NOW)
  })

  it('전부 좋음: 첫글자(졸업 직후) → 첫글자(10분) → 낭송(2일) → 낭송 → 타이핑(reps 4) → 낭송', async () => {
    const turns = await walk(store, [3, 3, 3, 3, 3, 3])
    expect(modes(turns)).toEqual([
      'firstLetter',
      'firstLetter',
      'recite',
      'recite',
      'typing',
      'recite',
    ])
    expect(turns.map((t) => t.state)).toEqual([
      State.New,
      State.Learning,
      State.Review,
      State.Review,
      State.Review,
      State.Review,
    ])
    // 둘째 첫글자는 같은 세션의 분 단위 재도전, 셋째부터는 날을 넘긴 간격 복습
    expect(required(turns[1]).gapMs).toBeLessThan(LEARN_AHEAD_MS)
    expect(required(turns[2]).gapMs).toBeGreaterThanOrEqual(DAY)
    expect(required(turns[4]).reps).toBe(4)
  })

  it('타이핑 감사에서 다시 → 첫글자 재도전 → 다음 간격 복습은 타이핑 감사 → 통과하면 낭송', async () => {
    const turns = await walk(store, [3, 3, 3, 3, 1, 3, 3, 3])
    expect(modes(turns)).toEqual([
      'firstLetter',
      'firstLetter',
      'recite',
      'recite',
      'typing', // 5회 차례(reps 4)에서 '다시'
      'firstLetter', // 10분 재도전 — 감사를 대신하지 않는다
      'typing', // reps 6: 5회 차례가 아니지만 감사 빚
      'recite',
    ])
    expect(required(turns[5]).state).toBe(State.Relearning)
    expect(required(turns[5]).gapMs).toBeLessThan(LEARN_AHEAD_MS)
    expect(required(turns[6]).reps).toBe(6)
  })

  it('낭송에서 다시 → 첫글자 재도전 → 다음 간격 복습은 타이핑 감사', async () => {
    const turns = await walk(store, [3, 3, 3, 1, 3, 3, 3])
    expect(modes(turns)).toEqual([
      'firstLetter',
      'firstLetter',
      'recite',
      'recite', // reps 3에서 '다시'
      'firstLetter', // 재도전이 방금 본 정답으로 감사 차례를 써 버리지 않는다
      'typing', // reps 5: 감사 빚
      'recite',
    ])
    expect(required(turns[5]).reps).toBe(5)
  })

  it('감사를 다시 틀리면 통과할 때까지 간격 복습마다 타이핑 감사', async () => {
    const turns = await walk(store, [3, 3, 3, 1, 3, 1, 3, 1, 3, 3, 3])
    expect(modes(turns)).toEqual([
      'firstLetter',
      'firstLetter',
      'recite',
      'recite', // '다시' → 빚
      'firstLetter',
      'typing', // reps 5 감사 '다시' → 빚 그대로
      'firstLetter',
      'typing', // reps 7 감사 '다시' → 빚 그대로
      'firstLetter',
      'typing', // reps 9 감사 통과 → 빚 갚음
      'recite',
    ])
    // 감사는 Review 상태에서만, 첫글자는 분 단위 단계에서만 나왔다
    for (const t of turns) {
      if (t.mode === 'firstLetter') expect(t.state).not.toBe(State.Review)
      else expect(t.state).toBe(State.Review)
    }
  })

  it('첫글자 재도전에서 받은 다시는 빚을 만들지 않는다', async () => {
    const turns = await walk(store, [1, 3, 3, 3])
    expect(modes(turns)).toEqual(['firstLetter', 'firstLetter', 'firstLetter', 'recite'])
    expect(required(turns[3]).state).toBe(State.Review)
    expect(required(turns[3]).reps).toBe(3)
  })

  it('다른 탭이 먼저 다시를 매기면, 다시 읽은 카드는 새 상태·새 기록으로 방식을 다시 정한다', async () => {
    // 간격 복습 낭송 차례까지 올려 둔다
    await walk(store, [3, 3, 3])
    const onScreen = await pick(store, nextAt(required(await store.cards.get(KEY))))
    expect(onScreen.mode).toBe('recite')
    const at = new Date(onScreen.sc.card.due)

    // 다른 탭이 같은 카드를 낭송 '다시'로 채점했다
    await submitReview(store, onScreen.sc, evidence('recite', 1), at)
    await expect(
      submitReview(store, onScreen.sc, evidence('recite', 3), at),
    ).rejects.toMatchObject({ name: 'StaleCardError' })

    // 재학습 단계로 바뀌어 첫글자 재도전으로 다시 출제된다
    const reloaded = required(await reloadQueuedCard(store, KEY, at))
    expect(reloaded.mode).toBe('firstLetter')
    const back = await submitReview(store, reloaded.sc, evidence(reloaded.mode, 3), at)
    expect(back.card.state).toBe(State.Review)
    // 다른 탭이 남긴 '다시'가 빚이 되어 다음 간격 복습은 타이핑 감사다
    expect((await pick(store, nextAt(back))).mode).toBe('typing')
  })

  it('재출제(reloadQueuedCard)도 그 카드의 기록으로 감사 빚을 본다', async () => {
    // 화면이 간격 복습 낭송 차례 사본을 들고 있는 동안
    await walk(store, [3, 3, 3])
    const onScreen = await pick(store, nextAt(required(await store.cards.get(KEY))))
    expect(onScreen.mode).toBe('recite')

    // 다른 기기가 낭송 '다시' → 첫글자 재도전 통과까지 마쳐 Review 상태로 돌려놨다
    const at = new Date(onScreen.sc.card.due)
    const relearning = await submitReview(store, onScreen.sc, evidence('recite', 1), at)
    const synced = await submitReview(store, relearning, evidence('firstLetter', 3), at)
    expect(synced.card.state).toBe(State.Review)
    expect(synced.card.reps).toBe(5) // 5회 차례가 아니다

    // 그 카드가 기한이 된 뒤 옛 사본으로 채점하면 거절되고, 다시 읽은 카드는 빚 때문에 감사다
    const due = new Date(synced.card.due)
    await expect(
      submitReview(store, onScreen.sc, evidence('recite', 3), due),
    ).rejects.toMatchObject({ name: 'StaleCardError' })
    const reloaded = required(await reloadQueuedCard(store, KEY, due))
    expect(reloaded).toEqual({ sc: synced, mode: 'typing' })
  })
})

/** 정책이 정한 방식으로 한 번 채점한다 (새 카드는 졸업 시각, 그 뒤로는 due에) */
async function rateAsPolicy(store: Store, sc: StoredCard, rating: Rating): Promise<StoredCard> {
  const at = sc.card.last_review === undefined ? NOW : new Date(sc.card.due)
  return submitReview(store, sc, evidence(await modeFor(store, sc), rating), at)
}

describe('modeFor — 감사 빚을 볼 때만 기록을 읽는다', () => {
  it('분 단위 단계·5회 감사 차례·말씀→장절은 기록을 읽지 않고, 낭송 차례만 그 카드 기록을 읽는다', async () => {
    const store = new MemoryStore()
    await store.graduate(V, ['topic', 'text'], NOW)
    const ofCard = vi.spyOn(store.reviews, 'ofCard')

    // 새 카드(첫글자)와 말씀→장절(장절 입력)
    let topic = required(await store.cards.get(KEY))
    expect(await modeFor(store, topic)).toBe('firstLetter')
    expect(await modeFor(store, required(await store.cards.get(cardKey(V, 'text'))))).toBe(
      'refInput',
    )
    expect(ofCard).not.toHaveBeenCalled()

    // 간격 복습 낭송 차례(reps 2·3)에서만 읽는다 — 이 카드 키로
    topic = await rateAsPolicy(store, topic, 3)
    topic = await rateAsPolicy(store, topic, 3)
    expect(topic.card.state).toBe(State.Review)
    ofCard.mockClear()
    expect(await modeFor(store, topic)).toBe('recite')
    expect(ofCard.mock.calls).toEqual([[KEY]])

    // 5회 감사 차례(reps 4)는 기록과 무관하게 감사 — 읽지 않는다
    topic = await rateAsPolicy(store, topic, 3)
    topic = await rateAsPolicy(store, topic, 3)
    expect(topic.card.reps).toBe(4)
    ofCard.mockClear()
    expect(await modeFor(store, topic)).toBe('typing')
    expect(ofCard).not.toHaveBeenCalled()
  })

  it('다른 카드의 기록은 빚이 되지 않는다', async () => {
    const store = new MemoryStore()
    await store.graduate(V, ['topic', 'ref'], NOW)
    let topic = required(await store.cards.get(KEY))
    let ref = required(await store.cards.get(cardKey(V, 'ref')))
    for (let i = 0; i < 3; i++) {
      topic = await rateAsPolicy(store, topic, 3)
      ref = await rateAsPolicy(store, ref, 3)
    }
    // ref만 낭송 '다시' → 재도전 통과 → ref만 감사 빚
    expect(await modeFor(store, ref)).toBe('recite')
    ref = await rateAsPolicy(store, ref, 1)
    ref = await rateAsPolicy(store, ref, 3)
    expect(await modeFor(store, ref)).toBe('typing')
    expect(await modeFor(store, topic)).toBe('recite')
  })
})
