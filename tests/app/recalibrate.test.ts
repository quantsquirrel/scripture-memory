import 'fake-indexeddb/auto'

import { State } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'

import { idbStore } from '../../src/adapters/indexeddb'
import { MemoryStore } from '../../src/adapters/memory'
import { loadRecalibrateUnits, recalibrateVerse } from '../../src/app/recalibrate'
import { runLadder, submitReview } from '../../src/app/review'
import { getRevision } from '../../src/app/revision'
import { cardKey, DIRECTIONS, type StoredCard } from '../../src/domain/card'
import { required } from '../../src/domain/invariant'
import { reviewMode } from '../../src/domain/policy'
import type { Store } from '../../src/ports/repositories'

const NOW = new Date('2026-10-27T10:00:00.000Z')
const DAY = 86400_000
const V = 'AS1a'

const graduate = (store: Store, verseId = V, now = NOW) =>
  runLadder(store, verseId, { step: 'typing', event: 'graded', perfect: true }, now)

const cardOf = async (store: Store, dir: StoredCard['direction']) =>
  required(await store.cards.get(cardKey(V, dir)))

/** 정책이 정한 모드와 그 모드의 증거로 reps가 target이 될 때까지 복습한다 */
async function reviewUntil(store: Store, target: number): Promise<Date> {
  let at = NOW
  for (const dir of DIRECTIONS) {
    let card = await cardOf(store, dir)
    while (card.card.reps < target) {
      at = new Date(Math.max(at.getTime(), new Date(card.card.due).getTime()) + 60_000)
      const mode = reviewMode(dir, card.card.reps)
      card = await submitReview(
        store,
        card,
        {
          mode,
          rating: 3,
          accuracy: mode === 'typing' || mode === 'refInput' ? 1 : null,
          peeks: mode === 'firstLetter' ? 0 : null,
        },
        at,
      )
    }
  }
  return at
}

/** 오래 쉰 상황: 마지막 복습으로부터 한참 지난 시각 */
const later = (at: Date) => new Date(at.getTime() + 400 * DAY)

describe('recalibrateVerse — solid', () => {
  it('낭송 차례 카드에 recite·좋음을 증거와 함께 매기고 due를 미래로 보낸다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const now = later(await reviewUntil(store, 3))
    const before = await store.reviews.count()

    const r = await recalibrateVerse(store, V, 'solid', now)

    // topic·ref는 reps 3이 낭송 차례, text는 언제나 장절 입력(객관 채점)
    expect(r).toEqual({ rated: 2, deferred: 1, demoted: false })
    const added = (await store.reviews.all()).slice(before)
    expect(added.map((e) => [e.direction, e.mode, e.rating, e.accuracy, e.peeks])).toEqual([
      ['topic', 'recite', 3, null, null],
      ['ref', 'recite', 3, null, null],
    ])
    for (const dir of ['topic', 'ref'] as const) {
      const c = await cardOf(store, dir)
      expect(c.card.reps).toBe(4)
      expect(c.card.due > now.toISOString()).toBe(true)
    }
    // 말씀→장절 카드는 그대로 밀려 있다 — 복습 탭에서 장절 입력으로 채점받는다
    const text = await cardOf(store, 'text')
    expect(text.card.reps).toBe(3)
    expect(text.card.due <= now.toISOString()).toBe(true)
  })
})

describe('recalibrateVerse — shaky', () => {
  it('낭송 차례 카드에 다시(1)를 매겨 재학습 단계로 보내고 며칠 안에 돌아오게 한다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const now = later(await reviewUntil(store, 3))

    const r = await recalibrateVerse(store, V, 'shaky', now)

    expect(r).toEqual({ rated: 2, deferred: 1, demoted: false })
    for (const dir of ['topic', 'ref'] as const) {
      const c = await cardOf(store, dir)
      expect(c.card.state).toBe(State.Relearning)
      expect(c.card.lapses).toBe(1)
      expect(new Date(c.card.due).getTime() - now.getTime()).toBeLessThanOrEqual(3 * DAY)
    }
    const added = (await store.reviews.all()).filter((e) => e.ts === now.toISOString())
    expect(added.map((e) => [e.mode, e.rating])).toEqual([
      ['recite', 1],
      ['recite', 1],
    ])
  })
})

describe('recalibrateVerse — forgotten', () => {
  it('3방향 카드를 지우고 첫글자 단계로 강등한다 (복습 기록은 남긴다)', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const now = later(await reviewUntil(store, 3))
    const reviews = await store.reviews.count()

    const r = await recalibrateVerse(store, V, 'forgotten', now)

    expect(r).toEqual({ rated: 0, deferred: 0, demoted: true })
    expect(await store.cards.all()).toEqual([])
    expect(await store.learning.get(V)).toEqual({
      verseId: V,
      step: 'firstLetter',
      updatedAt: now.toISOString(),
    })
    // 강등은 등급이 아니다 — 증거를 새로 쓰지도, 과거 증거를 지우지도 않는다
    expect(await store.reviews.count()).toBe(reviews)
  })

  it('사다리를 재통과하면 새 카드가 깨끗하게 다시 발행된다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const now = later(await reviewUntil(store, 3))
    await recalibrateVerse(store, V, 'forgotten', now)

    const again = new Date(now.getTime() + DAY)
    await runLadder(store, V, { step: 'firstLetter', event: 'attempted', peeks: 0 }, again)
    await graduate(store, V, again)

    for (const dir of DIRECTIONS) {
      const c = await cardOf(store, dir)
      expect(c.card.reps).toBe(0)
      expect(c.card.state).toBe(State.New)
      expect(c.card.due).toBe(again.toISOString())
    }
    expect((await store.learning.get(V))?.step).toBe('graduated')
  })
})

describe('recalibrateVerse — 경계', () => {
  it('정책이 타이핑 감사를 요구하는 회차는 자가 판정으로 넘기지 않는다 (경계 2)', async () => {
    const store = new MemoryStore()
    await graduate(store)
    // reps 4 → (4 + 1) % 5 === 0 이므로 topic·ref 모두 타이핑 감사 차례
    const now = later(await reviewUntil(store, 4))
    for (const dir of DIRECTIONS) {
      expect(reviewMode(dir, (await cardOf(store, dir)).card.reps)).not.toBe('recite')
    }
    const before = await store.reviews.count()

    for (const verdict of ['solid', 'shaky'] as const) {
      const r = await recalibrateVerse(store, V, verdict, now)
      expect(r).toEqual({ rated: 0, deferred: 3, demoted: false })
    }
    expect(await store.reviews.count()).toBe(before)
  })

  it('갓 졸업한 카드(첫글자 훈련 차례)도 자가 판정하지 않는다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const r = await recalibrateVerse(store, V, 'solid', later(NOW))
    expect(r).toEqual({ rated: 0, deferred: 3, demoted: false })
    expect(await store.reviews.count()).toBe(0)
  })

  it('반복해서 개정해도 등급 수와 증거 수가 같고, 5회 창마다 객관 모드가 낀다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    let at = await reviewUntil(store, 3)
    for (let i = 0; i < 20; i++) {
      at = later(at)
      await recalibrateVerse(store, V, 'solid', at)
      // 개정이 남긴 객관 차례는 복습 탭이 처리한다 — 같은 정책으로 흉내낸다
      for (const dir of DIRECTIONS) {
        const card = await cardOf(store, dir)
        const mode = reviewMode(dir, card.card.reps)
        if (mode === 'recite') continue
        await submitReview(
          store,
          card,
          {
            mode,
            rating: 3,
            accuracy: mode === 'firstLetter' ? null : 1,
            peeks: mode === 'firstLetter' ? 0 : null,
          },
          new Date(at.getTime() + 60_000),
        )
      }
    }
    const reviews = await store.reviews.all()
    for (const dir of DIRECTIONS) {
      const card = await cardOf(store, dir)
      const mine = reviews.filter((e) => e.direction === dir)
      expect(mine).toHaveLength(card.card.reps)
      const modes = mine.map((e) => e.mode)
      for (let i = 0; i + 5 <= modes.length; i++) {
        expect(
          modes.slice(i, i + 5).some((m) => m !== 'recite'),
          `${dir} 구간 ${i}`,
        ).toBe(true)
      }
      if (dir === 'text') expect(new Set(modes)).toEqual(new Set(['refInput']))
    }
  })

  it('졸업 전 구절은 어떤 판정에도 바뀌지 않는다', async () => {
    const store = new MemoryStore()
    await runLadder(store, V, { step: 'intro', event: 'recited' }, NOW)
    for (const verdict of ['solid', 'shaky', 'forgotten'] as const) {
      expect(await recalibrateVerse(store, V, verdict, NOW)).toEqual({
        rated: 0,
        deferred: 0,
        demoted: false,
      })
    }
    expect((await store.learning.get(V))?.step).toBe('firstLetter')
    expect(await store.cards.all()).toEqual([])
  })

  it('판정이 끝나면 리비전을 올려 구독 중인 뷰가 다시 읽게 한다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const before = getRevision()
    await recalibrateVerse(store, V, 'forgotten', NOW)
    expect(getRevision()).toBe(before + 1)
  })
})

describe('IndexedDB 어댑터 — demoteToLadder', () => {
  it('해당 구절 카드만 지우고 진행 상태를 같은 트랜잭션으로 바꾼다', async () => {
    await idbStore.reset()
    await graduate(idbStore)
    await graduate(idbStore, 'AS2a')
    await submitReview(
      idbStore,
      required(await idbStore.cards.get(cardKey(V, 'topic'))),
      { mode: 'firstLetter', rating: 3, accuracy: null, peeks: 0 },
      NOW,
    )

    await idbStore.demoteToLadder(V, 'firstLetter', NOW)

    expect((await idbStore.cards.all()).map((c) => c.key).sort()).toEqual(
      DIRECTIONS.map((d) => cardKey('AS2a', d)).sort(),
    )
    expect(await idbStore.learning.get(V)).toEqual({
      verseId: V,
      step: 'firstLetter',
      updatedAt: NOW.toISOString(),
    })
    expect((await idbStore.learning.get('AS2a'))?.step).toBe('graduated')
    expect(await idbStore.reviews.count()).toBe(1)
  })
})

describe('loadRecalibrateUnits', () => {
  it('5확신·8동행·60구절 A~E·DEP 1~8 단위로, 졸업한 구절과 밀린 카드만 센다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    await graduate(store, 'AS2a', new Date(NOW.getTime() + 10 * DAY))

    const units = await loadRecalibrateUnits(store, new Date(NOW.getTime() + DAY))

    expect(units.map((u) => u.key)).toEqual([
      'AS',
      'LV',
      'A',
      'B',
      'C',
      'D',
      'E',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'D8',
    ])
    const as = required(units[0])
    expect(as.verseIds).toEqual(['AS1a', 'AS2a'])
    expect(as.due).toBe(3)
    expect(units.slice(1).every((u) => u.verseIds.length === 0 && u.due === 0)).toBe(true)
  })
})
