import { type CollectionInfo, collectionOf, COLLECTIONS, VERSES } from '../data/verses'
import { required } from './invariant'
import { isGraduated, type LearnProgress } from './ladder'

export const DEFAULT_GOAL_DATE = '2026-08-26'
/** 새 구절 학습을 목표일보다 며칠 먼저 끝내고 남기는 복습 정착 기간 */
export const DEFAULT_REVIEW_BUFFER_DAYS = 7

/**
 * 목표 범위: 학습 순서상 어느 과정까지 완결할지. 앞 과정을 모두 포함하는 누적 범위다.
 * 기본은 DEP242 완결까지(315구절) — 180구절은 사용자가 범위를 넓혔을 때만 페이싱에 든다.
 */
export const DEFAULT_GOAL_SCOPE = 'DEP'

export const isGoalScope = (v: unknown): v is string => COLLECTIONS.some((c) => c.key === v)

const scopeOf = (scope: string): CollectionInfo =>
  required(
    COLLECTIONS.find((c) => c.key === scope),
    `목표 범위 ${scope}`,
  )

export function goalVerseIds(scope: string): ReadonlySet<string> {
  const { order } = scopeOf(scope)
  return new Set(VERSES.filter((v) => collectionOf(v).order <= order).map((v) => v.id))
}

/** 기본 목표 범위의 구절 수 (315) */
export const GOAL_VERSE_COUNT = goalVerseIds(DEFAULT_GOAL_SCOPE).size

/** 실제 페이스 산출에 쓰는 최근 관찰 기간 (일) */
export const PACE_WINDOW_DAYS = 7

export interface GoalInfo {
  goalDate: string
  /** 목표 범위의 마지막 과정 키 (COLLECTIONS[].key) */
  scope: string
  /** 목표 범위 표시 이름 — 마지막 과정의 short ('DEP242', '180구절' …) */
  scopeLabel: string
  /** 목표 범위 구절 수 */
  total: number
  daysLeft: number
  /** 새 구절 학습에 쓸 수 있는 날 수 (목표일 − 정착 기간, 최소 1) */
  learnDaysLeft: number
  bufferDays: number
  /** 오늘 시작 기준 남은 구절 수(오늘 졸업분 포함) */
  remainingAtDayStart: number
  remaining: number
  todayNew: number
  /** 최근 PACE_WINDOW_DAYS일 실제 페이스 (구절/일, 목표 범위만) */
  recentPace: number
  /** 남은 구절을 학습 마감까지 끝내는 데 필요한 페이스 (구절/일) */
  requiredPace: number
  /** 현재 페이스 유지 시 예상 완료일 (YYYY-MM-DD). 최근 페이스 0이거나 남은 구절 없으면 null */
  projectedDone: string | null
  /** 예상 완료일이 학습 마감(목표일 − 정착 기간)보다 며칠 빠른가 (+여유/−부족) */
  aheadDays: number | null
  past: boolean
}

const fmtLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function computeGoal(
  goalDate: string,
  learning: LearnProgress[],
  now: Date = new Date(),
  bufferDays: number = DEFAULT_REVIEW_BUFFER_DAYS,
  scope: string = DEFAULT_GOAL_SCOPE,
): GoalInfo {
  const ids = goalVerseIds(scope)
  const graduated = learning.filter((l) => isGraduated(l) && ids.has(l.verseId))
  const remaining = ids.size - graduated.length
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const todayNew = graduated.filter((l) => l.updatedAt >= midnight.toISOString()).length
  const end = new Date(`${goalDate}T23:59:59`)
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400_000))
  const past = end.getTime() < now.getTime()
  const learnDaysLeft = Math.max(1, daysLeft - bufferDays)
  const remainingAtDayStart = remaining + todayNew
  const paceSince = now.getTime() - PACE_WINDOW_DAYS * 86400_000
  const recentPace =
    graduated.filter((l) => new Date(l.updatedAt).getTime() >= paceSince).length /
    PACE_WINDOW_DAYS
  const requiredPace = past ? 0 : remainingAtDayStart / learnDaysLeft
  const learnEnd = new Date(end.getTime() - bufferDays * 86400_000)
  let projectedDone: string | null = null
  let aheadDays: number | null = null
  if (remaining > 0 && recentPace > 0) {
    const done = new Date(now.getTime() + (remaining / recentPace) * 86400_000)
    projectedDone = fmtLocalDate(done)
    aheadDays = Math.round((learnEnd.getTime() - done.getTime()) / 86400_000)
  }
  return {
    goalDate,
    scope,
    scopeLabel: scopeOf(scope).short,
    total: ids.size,
    daysLeft,
    learnDaysLeft,
    bufferDays,
    remainingAtDayStart,
    remaining,
    todayNew,
    recentPace,
    requiredPace,
    projectedDone,
    aheadDays,
    past,
  }
}
