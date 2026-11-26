import { describe, expect, it } from 'vitest'

import { MemoryStore } from '../../src/adapters/memory'
import { loadHome, loadSettings, modeFor } from '../../src/app/queries'
import { recalibrateVerse } from '../../src/app/recalibrate'
import { runLadder, submitReview } from '../../src/app/review'
import { cardKey, DIRECTIONS } from '../../src/domain/card'
import { required } from '../../src/domain/invariant'
import type { Store } from '../../src/ports/repositories'

const DAY = 86400_000
const NOW = new Date('2026-11-26T15:00:00+09:00')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

const graduate = (store: Store, verseId: string, at: Date) =>
  runLadder(store, verseId, { step: 'typing', event: 'graded', perfect: true }, at)

/** 구절 카드 3장을 정책이 정한 방식과 그 증거로 한 번씩 복습한다 */
async function reviewOnce(store: Store, verseId: string, at: Date): Promise<void> {
  for (const dir of DIRECTIONS) {
    const card = required(await store.cards.get(cardKey(verseId, dir)))
    const mode = await modeFor(store, card)
    await submitReview(
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

/** 졸업 → 복습 → 말씀 상태 개정 '잊음'(강등) → 다시 졸업 */
async function regraduate(
  store: Store,
  verseId: string,
  days: { graduated: number; reviewed?: number; demoted: number; regraduated: number },
): Promise<void> {
  await graduate(store, verseId, ago(days.graduated))
  if (days.reviewed !== undefined) await reviewOnce(store, verseId, ago(days.reviewed))
  await recalibrateVerse(store, verseId, 'forgotten', ago(days.demoted))
  await graduate(store, verseId, ago(days.regraduated))
}

/**
 * 사용자 보고(2026-11-26): 말씀 상태 개정에서 '잊음'으로 강등한 구절을 다시 졸업하면
 * 졸업 시각이 새로 찍혀 '이번 주 새 구절'과 목표 페이싱에 새 구절로 세졌다.
 */
describe('다시 졸업한 구절은 새 구절로 세지 않는다', () => {
  it('오래전에 졸업·복습한 구절을 강등했다가 오늘 다시 졸업 — 이번 주·오늘·최근 페이스에서 뺀다', async () => {
    const store = new MemoryStore()
    await regraduate(store, 'AS2a', { graduated: 40, reviewed: 39, demoted: 2, regraduated: 0 })
    // 비교 대상: 오늘 처음 졸업한 새 구절 하나
    await graduate(store, 'AS1a', NOW)

    const home = await loadHome(store, NOW)
    expect(home.newThisWeek).toBe(1)
    expect(home.goal.todayNew).toBe(1)
    expect(home.goal.recentPace).toBeCloseTo(1 / 7)
    // 남은 수는 졸업 여부로 센다 — 다시 졸업했으니 남은 구절이 아니다
    expect(home.goal.remaining).toBe(home.goal.total - 2)
    // 어제 이전에 강등된 구절은 오늘 아침엔 남은 구절이었다
    expect(home.goal.remainingAtDayStart).toBe(home.goal.total)

    const settings = await loadSettings(store, NOW)
    expect(settings.goal.todayNew).toBe(1)
    expect(settings.goal.recentPace).toBeCloseTo(1 / 7)
  })

  it('지난주에 재졸업한 구절도 최근 페이스·이번 주에 들지 않는다', async () => {
    const store = new MemoryStore()
    await regraduate(store, 'AS2a', { graduated: 40, reviewed: 39, demoted: 5, regraduated: 3 })
    const home = await loadHome(store, NOW)
    expect(home.newThisWeek).toBe(0)
    expect(home.goal.todayNew).toBe(0)
    expect(home.goal.recentPace).toBe(0)
    expect(home.goal.projectedDone).toBeNull()
  })

  it('이번 주에 처음 졸업한 구절은 강등했다가 다시 졸업해도 이번 주 새 구절로 한 번 센다', async () => {
    const store = new MemoryStore()
    await regraduate(store, 'AS2a', { graduated: 3, reviewed: 3, demoted: 1, regraduated: 0 })
    const home = await loadHome(store, NOW)
    expect(home.newThisWeek).toBe(1)
    expect(home.goal.recentPace).toBeCloseTo(1 / 7)
    // 처음 졸업은 사흘 전이다 — 오늘 새 구절은 아니다
    expect(home.goal.todayNew).toBe(0)
  })

  it('예외: 복습 없이 강등했던 구절은 흔적이 없어 다시 졸업한 때 새 구절로 한 번만 센다', async () => {
    const store = new MemoryStore()
    await regraduate(store, 'AS2a', { graduated: 40, demoted: 2, regraduated: 0 })
    const home = await loadHome(store, NOW)
    expect(home.newThisWeek).toBe(1)
    expect(home.goal.todayNew).toBe(1)
    expect(home.goal.recentPace).toBeCloseTo(1 / 7)
  })
})
