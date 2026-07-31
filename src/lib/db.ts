import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  DIRECTIONS,
  type Direction,
  type LearnProgress,
  type ReviewEntry,
  type ReviewMode,
  type StoredCard,
} from './types'
import { applyRating, DEFAULT_RETENTION, newCard, setRequestRetention, State } from './fsrs'
import { DEFAULT_GOAL_DATE, EXAM_RETENTION, examModeActive } from './goal'

interface TmsDB extends DBSchema {
  cards: { key: string; value: StoredCard }
  reviews: { key: number; value: ReviewEntry }
  learning: { key: string; value: LearnProgress }
  settings: { key: string; value: { key: string; value: unknown } }
}

let dbPromise: Promise<IDBPDatabase<TmsDB>> | null = null

export function db(): Promise<IDBPDatabase<TmsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TmsDB>('tms-krv', 1, {
      upgrade(d) {
        d.createObjectStore('cards', { keyPath: 'key' })
        d.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true })
        d.createObjectStore('learning', { keyPath: 'verseId' })
        d.createObjectStore('settings', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

export function cardKey(verseId: string, direction: Direction): string {
  return `${verseId}:${direction}`
}

export async function getAllCards(): Promise<StoredCard[]> {
  return (await db()).getAll('cards')
}

export async function putCard(c: StoredCard): Promise<void> {
  await (await db()).put('cards', c)
}

export async function dueCards(now: Date = new Date()): Promise<StoredCard[]> {
  const all = await getAllCards()
  const iso = now.toISOString()
  return all.filter((c) => c.card.due <= iso).sort((a, b) => (a.card.due < b.card.due ? -1 : 1))
}

export async function nextDueAt(): Promise<string | null> {
  const all = await getAllCards()
  const first = all[0]
  if (!first) return null
  return all.reduce((min, c) => (c.card.due < min ? c.card.due : min), first.card.due)
}

/**
 * 학습·재학습 단계에 있고 aheadMs 안에 due가 도래하는 카드 (learn-ahead).
 * 큐를 다 비운 세션 말미에, 방금 틀려서 몇 분 뒤로 잡힌 카드를 같은 세션에서
 * 이어 재도전하기 위해 쓴다. 며칠 간격의 복습(Review) 카드는 당기지 않는다.
 */
export async function upcomingLearningCards(
  aheadMs: number,
  now: Date = new Date(),
): Promise<StoredCard[]> {
  const all = await getAllCards()
  const horizon = new Date(now.getTime() + aheadMs).toISOString()
  return all.filter(
    (c) =>
      (c.card.state === State.Learning || c.card.state === State.Relearning) &&
      c.card.due <= horizon,
  )
}

export async function addReview(r: ReviewEntry): Promise<void> {
  await (await db()).add('reviews', r)
}

/**
 * 복습 결과 반영의 유일한 경로.
 * 등급 적용(cards)과 증거 기록(reviews)을 한 트랜잭션으로 묶어,
 * 증거 없이 FSRS 상태만 바뀌는 경로가 생기지 않게 한다.
 */
export async function submitReview(
  sc: StoredCard,
  rating: 1 | 2 | 3 | 4,
  mode: ReviewMode,
  evidence: { accuracy: number | null; peeks: number | null },
  now: Date = new Date(),
): Promise<StoredCard> {
  const updated: StoredCard = { ...sc, card: applyRating(sc.card, rating, now) }
  const d = await db()
  const tx = d.transaction(['cards', 'reviews'], 'readwrite')
  await tx.objectStore('cards').put(updated)
  await tx.objectStore('reviews').add({
    cardKey: sc.key,
    verseId: sc.verseId,
    direction: sc.direction,
    mode,
    rating,
    accuracy: evidence.accuracy,
    peeks: evidence.peeks,
    ts: now.toISOString(),
  })
  await tx.done
  return updated
}

export async function reviewsSince(sinceIso: string): Promise<ReviewEntry[]> {
  const all = await (await db()).getAll('reviews')
  return all.filter((r) => r.ts >= sinceIso)
}

export async function reviewCount(): Promise<number> {
  return (await db()).count('reviews')
}

export async function getLearning(verseId: string): Promise<LearnProgress | undefined> {
  return (await db()).get('learning', verseId)
}

export async function getAllLearning(): Promise<LearnProgress[]> {
  return (await db()).getAll('learning')
}

export async function putLearning(p: LearnProgress): Promise<void> {
  await (await db()).put('learning', p)
}

/** 학습 사다리 통과 → 3방향 FSRS 카드 생성 + 졸업 표시 */
export async function graduateVerse(verseId: string, now: Date = new Date()): Promise<void> {
  const d = await db()
  const tx = d.transaction(['cards', 'learning'], 'readwrite')
  for (const dir of DIRECTIONS) {
    const key = cardKey(verseId, dir)
    const existing = await tx.objectStore('cards').get(key)
    if (!existing) {
      await tx.objectStore('cards').put({ key, verseId, direction: dir, card: newCard(now) })
    }
  }
  await tx.objectStore('learning').put({ verseId, step: 3, updatedAt: now.toISOString() })
  await tx.done
}

export interface ExportBundle {
  app: 'scripture-memory'
  version: 1
  exportedAt: string
  cards: StoredCard[]
  reviews: ReviewEntry[]
  learning: LearnProgress[]
}

export async function exportAll(): Promise<ExportBundle> {
  const d = await db()
  return {
    app: 'scripture-memory',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: await d.getAll('cards'),
    reviews: await d.getAll('reviews'),
    learning: await d.getAll('learning'),
  }
}

export async function importAll(bundle: ExportBundle): Promise<void> {
  if (bundle.app !== 'scripture-memory' || bundle.version !== 1) {
    throw new Error('알 수 없는 백업 형식입니다')
  }
  const d = await db()
  const tx = d.transaction(['cards', 'reviews', 'learning'], 'readwrite')
  await tx.objectStore('cards').clear()
  await tx.objectStore('reviews').clear()
  await tx.objectStore('learning').clear()
  for (const c of bundle.cards) await tx.objectStore('cards').put(c)
  for (const r of bundle.reviews) {
    const { id: _id, ...rest } = r
    await tx.objectStore('reviews').add(rest as ReviewEntry)
  }
  for (const l of bundle.learning) await tx.objectStore('learning').put(l)
  await tx.done
}

/**
 * 설정 읽기는 스키마 검증을 통과해야 한다. 저장된 값은 export/import와 Gist
 * 동기화로 기기 사이를 오가는 JSON이라 타입 보장이 없다 — 형태가 어긋나면
 * undefined로 취급해 호출 쪽 기본값 경로를 타게 한다.
 * (이전 구현은 `getSetting<T>`가 unknown을 T로 맹목 캐스팅했다.)
 */
type Guard<T> = (v: unknown) => v is T

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 'YYYY-MM-DD' — 목표일은 Date 파싱과 문자열 비교 양쪽에 쓰이므로 형식을 고정한다 */
function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
}

async function readSetting<T>(key: string, guard: Guard<T>): Promise<T | undefined> {
  const row = await (await db()).get('settings', key)
  if (row === undefined || !guard(row.value)) return undefined
  return row.value
}

async function writeSetting(key: string, value: string | number | boolean): Promise<void> {
  await (await db()).put('settings', { key, value })
}

export const getGoalDate = (): Promise<string | undefined> => readSetting('goalDate', isIsoDate)
export const setGoalDate = (v: string): Promise<void> => writeSetting('goalDate', v)

export const getGoalBufferDays = (): Promise<number | undefined> =>
  readSetting('goalBufferDays', isFiniteNumber)
export const setGoalBufferDays = (v: number): Promise<void> => writeSetting('goalBufferDays', v)

export const getExamMode = (): Promise<boolean | undefined> => readSetting('examMode', isBoolean)
export const setExamMode = (v: boolean): Promise<void> => writeSetting('examMode', v)

export const getSyncToken = (): Promise<string | undefined> => readSetting('syncToken', isString)
export const setSyncToken = (v: string): Promise<void> => writeSetting('syncToken', v)

export const getSyncGistId = (): Promise<string | undefined> =>
  readSetting('syncGistId', isString)
export const setSyncGistId = (v: string): Promise<void> => writeSetting('syncGistId', v)

export const getLastSyncAt = (): Promise<string | undefined> =>
  readSetting('lastSyncAt', isString)
export const setLastSyncAt = (v: string): Promise<void> => writeSetting('lastSyncAt', v)

/**
 * 시험 모드 설정을 스케줄러 목표 기억률에 반영한다.
 * 시험일(목표일)이 지나면 설정이 켜져 있어도 기본 체계로 자동 복귀한다.
 */
export async function applySchedulerSettings(now: Date = new Date()): Promise<void> {
  const [examMode, goalDate] = await Promise.all([getExamMode(), getGoalDate()])
  const active = examModeActive(examMode ?? false, goalDate ?? DEFAULT_GOAL_DATE, now)
  setRequestRetention(active ? EXAM_RETENTION : DEFAULT_RETENTION)
}

export async function resetAll(): Promise<void> {
  const d = await db()
  const tx = d.transaction(['cards', 'reviews', 'learning', 'settings'], 'readwrite')
  await tx.objectStore('cards').clear()
  await tx.objectStore('reviews').clear()
  await tx.objectStore('learning').clear()
  await tx.objectStore('settings').clear()
  await tx.done
}
