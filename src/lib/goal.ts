import { VERSES } from '../data/verses'
import type { LearnProgress } from './types'

export const DEFAULT_GOAL_DATE = '2026-08-20'

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
  const graduated = learning.filter((l) => l.step >= 3)
  const remaining = VERSES.length - graduated.length
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
