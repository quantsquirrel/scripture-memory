// 사용자 보고(2026-11-06): 기기 연동을 해도 암송 목표(목표일·범위)가 넘어오지 않았다.
// 목표가 settings에만 있고 export 번들에 들어가지 않았기 때문이다.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeBundle } from '../../src/adapters/bundle'
import { mergeBundles } from '../../src/adapters/gist'
import { GOAL_KEYS, mergeGoalPrefs } from '../../src/adapters/goalPrefs'
import { idbStore, openTmsDb } from '../../src/adapters/indexeddb'
import { MemoryStore } from '../../src/adapters/memory'
import { createPairing, receivePairing } from '../../src/adapters/pairing'
import { loadSettings } from '../../src/app/queries'
import type { ExportBundle, GoalPrefs, Store } from '../../src/ports/repositories'
import relayWorker from '../../worker/pairing-relay'
import fixtureV2 from '../fixtures/export-v2.json'
import fixtureV2Goal from '../fixtures/export-v2-goal.json'

const RELAY = 'https://relay.test'

/** worker/pairing-relay.ts를 그대로 돌리는 가짜 릴레이 */
function fakeRelay(): void {
  const kv = new Map<string, string>()
  const env = {
    ALLOWED_ORIGINS: 'https://app.test',
    PAIRING: {
      get: (k: string) => Promise.resolve(kv.get(k) ?? null),
      put: (k: string, v: string) => {
        kv.set(k, v)
        return Promise.resolve()
      },
      delete: (k: string) => {
        kv.delete(k)
        return Promise.resolve()
      },
    },
  }
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    relayWorker.fetch(new Request(input, init), env),
  )
}

const goalOf = async (store: Store) => (await loadSettings(store)).goal

async function setGoal(store: Store, at: string, date: string, scope: string): Promise<void> {
  vi.setSystemTime(new Date(at))
  await store.settings.setGoalDate(date)
  await store.settings.setGoalScope(scope)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await idbStore.reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('기기 연동으로 암송 목표가 넘어온다', () => {
  it('목표를 정한 폰 → 처음 쓰는 노트북: 목표일·범위가 그대로 온다', async () => {
    fakeRelay()
    const phone = new MemoryStore()
    await setGoal(phone, '2026-11-01T09:00:00Z', '2027-03-01', 'TMS180')
    const before = await goalOf(phone)

    const { code } = await createPairing(phone, RELAY)
    await receivePairing(idbStore, RELAY, code)

    const after = await goalOf(idbStore)
    expect(after.goalDate).toBe('2027-03-01')
    expect(after.scope).toBe('TMS180')
    expect(after).toEqual(before)
  })

  for (const [name, make] of [
    ['memory', () => new MemoryStore()],
    ['indexeddb', () => idbStore],
  ] as const) {
    it(`${name}: 받는 쪽이 더 나중에 바꾼 목표는 지키고, 보내는 쪽은 바뀌지 않는다`, async () => {
      fakeRelay()
      const phone = new MemoryStore()
      await setGoal(phone, '2026-11-01T09:00:00Z', '2027-03-01', 'TMS180')
      const laptop = make()
      await setGoal(laptop, '2026-11-05T09:00:00Z', '2026-12-24', 'TMS60')

      const { code } = await createPairing(phone, RELAY)
      await receivePairing(laptop, RELAY, code)

      expect((await goalOf(laptop)).goalDate).toBe('2026-12-24')
      expect((await goalOf(laptop)).scope).toBe('TMS60')
      expect((await goalOf(phone)).goalDate).toBe('2027-03-01')
    })

    it(`${name}: 목표를 통째로 옮긴다 — 받은 목표에 없는 필드는 지운다`, async () => {
      const laptop = make()
      await setGoal(laptop, '2026-11-01T09:00:00Z', '2026-12-24', 'TMS60')
      await laptop.settings.setGoalBufferDays(30)
      const remote: GoalPrefs = { scope: 'DEP', updatedAt: '2026-11-06T00:00:00.000Z' }

      await laptop.mergeAll((local) => mergeBundles(local, { ...empty(), goal: remote }))

      const g = await goalOf(laptop)
      expect(g.scope).toBe('DEP')
      // 목표일·여유일은 받은 목표에 없으므로 기본값 — 이전 목표일과 새 범위가 섞이지 않는다
      expect(await laptop.settings.goalDate()).toBeUndefined()
      expect(await laptop.settings.goalBufferDays()).toBeUndefined()
      expect((await laptop.exportAll()).goal).toEqual(remote)
    })

    it(`${name}: 목표가 없는 이전 버전 번들을 받으면 이 기기 목표를 그대로 둔다`, async () => {
      const laptop = make()
      await setGoal(laptop, '2026-11-01T09:00:00Z', '2026-12-24', 'TMS60')
      const before = (await laptop.exportAll()).goal

      await laptop.mergeAll((local) => mergeBundles(local, decodeBundle(fixtureV2)))
      expect((await laptop.exportAll()).goal).toEqual(before)

      await laptop.importAll(fixtureV2)
      expect((await laptop.exportAll()).goal).toEqual(before)
    })
  }

  it('이 기능 이전에 정한 목표(시각 없음)도 보낸다 — 둘 다 시각이 없으면 보낸 쪽 목표', async () => {
    // 업데이트 전 기기의 저장 상태를 그대로 흉내낸다: 값만 있고 goalUpdatedAt이 없다
    const db = await openTmsDb()
    await db.put('settings', { key: GOAL_KEYS.date, value: '2027-01-31' })
    await db.put('settings', { key: GOAL_KEYS.scope, value: 'TMS180' })
    const legacy = await idbStore.exportAll()
    expect(legacy.goal).toEqual({
      date: '2027-01-31',
      scope: 'TMS180',
      updatedAt: new Date(0).toISOString(),
    })

    const laptop = new MemoryStore()
    await laptop.mergeAll((local) => mergeBundles(local, legacy))
    expect((await goalOf(laptop)).goalDate).toBe('2027-01-31')
    expect((await goalOf(laptop)).scope).toBe('TMS180')
  })

  it('목표를 한 번도 정하지 않은 기기는 번들에 goal을 넣지 않는다', async () => {
    expect('goal' in (await new MemoryStore().exportAll())).toBe(false)
    expect('goal' in (await idbStore.exportAll())).toBe(false)
  })
})

describe('목표 병합 규칙', () => {
  const g = (updatedAt: string, scope: string): GoalPrefs => ({ scope, updatedAt })

  it('나중에 바꾼 쪽이 이기고, 같으면 받은 쪽(b)', () => {
    expect(mergeGoalPrefs(g('2026-11-02', 'A'), g('2026-11-01', 'B'))?.scope).toBe('A')
    expect(mergeGoalPrefs(g('2026-11-01', 'A'), g('2026-11-02', 'B'))?.scope).toBe('B')
    expect(mergeGoalPrefs(g('2026-11-01', 'A'), g('2026-11-01', 'B'))?.scope).toBe('B')
    expect(mergeGoalPrefs(undefined, g('2026-11-01', 'B'))?.scope).toBe('B')
    expect(mergeGoalPrefs(g('2026-11-01', 'A'), undefined)?.scope).toBe('A')
    expect(mergeGoalPrefs(undefined, undefined)).toBeUndefined()
  })
})

describe('번들의 goal 필드', () => {
  it('목표가 든 v2 번들(골든 fixture)을 가져오면 목표가 되살아나고, 다시 내보내도 같다', async () => {
    await idbStore.importAll(fixtureV2Goal)
    const g = await goalOf(idbStore)
    expect(g.goalDate).toBe('2027-02-28')
    expect(g.bufferDays).toBe(21)
    expect(g.scope).toBe('TMS180')
    expect((await idbStore.exportAll()).goal).toEqual(fixtureV2Goal.goal)
  })

  it('형식이 틀린 goal은 백업 전체를 거부한다 (저장소를 비우기 전에)', () => {
    const bad = (goal: unknown) => ({ ...fixtureV2, goal })
    expect(() => decodeBundle(bad({ date: '2027/02/28', updatedAt: '2026-11-01' }))).toThrow(
      /goal.date/,
    )
    expect(() => decodeBundle(bad({ bufferDays: 1.5, updatedAt: '2026-11-01' }))).toThrow(
      /goal.bufferDays/,
    )
    expect(() => decodeBundle(bad({ scope: 3, updatedAt: '2026-11-01' }))).toThrow(/goal.scope/)
    expect(() => decodeBundle(bad({ scope: 'DEP' }))).toThrow(/goal.updatedAt/)
    expect(() => decodeBundle(bad('DEP'))).toThrow(/goal/)
  })

  it('모르는 범위 값은 받아 두되 기본 범위로 읽는다 (다음 버전이 과정을 늘려도 백업이 깨지지 않게)', async () => {
    await idbStore.importAll({
      ...fixtureV2,
      goal: { scope: 'FUTURE', updatedAt: '2026-11-01T00:00:00.000Z' },
    })
    expect((await goalOf(idbStore)).scope).toBe('DEP')
  })
})

function empty(): ExportBundle {
  return {
    app: 'scripture-memory',
    version: 2,
    exportedAt: new Date(0).toISOString(),
    cards: [],
    reviews: [],
    learning: [],
  }
}
