import { describe, expect, it } from 'vitest'

import { MemoryStore } from '../../src/adapters/memory'
import { loadHome } from '../../src/app/queries'
import { runLadder } from '../../src/app/review'
import { VERSES } from '../../src/data/verses'
import { pickNextVerse } from '../../src/domain/nextVerse'

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
