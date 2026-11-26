import { describe, expect, it } from 'vitest'

import { MemoryStore } from '../../src/adapters/memory'
import { loadHome } from '../../src/app/queries'
import { recalibrateVerse } from '../../src/app/recalibrate'
import { runLadder } from '../../src/app/review'
import { collectionOf, VERSES } from '../../src/data/verses'
import { nextAfterGraduation, pickNextVerse } from '../../src/domain/nextVerse'

const graduate = (store: MemoryStore, verseId: string, now: Date) =>
  runLadder(store, verseId, { step: 'typing', event: 'graded', perfect: true }, now)

/**
 * 사용자 보고(2026-11-06): 5확신을 끝내고 목록에서 DEP 첫 구절을 골라 졸업한 뒤
 * '다음 구절'을 누르면 8동행 첫 구절로 돌아갔다. DEP 다음 구절이어야 한다.
 */
describe('다음 구절은 마지막으로 공부한 자리를 이어 간다', () => {
  it('5확신 → (목록에서) DEP 1-1a 졸업 → 다음은 DEP 1-1b', async () => {
    const store = new MemoryStore()
    let t = Date.parse('2026-11-06T09:00:00+09:00')
    for (const id of ['AS1a', 'AS2a', 'AS3a', 'AS4a', 'AS5a', 'D1-1a']) {
      await graduate(store, id, new Date((t += 60_000)))
    }

    // 홈의 '다음 구절'
    const home = await loadHome(store, new Date(t + 60_000))
    expect(home.nextNewId).toBe('D1-1b')

    // 졸업 화면의 '다음 구절' (Learn.tsx와 같은 호출)
    const order = VERSES.map((v) => v.id)
    expect(pickNextVerse(order, home.graduatedIds, 'D1-1a')).toBe('D1-1b')
  })

  it('진행 중인 구절은 이어 하기가 맡으므로 다음 새 구절에서 뺀다', async () => {
    const store = new MemoryStore()
    const now = new Date('2026-11-06T09:00:00+09:00')
    await graduate(store, 'D1-1a', now)
    await runLadder(store, 'D1-1b', { step: 'intro', event: 'recited' }, now)
    const home = await loadHome(store, now)
    expect(home.inProgress?.verseId).toBe('D1-1b')
    expect(home.nextNewId).toBe(VERSES[VERSES.findIndex((v) => v.id === 'D1-1b') + 1]?.id)
  })

  it('처음 쓰는 사람은 여전히 5확신 첫 구절부터', async () => {
    expect((await loadHome(new MemoryStore())).nextNewId).toBe('AS1a')
  })
})

/**
 * 사용자 보고(2026-11-26): 말씀 상태 개정에서 한 단원을 '잊음'으로 강등하면, 강등한 구절
 * 하나만 '이어서'에 뜨고 나머지 강등 구절이 '다음 구절'(새 구절)로 함께 떴다.
 */
describe('강등한 구절이 여럿이면 전부 이어 하기가 맡는다', () => {
  const order = VERSES.map((v) => v.id)
  const firstLV = VERSES.find((v) => collectionOf(v).key === 'LV')?.id

  async function demotedThree(): Promise<{ store: MemoryStore; at: Date }> {
    const store = new MemoryStore()
    let t = Date.parse('2026-11-20T09:00:00+09:00')
    for (const id of ['AS1a', 'AS2a', 'AS3a', 'AS4a', 'AS5a']) {
      await graduate(store, id, new Date((t += 60_000)))
    }
    // 5확신 뒤쪽 세 구절을 '잊음'으로 — 사다리 첫글자 단계로 내려간다
    for (const id of ['AS3a', 'AS4a', 'AS5a']) {
      await recalibrateVerse(store, id, 'forgotten', new Date((t += 60_000)))
    }
    return { store, at: new Date(t + 60_000) }
  }

  it('홈: 다음 구절은 사다리에 오른 적 없는 구절, 이어서는 학습 순서 첫 강등 구절과 남은 수', async () => {
    const { store, at } = await demotedThree()
    const home = await loadHome(store, at)
    expect(home.inProgress?.verseId).toBe('AS3a')
    expect(home.inProgressCount).toBe(3)
    // 기준 구절은 여전히 마지막 졸업 구절(AS2a) — 그 뒤의 강등 구절을 건너뛰고 8동행 첫 구절로
    expect(home.nextNewId).toBe(firstLV)
  })

  it('홈: 이어서는 시작한 순서가 아니라 학습 순서상 첫 진행 중 구절', async () => {
    const store = new MemoryStore()
    const t = Date.parse('2026-11-20T09:00:00+09:00')
    // DEP 구절을 먼저 시작하고, 그 뒤에 5확신 구절을 졸업했다가 강등한다
    await runLadder(store, 'D1-1b', { step: 'intro', event: 'recited' }, new Date(t))
    await graduate(store, 'AS1a', new Date(t + 60_000))
    await recalibrateVerse(store, 'AS1a', 'forgotten', new Date(t + 120_000))
    const home = await loadHome(store, new Date(t + 180_000))
    expect(home.inProgress?.verseId).toBe('AS1a')
    expect(home.inProgressCount).toBe(2)
    expect(home.nextNewId).not.toBe('D1-1b')
  })

  it('졸업 화면: 강등 구절이 남았으면 방금 졸업한 구절 뒤의 강등 구절을 이어서, 다 끝나면 새 구절', async () => {
    const { store, at } = await demotedThree()
    let t = at.getTime()
    // 학습 화면 졸업 뒤의 대상 (Learn.tsx와 같은 호출)
    const afterGraduating = async (id: string) => {
      await graduate(store, id, new Date((t += 60_000)))
      return nextAfterGraduation(order, await store.learning.all(), id)
    }
    expect(await afterGraduating('AS4a')).toEqual({ kind: 'resume', verseId: 'AS5a' })
    // 뒤쪽이 다 끝났으면 한 바퀴 돌아 앞쪽 강등 구절로
    expect(await afterGraduating('AS5a')).toEqual({ kind: 'resume', verseId: 'AS3a' })
    expect(await afterGraduating('AS3a')).toEqual({ kind: 'next', verseId: firstLV })
  })
})
