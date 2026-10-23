/**
 * Gist 동기화가 복습·다른 동기화와 엇갈려도 기록과 진도가 살아남는다.
 *
 * scripts/formal/gist-sync/GistSync.tla의 모델 검사가 찾은 반례를 실제 코드로
 * 재생한다. syncNow·submitReview·IndexedDB 어댑터(fake-indexeddb)는 진짜이고,
 * 네트워크만 가짜 Gist로 바꿔 응답을 붙잡았다 풀어 엇갈림의 순서를 정한다.
 * Gist에 무엇이 남았는지는 새 기기가 동기화해 받아 가는 기록으로 본다.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { syncNow } from '../src/adapters/gist'
import { closeConnection, idbStore } from '../src/adapters/indexeddb'
import { MemoryStore } from '../src/adapters/memory'
import { reloadQueuedCard } from '../src/app/queries'
import { submitReview } from '../src/app/review'
import type { ReviewEvidence, StoredCard } from '../src/domain/card'
import { required } from '../src/domain/invariant'
import type { Store } from '../src/ports/repositories'

const KEY = 'AS1a:ref'
const RECITE: ReviewEvidence = { mode: 'recite', rating: 3, accuracy: null, peeks: null }
const T0 = new Date('2026-07-31T01:00:00.000Z')
const at = (minutes: number): string => new Date(T0.getTime() + minutes * 60_000).toISOString()
const atDate = (minutes: number): Date => new Date(at(minutes))

// ---------------------------------------------------------------- 가짜 Gist

type Kind = 'GET' | 'PATCH'
interface Held {
  device: string
  kind: Kind
  release: () => void
}

let gistFiles = new Map<string, string>()
let armed = new Set<string>()
let held: Held[] = []

/** 다음 한 번의 device/kind 요청을 붙잡는다. GET은 도착 시점의 내용으로 답한다. */
const hold = (device: string, kind: Kind): void => {
  armed.add(`${device}:${kind}`)
}

async function fakeFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const device = (new Headers(init?.headers).get('Authorization') ?? '').replace('Bearer ', '')
  const kind: Kind = init?.method === 'PATCH' ? 'PATCH' : 'GET'
  const snapshot = new Map(gistFiles)
  if (armed.delete(`${device}:${kind}`)) {
    await new Promise<void>((release) => held.push({ device, kind, release }))
  }
  if (kind === 'GET') {
    const files = Object.fromEntries(
      [...snapshot].map(([name, content]) => [
        name,
        { content, truncated: false, raw_url: '' },
      ]),
    )
    return Response.json({ files })
  }
  const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
    files: Record<string, { content: string }>
  }
  for (const [name, file] of Object.entries(body.files)) gistFiles.set(name, file.content)
  return Response.json({})
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

async function waitHeld(device: string, kind: Kind): Promise<Held> {
  for (let i = 0; i < 1000; i++) {
    const idx = held.findIndex((h) => h.device === device && h.kind === kind)
    if (idx >= 0) return required(held.splice(idx, 1)[0], '붙잡힌 요청')
    await tick()
  }
  throw new Error(`${device} ${kind} 요청이 오지 않았다`)
}

/** p가 끝나거나, 끝날 수 없는 상태(잠금 대기)로 충분히 돌 때까지 */
async function settle(p: Promise<unknown>): Promise<void> {
  const state = { done: false }
  void p.finally(() => {
    state.done = true
  })
  for (let i = 0; i < 200 && !state.done; i++) await tick()
}

// ---------------------------------------------------------------- 기기

const cfg = (device: string) => ({ token: device, gistId: 'gist' })

async function graduated(store: Store): Promise<StoredCard> {
  await store.graduate('AS1a', ['ref'], T0)
  return required(await store.cards.get(KEY), KEY)
}

const reps = async (store: Store): Promise<number> =>
  required(await store.cards.get(KEY), KEY).card.reps

const reviewTimes = async (store: Store): Promise<string[]> =>
  (await store.reviews.all()).map((r) => r.ts).sort()

/** 처음 동기화하는 새 기기가 Gist에서 받아 가는 복습 기록 */
async function onGist(): Promise<string[]> {
  const fresh = new MemoryStore()
  await syncNow(fresh, cfg('C'))
  return reviewTimes(fresh)
}

beforeEach(async () => {
  gistFiles = new Map()
  armed = new Set()
  held = []
  vi.stubGlobal('fetch', fakeFetch)
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('동기화와 복습이 엇갈릴 때', () => {
  it('Gist 응답을 기다리는 동안 채점한 기록이 지워지지 않는다', async () => {
    const card = await graduated(idbStore)
    hold('A', 'GET')
    const sync = syncNow(idbStore, cfg('A'))
    const get = await waitHeld('A', 'GET')
    await submitReview(idbStore, card, RECITE, atDate(1))
    get.release()
    await sync

    expect(await reviewTimes(idbStore)).toEqual([at(1)])
    expect(await reps(idbStore)).toBe(1)
    await syncNow(idbStore, cfg('A'))
    expect(await onGist()).toEqual([at(1)])
  })

  it('카드 진도는 언제나 저장된 복습 기록으로 뒷받침된다', async () => {
    const card = await graduated(idbStore)
    hold('A', 'GET')
    const sync = syncNow(idbStore, cfg('A'))
    const get = await waitHeld('A', 'GET')
    const afterFirst = await submitReview(idbStore, card, RECITE, atDate(1))
    get.release()
    await sync
    await submitReview(idbStore, afterFirst, RECITE, atDate(2))

    const evidence = (await idbStore.reviews.all()).filter((e) => e.cardKey === KEY)
    expect(await reps(idbStore)).toBeLessThanOrEqual(evidence.length)
  })

  it('복습 화면의 옛 카드 사본으로는 동기화가 가져온 진도를 덮지 못한다', async () => {
    const a = new MemoryStore()
    const first = await submitReview(a, await graduated(a), RECITE, atDate(1))
    await submitReview(a, first, RECITE, atDate(2))
    await syncNow(a, cfg('A'))

    const onScreen = await graduated(idbStore)
    await syncNow(idbStore, cfg('B'))
    await expect(submitReview(idbStore, onScreen, RECITE, atDate(3))).rejects.toMatchObject({
      name: 'StaleCardError',
    })
    expect(await reps(idbStore)).toBe(2)
    expect(await reviewTimes(idbStore)).toEqual([at(1), at(2)])

    // 다시 읽은 카드로는 채점된다
    const fresh = required(await idbStore.cards.get(KEY), KEY)
    await submitReview(idbStore, fresh, RECITE, atDate(3))
    expect(await reps(idbStore)).toBe(3)
  })

  it('거절된 카드는 아직 출제할 때면 새 상태로 다시 읽고, 이미 복습돼 밀려났으면 뺀다', async () => {
    const store = new MemoryStore()
    const card = await graduated(store)
    expect(await reloadQueuedCard(store, KEY, T0)).toEqual(card)

    await submitReview(store, card, { ...RECITE, rating: 4 }, T0)
    expect(await reloadQueuedCard(store, KEY, T0)).toBeNull()
    expect(await reloadQueuedCard(store, 'none:ref', T0)).toBeNull()
  })
})

describe('동기화끼리 엇갈릴 때', () => {
  it('두 기기의 동기화가 겹쳐도 앞 기기의 "완료"된 기록이 Gist에 남는다', async () => {
    const a = new MemoryStore()
    const b = new MemoryStore()
    await submitReview(a, await graduated(a), RECITE, atDate(1))
    await submitReview(b, await graduated(b), RECITE, atDate(2))
    hold('A', 'PATCH')
    hold('B', 'PATCH')
    const syncA = syncNow(a, cfg('A'))
    const patchA = await waitHeld('A', 'PATCH')
    const syncB = syncNow(b, cfg('B'))
    const patchB = await waitHeld('B', 'PATCH')
    patchA.release()
    await syncA
    patchB.release()
    await syncB

    expect(await onGist()).toEqual([at(1), at(2)])
  })

  it('한 기기에서 동기화 두 개가 겹쳐도 진도가 되돌아가지 않는다', async () => {
    const a = new MemoryStore()
    await submitReview(a, await graduated(a), RECITE, atDate(1))
    await graduated(idbStore)
    hold('B', 'GET')
    const first = syncNow(idbStore, cfg('B'))
    const get = await waitHeld('B', 'GET')
    await syncNow(a, cfg('A'))
    const second = syncNow(idbStore, cfg('B'))
    await settle(second)
    get.release()
    await Promise.all([first, second])

    expect(await reps(idbStore)).toBe(1)
    expect(await reviewTimes(idbStore)).toEqual([at(1)])
  })

  it('같은 기기에서 늦게 끝난 동기화가 Gist를 옛 내용으로 덮지 않는다', async () => {
    const card = await graduated(idbStore)
    hold('A', 'PATCH')
    const first = syncNow(idbStore, cfg('A'))
    const patch = await waitHeld('A', 'PATCH')
    await submitReview(idbStore, card, RECITE, atDate(1))
    const second = syncNow(idbStore, cfg('A'))
    await settle(second)
    patch.release()
    await Promise.all([first, second])

    expect(await onGist()).toEqual([at(1)])
  })
})
