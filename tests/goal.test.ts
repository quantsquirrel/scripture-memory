import { describe, expect, it } from 'vitest'

import { collectionOf, COLLECTIONS, VERSES } from '../src/data/verses'
import {
  computeGoal,
  DEFAULT_GOAL_SCOPE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  GOAL_VERSE_COUNT,
  goalVerseIds,
  isGoalScope,
  PACE_WINDOW_DAYS,
} from '../src/domain/goal'
import { required } from '../src/domain/invariant'
import type { LadderStep, LearnProgress } from '../src/domain/ladder'

const lp = (verseId: string, step: LadderStep, updatedAt: string): LearnProgress => ({
  verseId,
  step,
  updatedAt,
})

const DEP_ORDER = required(COLLECTIONS.find((c) => c.key === 'DEP')).order
const GOAL_IDS = VERSES.filter((v) => collectionOf(v).order <= DEP_ORDER).map((v) => v.id)

describe('computeGoal', () => {
  const now = new Date('2026-07-17T12:00:00+09:00')

  it('목표 범위는 DEP242 완결까지 315구절 (180구절 제외)', () => {
    expect(GOAL_VERSE_COUNT).toBe(315)
  })

  it('기본 정착 기간은 0일이다 (FSRS 분산을 깨지 않고 목표일까지 고르게 나눈다)', () => {
    expect(DEFAULT_REVIEW_BUFFER_DAYS).toBe(0)
    const g = computeGoal('2026-08-20', [], now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT)
    expect(g.daysLeft).toBeGreaterThanOrEqual(34)
    expect(g.learnDaysLeft).toBe(g.daysLeft)
    expect(g.requiredPace).toBeCloseTo(GOAL_VERSE_COUNT / g.daysLeft)
    expect(g.past).toBe(false)
  })

  it('정착 기간을 켠 경우 학습 가능일에서 빼고 최소 1로 클램프한다', () => {
    const g7 = computeGoal('2026-08-20', [], now, 7)
    expect(g7.learnDaysLeft).toBe(g7.daysLeft - 7)
    expect(g7.requiredPace).toBeCloseTo(GOAL_VERSE_COUNT / g7.learnDaysLeft)
    const gLate = computeGoal('2026-08-20', [], new Date('2026-08-18T08:00:00+09:00'), 7)
    expect(gLate.learnDaysLeft).toBe(1)
    expect(gLate.requiredPace).toBeCloseTo(gLate.remainingAtDayStart)
  })

  it('180구절 졸업은 목표 페이싱에 잡히지 않는다', () => {
    const g = computeGoal(
      '2026-08-20',
      [lp('T1-1a', 'graduated', '2026-07-17T10:00:00+09:00')],
      now,
    )
    expect(g.remaining).toBe(GOAL_VERSE_COUNT)
    expect(g.todayNew).toBe(0)
  })

  it('오늘 졸업분은 필요 페이스 분자에 포함된다', () => {
    const learning = [
      lp('AS1a', 'graduated', '2026-07-17T10:00:00+09:00'), // 오늘 졸업
      lp('AS2a', 'graduated', '2026-07-10T10:00:00+09:00'), // 이전 졸업
      lp('AS3a', 'firstLetter', '2026-07-17T11:00:00+09:00'), // 학습 중 (미졸업)
    ]
    const g = computeGoal('2026-08-20', learning, now)
    expect(g.remaining).toBe(GOAL_VERSE_COUNT - 2)
    expect(g.todayNew).toBe(1)
    expect(g.remainingAtDayStart).toBe(GOAL_VERSE_COUNT - 1)
    expect(g.requiredPace).toBeCloseTo((GOAL_VERSE_COUNT - 1) / g.learnDaysLeft)
  })

  it('최근 페이스: 지난 7일 창 안의 졸업만 센다', () => {
    const learning = [
      lp('AS1a', 'graduated', '2026-07-17T10:00:00+09:00'), // 창 안
      lp('AS2a', 'graduated', '2026-07-10T10:00:00+09:00'), // 창 밖 (7일 전 정오 이전)
    ]
    const g = computeGoal('2026-08-20', learning, now)
    expect(g.recentPace).toBeCloseTo(1 / PACE_WINDOW_DAYS)
  })

  it('페이스 0이면 예상 완료일 없음', () => {
    const g = computeGoal('2026-08-20', [], now)
    expect(g.recentPace).toBe(0)
    expect(g.projectedDone).toBeNull()
    expect(g.aheadDays).toBeNull()
  })

  it('현재 페이스로 남은 구절을 나눠 예상 완료일과 여유 일수를 준다', () => {
    // 300구절은 오래전 졸업, 7구절은 최근 7일 안에 졸업 → 페이스 1구절/일, 남은 8구절
    const learning = [
      ...GOAL_IDS.slice(0, 300).map((id) => lp(id, 'graduated', '2026-06-01T10:00:00+09:00')),
      ...GOAL_IDS.slice(300, 307).map((id) => lp(id, 'graduated', '2026-07-15T10:00:00+09:00')),
    ]
    const g = computeGoal('2026-08-20', learning, now)
    expect(g.remaining).toBe(8)
    expect(g.recentPace).toBeCloseTo(1)
    // 예상 완료: 7/17 정오 + 8일 = 7/25. 기본 정착 0일 → 목표일 8/20 대비 26일 여유
    expect(g.projectedDone).toBe('2026-07-25')
    expect(g.aheadDays).toBe(26)
    // 정착 7일이면 학습 마감 8/13 대비 19일 여유
    expect(computeGoal('2026-08-20', learning, now, 7).aheadDays).toBe(19)
  })

  it('목표일 당일도 1일로 계산한다', () => {
    const g = computeGoal('2026-08-20', [], new Date('2026-08-20T08:00:00+09:00'))
    expect(g.daysLeft).toBe(1)
    expect(g.past).toBe(false)
  })

  it('목표일 경과 시 past=true, 필요 페이스 0', () => {
    const g = computeGoal('2026-08-20', [], new Date('2026-08-21T08:00:00+09:00'))
    expect(g.past).toBe(true)
    expect(g.requiredPace).toBe(0)
  })
})

describe('목표 범위', () => {
  const now = new Date('2026-10-28T12:00:00+09:00')
  const all = (ids: Iterable<string>) =>
    [...ids].map((id) => lp(id, 'graduated', '2026-08-01T10:00:00+09:00'))

  it('범위는 학습 순서상 앞 과정을 모두 포함하는 누적이다', () => {
    expect(COLLECTIONS.map((c) => goalVerseIds(c.key).size)).toEqual([5, 13, 73, 315, 495])
  })

  it('기본 범위는 DEP242 완결 — 범위를 넘기지 않으면 지금까지와 같다', () => {
    const g = computeGoal('2026-12-31', [], now)
    expect(g.scope).toBe(DEFAULT_GOAL_SCOPE)
    expect(g.scopeLabel).toBe('DEP242')
    expect(g.total).toBe(GOAL_VERSE_COUNT)
  })

  it('DEP242를 마친 뒤 180구절로 넓히면 180구절만 남는다', () => {
    const learning = all(GOAL_IDS)
    expect(computeGoal('2026-12-31', learning, now).remaining).toBe(0)
    const g = computeGoal('2026-12-31', learning, now, DEFAULT_REVIEW_BUFFER_DAYS, 'TMS180')
    expect(g.scopeLabel).toBe('180구절')
    expect(g.total).toBe(495)
    expect(g.remaining).toBe(180)
    expect(g.requiredPace).toBeCloseTo(180 / g.learnDaysLeft)
  })

  it('범위를 좁히면 범위 밖 졸업은 세지 않는다', () => {
    const g = computeGoal('2026-12-31', all(GOAL_IDS.slice(0, 10)), now, 7, 'AS')
    expect(g.total).toBe(5)
    expect(g.remaining).toBe(0)
  })

  it('컬렉션 키가 아닌 값은 범위로 받지 않는다', () => {
    expect(isGoalScope('TMS180')).toBe(true)
    expect(isGoalScope('DEP242')).toBe(false)
    expect(isGoalScope(4)).toBe(false)
  })
})
