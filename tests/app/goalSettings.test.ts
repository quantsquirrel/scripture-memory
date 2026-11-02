import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { idbStore } from '../../src/adapters/indexeddb'
import { MemoryStore } from '../../src/adapters/memory'
import { loadHome, loadSettings } from '../../src/app/queries'
import { runLadder } from '../../src/app/review'
import type { Store } from '../../src/ports/repositories'

const NOW = new Date('2026-10-28T10:00:00+09:00')

describe('목표 범위 설정', () => {
  for (const [name, make] of [
    ['memory', () => new MemoryStore()],
    ['indexeddb', () => idbStore],
  ] as const) {
    it(`${name}: 저장한 범위와 목표일이 홈·설정 진도에 함께 반영된다`, async () => {
      const store: Store = make()
      await runLadder(store, 'AS1a', { step: 'typing', event: 'graded', perfect: true }, NOW)
      await store.settings.setGoalDate('2026-12-31')
      await store.settings.setGoalScope('AS')

      const home = await loadHome(store, NOW)
      expect(home.goal.scopeLabel).toBe('5확신')
      expect(home.goal.remaining).toBe(4)
      expect(home.goal.past).toBe(false)
      const settings = await loadSettings(store, NOW)
      expect(settings.goal).toEqual(home.goal)
    })
  }

  it('알 수 없는 범위 값은 기본 범위(DEP242)로 읽는다', async () => {
    const store = new MemoryStore()
    await store.settings.setGoalScope('DEP242')
    expect((await loadHome(store, NOW)).goal.scope).toBe('DEP')
  })
})
