import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  DIRECTIONS,
  type Direction,
  type LearnProgress,
  type ReviewEntry,
  type ReviewMode,
  type StoredCard,
} from './types'
import { applyRating, newCard } from './fsrs'

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
  if (all.length === 0) return null
  return all.reduce((min, c) => (c.card.due < min ? c.card.due : min), all[0].card.due)
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

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get('settings', key)
  return row?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', { key, value })
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
