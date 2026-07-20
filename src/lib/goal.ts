import { collectionOf, COLLECTIONS, VERSES } from '../data/verses'
import type { LearnProgress } from './types'

export const DEFAULT_GOAL_DATE = '2026-08-20'

/** 목표 범위: DEP242 완결까지. 180구절 확장은 목표일 페이싱에 포함하지 않는다. */
const DEP_ORDER = COLLECTIONS.find((c) => c.key === 'DEP')!.order
const GOAL_VERSE_IDS = new Set(
  VERSES.filter((v) => collectionOf(v).order <= DEP_ORDER).map((v) => v.id),
)
export const GOAL_VERSE_COUNT = GOAL_VERSE_IDS.size

export interface GoalInfo {
  goalDate: string
  daysLeft: number
  /** 오늘 시작 기준 남은 구절 수(오늘 졸업분 포함) */
  remainingAtDayStart: number
  remaining: number
  dailyTarget: number
  todayNew: number
  past: boolean
}

export function computeGoal(
  goalDate: string,
  learning: LearnProgress[],
  now: Date = new Date(),
): GoalInfo {
  const graduated = learning.filter((l) => l.step >= 3 && GOAL_VERSE_IDS.has(l.verseId))
  const remaining = GOAL_VERSE_COUNT - graduated.length
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const todayNew = graduated.filter((l) => l.updatedAt >= midnight.toISOString()).length
  const end = new Date(`${goalDate}T23:59:59`)
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400_000))
  const past = end.getTime() < now.getTime()
  const remainingAtDayStart = remaining + todayNew
  const dailyTarget = past ? 0 : Math.ceil(remainingAtDayStart / daysLeft)
  return { goalDate, daysLeft, remainingAtDayStart, remaining, dailyTarget, todayNew, past }
}
