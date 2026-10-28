import { collectionOf, sectionOf, sectionsOf, VERSES } from '../data/verses'
import type { StoredCard } from '../domain/card'
import {
  computeGoal,
  DEFAULT_GOAL_DATE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  type GoalInfo,
} from '../domain/goal'
import { isGraduated, isInProgress, type LearnProgress } from '../domain/ladder'
import { LEARN_AHEAD_MS, orderQueue } from '../domain/policy'
import type { Store } from '../ports/repositories'

const startOfDay = (now: Date): Date => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 목표 설정을 기본값과 함께 한 번에 읽는다 */
async function readGoalSettings(
  store: Store,
): Promise<{ goalDate: string; bufferDays: number }> {
  const [goalDate, bufferDays] = await Promise.all([
    store.settings.goalDate(),
    store.settings.goalBufferDays(),
  ])
  return {
    goalDate: goalDate ?? DEFAULT_GOAL_DATE,
    bufferDays: bufferDays ?? DEFAULT_REVIEW_BUFFER_DAYS,
  }
}

/** 홈 진행률 묶음: 기초 3과정 · DEP 섹션별 · 180구절 */
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

/**
 * 큐에 든 카드 한 장을 저장소에서 다시 읽는다 — 채점이 StaleCardError로 거절됐을 때.
 * 그 사이 다른 곳에서 복습돼 learn-ahead 창 밖으로 밀려났거나 사라졌으면 null.
 */
export async function reloadQueuedCard(
  store: Store,
  key: string,
  now: Date = new Date(),
): Promise<StoredCard | null> {
  const fresh = await store.cards.get(key)
  if (!fresh) return null
  const horizon = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString()
  return fresh.card.due <= horizon ? fresh : null
}

export interface SettingsData {
  reviews: number
  graduated: number
  goalDate: string
  bufferDays: number
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
    syncToken: token ?? '',
    syncGistId: gistId ?? '',
    lastSyncAt,
  }
}
