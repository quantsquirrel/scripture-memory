import { collectionOf, sectionOf, sectionsOf, VERSES } from '../data/verses'
import { cardKey, DIRECTIONS, type ReviewMode, type StoredCard } from '../domain/card'
import {
  computeGoal,
  DEFAULT_GOAL_DATE,
  DEFAULT_GOAL_SCOPE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  firstGraduatedAt,
  type GoalInfo,
  isGoalScope,
  PACE_WINDOW_DAYS,
} from '../domain/goal'
import { isGraduated, type LearnProgress } from '../domain/ladder'
import {
  inProgressInOrder,
  latestGraduatedId,
  onLadderIds,
  pickNextVerse,
} from '../domain/nextVerse'
import { LEARN_AHEAD_MS, orderQueue, reviewMode } from '../domain/policy'
import type { Store } from '../ports/repositories'

const startOfDay = (now: Date): Date => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

interface GoalSettings {
  goalDate: string
  bufferDays: number
  scope: string
}

/** 목표 설정을 기본값과 함께 한 번에 읽는다 */
async function readGoalSettings(store: Store): Promise<GoalSettings> {
  const [goalDate, bufferDays, scope] = await Promise.all([
    store.settings.goalDate(),
    store.settings.goalBufferDays(),
    store.settings.goalScope(),
  ])
  return {
    goalDate: goalDate ?? DEFAULT_GOAL_DATE,
    bufferDays: bufferDays ?? DEFAULT_REVIEW_BUFFER_DAYS,
    scope: isGoalScope(scope) ? scope : DEFAULT_GOAL_SCOPE,
  }
}

/** 홈 '이번 주 새 구절'의 창 (일) */
const WEEK_DAYS = 7

/** 새 구절 집계(이번 주·오늘·최근 페이스)가 보는 가장 긴 창의 시작 */
const newVerseWindowStart = (now: Date): number =>
  now.getTime() - Math.max(WEEK_DAYS, PACE_WINDOW_DAYS) * 86400_000

/**
 * 창 안에 졸업 상태가 된 구절마다 그 구절 카드들의 가장 이른 복습 시각(ms) — 다시 졸업한
 * 구절을 새 구절 집계에서 빼는 근거(domain/goal.ts의 firstGraduatedAt). 창 전에 졸업한
 * 구절은 어느 집계에도 들지 않으므로 읽지 않고, 기록은 cardKey 인덱스로 좁혀 읽는다 —
 * 수년치 기록 전체를 훑지 않는다. 읽을 수 없는 시각은 가장 오래된 것으로 친다(policy.ts와 같은 관례).
 */
async function earliestReviewsOf(
  store: Store,
  learning: readonly LearnProgress[],
  sinceMs: number,
): Promise<Map<string, number>> {
  const recent = learning.filter((l) => isGraduated(l) && Date.parse(l.updatedAt) >= sinceMs)
  const pairs = await Promise.all(
    recent.map(async (l) => {
      const logs = await Promise.all(
        DIRECTIONS.map((d) => store.reviews.ofCard(cardKey(l.verseId, d))),
      )
      const at = logs.flat().reduce((min, r) => {
        const t = Date.parse(r.ts)
        return Math.min(min, Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t)
      }, Number.POSITIVE_INFINITY)
      return [l.verseId, at] as const
    }),
  )
  return new Map(pairs.filter(([, at]) => at !== Number.POSITIVE_INFINITY))
}

const goalOf = (
  s: GoalSettings,
  learning: LearnProgress[],
  now: Date,
  earliestReviewAt: ReadonlyMap<string, number>,
): GoalInfo => computeGoal(s.goalDate, learning, now, s.bufferDays, s.scope, earliestReviewAt)

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
    label: '5확신, 8동행, 60구절',
    verseIds: VERSES.filter((v) => CORE_COLLECTIONS.has(collectionOf(v).key)).map((v) => v.id),
  },
  ...sectionsOf('DEP').map((s, i) => ({
    key: s.key,
    label: `DEP ${i + 1}. ${s.title}`,
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
  /** 이어 할 구절 — 진행 중인 구절(강등 구절 포함) 중 학습 순서상 첫 구절 */
  inProgress: LearnProgress | undefined
  /** 진행 중인 구절 수 (inProgress 포함) */
  inProgressCount: number
  /**
   * 다음 새 구절 — 가장 최근에 졸업한 구절 뒤에서부터, 사다리에 오른 적 없는 구절만
   * (진행 중인 구절은 전부 이어 하기가 맡는다)
   */
  nextNewId: string | null
  /** 최근 7일 처음 졸업한 새 구절 수 (강등했다가 다시 졸업한 구절은 세지 않는다) */
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
  const weekAgo = now.getTime() - WEEK_DAYS * 86400_000
  const earliest = await earliestReviewsOf(store, learning, newVerseWindowStart(now))
  const graduatedIds = new Set(learning.filter(isGraduated).map((l) => l.verseId))
  const order = VERSES.map((v) => v.id)
  const active = inProgressInOrder(order, learning)
  return {
    now: now.getTime(),
    due: due.length,
    dueVerses: new Set(due.map((c) => c.verseId)).size,
    upcoming: upcoming.length,
    overdue: due.filter((c) => c.card.due < midnight).length,
    todayReviews: today.length,
    nextDue,
    graduatedIds,
    inProgress: active[0],
    inProgressCount: active.length,
    nextNewId: pickNextVerse(order, onLadderIds(learning), latestGraduatedId(order, learning)),
    newThisWeek: learning.filter(
      (l) => isGraduated(l) && firstGraduatedAt(l, earliest.get(l.verseId)) >= weekAgo,
    ).length,
    goal: goalOf(settings, learning, now, earliest),
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

/** 출제할 카드 한 장과 이번 회차의 복습 방식 — 화면에 보인 방식이 곧 증거에 남는 방식이다 */
export interface QueuedCard {
  sc: StoredCard
  mode: ReviewMode
}

/**
 * 카드 한 장의 이번 회차 방식(domain/policy.ts). 복습 기록은 낭송 차례를 타이핑
 * 감사로 바꿀 수만 있으므로(감사 빚), 빈 기록으로 정한 방식이 낭송일 때만 그 카드의
 * 기록을 cardKey 인덱스로 읽는다 — 수년치 기록 전체를 훑지 않는다.
 */
export async function modeFor(store: Store, sc: StoredCard): Promise<ReviewMode> {
  const mode = reviewMode(sc.direction, sc.card, [])
  if (mode !== 'recite') return mode
  return reviewMode(sc.direction, sc.card, await store.reviews.ofCard(sc.key))
}

const queued = async (store: Store, sc: StoredCard): Promise<QueuedCard> => ({
  sc,
  mode: await modeFor(store, sc),
})

/**
 * 복습 큐. due가 비어 있으면 learn-ahead 창의 학습·재학습 카드를 쓴다 —
 * 방금 틀려 몇 분 뒤로 잡힌 카드를 같은 세션에서 이어 도전하기 위한 것이고,
 * 며칠 간격의 복습 카드는 당기지 않는다. 방식은 큐를 읽을 때의 카드 상태와
 * 기록으로 정한다 — 다시 채운 큐의 카드는 방금 매긴 등급까지 반영해 다시 정해진다.
 */
export async function loadReviewQueue(
  store: Store,
  isReviewable: (verseId: string) => boolean,
  now: Date = new Date(),
): Promise<QueuedCard[]> {
  const due = await store.cards.due(now)
  const source = due.length > 0 ? due : await store.cards.upcomingLearning(LEARN_AHEAD_MS, now)
  const ordered = orderQueue(source.filter((c) => isReviewable(c.verseId)))
  return Promise.all(ordered.map((sc) => queued(store, sc)))
}

/**
 * 큐에 든 카드 한 장을 저장소에서 다시 읽는다 — 채점이 StaleCardError로 거절됐을 때.
 * 방식도 새 상태·새 기록으로 다시 정한다. 그 사이 다른 곳에서 복습돼 learn-ahead 창
 * 밖으로 밀려났거나 사라졌으면 null.
 */
export async function reloadQueuedCard(
  store: Store,
  key: string,
  now: Date = new Date(),
): Promise<QueuedCard | null> {
  const fresh = await store.cards.get(key)
  if (!fresh) return null
  const horizon = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString()
  return fresh.card.due <= horizon ? queued(store, fresh) : null
}

export interface SettingsData {
  reviews: number
  graduated: number
  goal: GoalInfo
  syncToken: string
  syncGistId: string
  lastSyncAt: string | undefined
}

export async function loadSettings(
  store: Store,
  now: Date = new Date(),
): Promise<SettingsData> {
  const [reviews, learning, goal, token, gistId, lastSyncAt] = await Promise.all([
    store.reviews.count(),
    store.learning.all(),
    readGoalSettings(store),
    store.settings.syncToken(),
    store.settings.syncGistId(),
    store.settings.lastSyncAt(),
  ])
  const earliest = await earliestReviewsOf(store, learning, newVerseWindowStart(now))
  return {
    reviews,
    graduated: learning.filter(isGraduated).length,
    goal: goalOf(goal, learning, now, earliest),
    syncToken: token ?? '',
    syncGistId: gistId ?? '',
    lastSyncAt,
  }
}

/**
 * 이 기기에 아무 기록이 없는가 — 카드도, 복습 기록도, 학습 진행도 없다. 첫 실행의 소개 장면은
 * 이때만 저절로 뜬다: 기존 사용자와 백업·연동·동기화로 기록을 가져온 기기는 보지 않는다.
 * 카드는 기한 색인의 첫 항목 하나만 본다(전부 읽지 않는다).
 */
export async function isBlankDevice(store: Store): Promise<boolean> {
  if ((await store.cards.nextDueAt()) !== null) return false
  if ((await store.reviews.count()) > 0) return false
  return (await store.learning.all()).length === 0
}
