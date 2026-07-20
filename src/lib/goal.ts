import { collectionOf, COLLECTIONS, VERSES } from '../data/verses'
import { retrievabilityAt, State } from './fsrs'
import { DIRECTIONS, type LearnProgress, type StoredCard } from './types'

export const DEFAULT_GOAL_DATE = '2026-08-26'
/** 새 구절 학습을 목표일보다 며칠 먼저 끝내고 남기는 복습 정착 기간 */
export const DEFAULT_REVIEW_BUFFER_DAYS = 7
/** 시험 준비 판정 기준: 시험일 예측 기억률 */
export const EXAM_RETENTION = 0.9

/** 목표 범위: DEP242 완결까지. 180구절 확장은 목표일 페이싱에 포함하지 않는다. */
const DEP_ORDER = COLLECTIONS.find((c) => c.key === 'DEP')!.order
const GOAL_VERSE_IDS = new Set(
  VERSES.filter((v) => collectionOf(v).order <= DEP_ORDER).map((v) => v.id),
)
export const GOAL_VERSE_COUNT = GOAL_VERSE_IDS.size

export interface GoalInfo {
  goalDate: string
  daysLeft: number
  /** 새 구절 학습에 쓸 수 있는 날 수 (목표일 − 정착 기간, 최소 1) */
  learnDaysLeft: number
  bufferDays: number
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
  bufferDays: number = DEFAULT_REVIEW_BUFFER_DAYS,
): GoalInfo {
  const graduated = learning.filter((l) => l.step >= 3 && GOAL_VERSE_IDS.has(l.verseId))
  const remaining = GOAL_VERSE_COUNT - graduated.length
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const todayNew = graduated.filter((l) => l.updatedAt >= midnight.toISOString()).length
  const end = new Date(`${goalDate}T23:59:59`)
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400_000))
  const past = end.getTime() < now.getTime()
  const learnDaysLeft = Math.max(1, daysLeft - bufferDays)
  const remainingAtDayStart = remaining + todayNew
  const dailyTarget = past ? 0 : Math.ceil(remainingAtDayStart / learnDaysLeft)
  return {
    goalDate,
    daysLeft,
    learnDaysLeft,
    bufferDays,
    remainingAtDayStart,
    remaining,
    dailyTarget,
    todayNew,
    past,
  }
}

export interface ExamReadiness {
  /** 시험일까지 추가 복습이 없어도 기억률 ≥ EXAM_RETENTION으로 예측되는 구절 수 */
  ready: number
  total: number
}

/**
 * 시험 준비도: 목표 범위(DEP242까지) 구절 중, 3방향 카드가 모두 존재하고
 * 각 카드의 시험일 예측 기억률(현재 상태 기준, 추가 복습 없음 가정)이
 * EXAM_RETENTION 이상인 구절 수.
 */
export function computeReadiness(
  cards: StoredCard[],
  goalDate: string,
  now: Date = new Date(),
): ExamReadiness {
  const exam = new Date(`${goalDate}T23:59:59`)
  const at = exam.getTime() > now.getTime() ? exam : now
  const byVerse = new Map<string, StoredCard[]>()
  for (const c of cards) {
    if (!GOAL_VERSE_IDS.has(c.verseId)) continue
    const arr = byVerse.get(c.verseId) ?? []
    arr.push(c)
    byVerse.set(c.verseId, arr)
  }
  let ready = 0
  for (const vc of byVerse.values()) {
    if (vc.length < DIRECTIONS.length) continue
    const ok = vc.every(
      (c) => c.card.state !== State.New && retrievabilityAt(c.card, at) >= EXAM_RETENTION,
    )
    if (ok) ready++
  }
  return { ready, total: GOAL_VERSE_COUNT }
}
