import { collectionOf, sectionOf, sectionsOf, VERSES } from '../data/verses'
import type { Direction, ReviewEntry, StoredCard } from '../domain/card'
import {
  computeGoal,
  computeReadiness,
  DEFAULT_GOAL_DATE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  examModeActive,
  type ExamReadiness,
  type GoalInfo,
} from '../domain/goal'
import { isGraduated, isInProgress, type LearnProgress } from '../domain/ladder'
import { LEARN_AHEAD_MS, orderQueue } from '../domain/policy'
import {
  type AccuracySummary,
  dailyPick,
  directionRetention,
  type DueForecast,
  dueForecast,
  type KnowledgeNow,
  knowledgeNow,
  type Maturity,
  maturity,
  objectiveAccuracy,
  type QueueProgress,
  queueProgress,
  type ReviewHistory,
  reviewHistory,
  type SelfGradeCalibration,
  selfGradeCalibration,
  type TrueRetention,
  trueRetention,
  type WeakVerse,
  weakVerses,
} from '../domain/stats'
import type { Store } from '../ports/repositories'

const startOfDay = (now: Date): Date => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 목표·시험 모드 설정을 기본값과 함께 한 번에 읽는다 */
async function readGoalSettings(
  store: Store,
): Promise<{ goalDate: string; bufferDays: number; examMode: boolean }> {
  const [goalDate, bufferDays, examMode] = await Promise.all([
    store.settings.goalDate(),
    store.settings.goalBufferDays(),
    store.settings.examMode(),
  ])
  return {
    goalDate: goalDate ?? DEFAULT_GOAL_DATE,
    bufferDays: bufferDays ?? DEFAULT_REVIEW_BUFFER_DAYS,
    examMode: examMode ?? false,
  }
}

/** 홈·돌아보기가 함께 쓰는 진행률 묶음: 기초 3과정 · DEP 섹션별 · 180구절 */
export interface ProgressRow {
  key: string
  label: string
  verseIds: readonly string[]
}

const CORE_COLLECTIONS = new Set(['AS', 'LV', 'TMS60'])

export const PROGRESS_ROWS: readonly ProgressRow[] = [
  {
    key: 'core',
    label: '5확신·8동행·60구절',
    verseIds: VERSES.filter((v) => CORE_COLLECTIONS.has(collectionOf(v).key)).map((v) => v.id),
  },
  ...sectionsOf('DEP').map((s, i) => ({
    key: s.key,
    label: `${i + 1}. ${s.title}`,
    verseIds: VERSES.filter((v) => sectionOf(v).key === s.key).map((v) => v.id),
  })),
  {
    key: 'TMS180',
    label: '180구절',
    verseIds: VERSES.filter((v) => collectionOf(v).key === 'TMS180').map((v) => v.id),
  },
]

export interface HomeData {
  /** 이 스냅샷을 읽은 시각 — 렌더 중 Date.now()를 부르지 않기 위해 함께 보관한다 */
  now: number
  due: number
  dueVerses: number
  upcoming: number
  overdue: number
  todayReviews: number
  nextDue: string | null
  graduatedIds: ReadonlySet<string>
  inProgress: LearnProgress | undefined
  newThisWeek: number
  goal: GoalInfo
  examActive: boolean
}

export async function loadHome(store: Store, now: Date = new Date()): Promise<HomeData> {
  const midnight = startOfDay(now).toISOString()
  const [due, upcoming, today, learning, nextDue, settings] = await Promise.all([
    store.cards.due(now),
    store.cards.upcomingLearning(LEARN_AHEAD_MS, now),
    store.reviews.since(midnight),
    store.learning.all(),
    store.cards.nextDueAt(),
    readGoalSettings(store),
  ])
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString()
  return {
    now: now.getTime(),
    due: due.length,
    dueVerses: new Set(due.map((c) => c.verseId)).size,
    upcoming: upcoming.length,
    overdue: due.filter((c) => c.card.due < midnight).length,
    todayReviews: today.length,
    nextDue,
    graduatedIds: new Set(learning.filter(isGraduated).map((l) => l.verseId)),
    inProgress: learning.find(isInProgress),
    newThisWeek: learning.filter((l) => isGraduated(l) && l.updatedAt >= weekAgo).length,
    goal: computeGoal(settings.goalDate, learning, now, settings.bufferDays),
    examActive: examModeActive(settings.examMode, settings.goalDate, now),
  }
}

export interface StatsData {
  cards: StoredCard[]
  graduatedIds: ReadonlySet<string>
  knowledge: KnowledgeNow
  readiness: ExamReadiness
  mat: Maturity
  retention7: TrueRetention
  retention30: TrueRetention
  dirRetention: Record<Direction, TrueRetention>
  accuracy: AccuracySummary
  calibration: SelfGradeCalibration
  history: ReviewHistory
  queue: QueueProgress
  forecast: DueForecast
  overdue: number
  weak: WeakVerse[]
  goal: GoalInfo
  examActive: boolean
  /** 이미 새긴 구절 중 오늘의 한 구절 (id) */
  meditationId: string | null
  /** 영역별 깊이: 새긴 구절 수와 평균 예측 기억률 */
  fields: { key: string; label: string; done: number; depth: number | null }[]
}

export async function loadStats(store: Store, now: Date = new Date()): Promise<StatsData> {
  const midnight = startOfDay(now)
  const midnightIso = midnight.toISOString()
  const [cards, learning, due, allReviews, settings] = await Promise.all([
    store.cards.all(),
    store.learning.all(),
    store.cards.due(now),
    store.reviews.all(),
    readGoalSettings(store),
  ])
  const monthAgo = new Date(midnight.getTime() - 30 * 86400_000).toISOString()
  const weekAgo = new Date(midnight.getTime() - 7 * 86400_000).toISOString()
  const month = allReviews.filter((r) => r.ts >= monthAgo)
  const week = month.filter((r) => r.ts >= weekAgo)
  const today = month.filter((r) => r.ts >= midnightIso)
  const graduatedIds = new Set(learning.filter(isGraduated).map((l) => l.verseId))
  const engraved = VERSES.filter((v) => graduatedIds.has(v.id))

  return {
    cards,
    graduatedIds,
    knowledge: knowledgeNow(cards, now),
    readiness: computeReadiness(cards, settings.goalDate, now),
    mat: maturity(cards),
    retention7: trueRetention(week),
    retention30: trueRetention(month),
    dirRetention: directionRetention(month),
    accuracy: objectiveAccuracy(month),
    calibration: selfGradeCalibration(month),
    history: reviewHistory(allReviews, 7, now),
    queue: queueProgress(today, due.length),
    forecast: dueForecast(cards, 7, now),
    overdue: due.filter((c) => c.card.due < midnightIso).length,
    weak: weakVerses(cards, 5),
    goal: computeGoal(settings.goalDate, learning, now, settings.bufferDays),
    examActive: examModeActive(settings.examMode, settings.goalDate, now),
    meditationId: dailyPick(engraved, now)?.id ?? null,
    fields: PROGRESS_ROWS.map((row) => {
      const ids = new Set(row.verseIds)
      return {
        key: row.key,
        label: row.label,
        done: row.verseIds.filter((id) => graduatedIds.has(id)).length,
        depth: knowledgeNow(
          cards.filter((c) => ids.has(c.verseId)),
          now,
        ).avgRetrievability,
      }
    }),
  }
}

export interface BrowseData {
  now: number
  learning: Map<string, LearnProgress>
  cardsByVerse: Map<string, StoredCard[]>
}

export async function loadBrowse(store: Store, now: Date = new Date()): Promise<BrowseData> {
  const [learning, cards] = await Promise.all([store.learning.all(), store.cards.all()])
  const cardsByVerse = new Map<string, StoredCard[]>()
  for (const c of cards) {
    const arr = cardsByVerse.get(c.verseId)
    if (arr) arr.push(c)
    else cardsByVerse.set(c.verseId, [c])
  }
  return {
    now: now.getTime(),
    learning: new Map(learning.map((l) => [l.verseId, l])),
    cardsByVerse,
  }
}

/**
 * 복습 큐. due가 비어 있으면 learn-ahead 창의 학습·재학습 카드를 쓴다 —
 * 방금 틀려 몇 분 뒤로 잡힌 카드를 같은 세션에서 이어 도전하기 위한 것이고,
 * 며칠 간격의 복습 카드는 당기지 않는다.
 */
export async function loadReviewQueue(
  store: Store,
  isReviewable: (verseId: string) => boolean,
  now: Date = new Date(),
): Promise<StoredCard[]> {
  const due = await store.cards.due(now)
  const source = due.length > 0 ? due : await store.cards.upcomingLearning(LEARN_AHEAD_MS, now)
  return orderQueue(source.filter((c) => isReviewable(c.verseId)))
}

export interface SettingsData {
  reviews: number
  graduated: number
  goalDate: string
  bufferDays: number
  examMode: boolean
  syncToken: string
  syncGistId: string
  lastSyncAt: string | undefined
}

export async function loadSettings(store: Store): Promise<SettingsData> {
  const [reviews, learning, goal, token, gistId, lastSyncAt] = await Promise.all([
    store.reviews.count(),
    store.learning.all(),
    readGoalSettings(store),
    store.settings.syncToken(),
    store.settings.syncGistId(),
    store.settings.lastSyncAt(),
  ])
  return {
    reviews,
    graduated: learning.filter(isGraduated).length,
    goalDate: goal.goalDate,
    bufferDays: goal.bufferDays,
    examMode: goal.examMode,
    syncToken: token ?? '',
    syncGistId: gistId ?? '',
    lastSyncAt,
  }
}

export type { ReviewEntry }
