import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { cardKey, type Direction, type ReviewEntry, type StoredCard } from '../domain/card'
import { type LadderStep, type LearnProgress, stepFromLegacy } from '../domain/ladder'
import { assertRated, newCard, type RatedCard, State } from '../domain/scheduler'
import {
  type CardRepository,
  type ExportBundle,
  type LearnProgressStore,
  type ReviewLog,
  SCHEMA_VERSION,
  type SettingsStore,
  type Store,
} from '../ports/repositories'
import { decodeBundle } from './bundle'

const DB_NAME = 'tms-krv'
/** v1: 인덱스 없음, learning.step은 숫자. v2: 인덱스 추가 + step을 사다리 단계 문자열로. */
const DB_VERSION = 2

interface TmsDB extends DBSchema {
  cards: {
    key: string
    value: StoredCard
    indexes: {
      /** due 오름차순 — 복습 큐와 nextDueAt이 전수 조회 없이 범위로 읽는다 */
      due: string
      verseId: string
      /** [state, due] — learn-ahead가 학습/재학습 상태만 범위로 좁힌다 */
      state_due: [number, string]
    }
  }
  reviews: {
    key: number
    value: ReviewEntry
    indexes: { ts: string; cardKey: string }
  }
  learning: { key: string; value: LearnProgress }
  settings: { key: string; value: { key: string; value: unknown } }
}

let dbPromise: Promise<IDBPDatabase<TmsDB>> | null = null

/**
 * 열린 연결을 닫고 캐시된 핸들을 버린다 (테스트에서 스키마를 다시 세울 때 필요).
 * 연결이 열려 있으면 deleteDatabase와 versionchange가 블록된다.
 */
export async function closeConnection(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (pending) (await pending).close()
}

/**
 * learning.step 숫자(v1) → 사다리 단계 문자열(v2).
 *
 * 버전 변경 트랜잭션 안에서 하지 않는다: upgrade 콜백을 async로 만들면 반환된
 * Promise가 버려지고(no-misused-promises) 트랜잭션 수명이 await 타이밍에 의존하게
 * 된다. 대신 openTmsDb()가 핸들을 돌려주기 전에 여기서 끝내므로, 앱 코드는 변환
 * 중간 상태를 볼 수 없다. typeof 검사로 걸러 멱등하다.
 */
async function migrateLearningSteps(d: IDBPDatabase<TmsDB>): Promise<void> {
  // 읽기로 먼저 확인해 변환할 게 없으면 쓰기 트랜잭션을 열지 않는다.
  // 멱등하므로 v2 DB에 구형 값이 섞여 들어와도(옛 Gist 병합 등) 스스로 정리된다.
  const legacy: { row: LearnProgress; step: number }[] = []
  for (const row of await d.getAll('learning')) {
    const step: unknown = row.step
    if (typeof step === 'number') legacy.push({ row, step })
  }
  if (legacy.length === 0) return
  const tx = d.transaction('learning', 'readwrite')
  for (const { row, step } of legacy) {
    await tx.store.put({ ...row, step: stepFromLegacy(step) })
  }
  await tx.done
}

export function openTmsDb(): Promise<IDBPDatabase<TmsDB>> {
  dbPromise ??= (async () => {
    const d = await openDB<TmsDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('cards', { keyPath: 'key' })
          db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true })
          db.createObjectStore('learning', { keyPath: 'verseId' })
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        if (oldVersion < 2) {
          // 인덱스는 기존 레코드에서 자동으로 채워진다 — 데이터를 다시 쓰지 않는다.
          const cards = tx.objectStore('cards')
          if (!cards.indexNames.contains('due')) cards.createIndex('due', 'card.due')
          if (!cards.indexNames.contains('verseId')) cards.createIndex('verseId', 'verseId')
          if (!cards.indexNames.contains('state_due')) {
            cards.createIndex('state_due', ['card.state', 'card.due'])
          }
          const reviews = tx.objectStore('reviews')
          if (!reviews.indexNames.contains('ts')) reviews.createIndex('ts', 'ts')
          if (!reviews.indexNames.contains('cardKey')) reviews.createIndex('cardKey', 'cardKey')
        }
      },
    })
    await migrateLearningSteps(d)
    return d
  })()
  return dbPromise
}

class IdbCards implements CardRepository {
  async all(): Promise<StoredCard[]> {
    return (await openTmsDb()).getAll('cards')
  }

  async get(key: string): Promise<StoredCard | undefined> {
    return (await openTmsDb()).get('cards', key)
  }

  /** due 인덱스 범위 스캔 — 인덱스가 이미 due 순이라 정렬이 필요 없다 */
  async due(now: Date): Promise<StoredCard[]> {
    const d = await openTmsDb()
    return d.getAllFromIndex('cards', 'due', IDBKeyRange.upperBound(now.toISOString()))
  }

  /** due 인덱스의 첫 키만 읽는다 — 전체 카드를 훑지 않는다 */
  async nextDueAt(): Promise<string | null> {
    const d = await openTmsDb()
    const cursor = await d.transaction('cards').store.index('due').openKeyCursor()
    if (!cursor) return null
    return typeof cursor.key === 'string' ? cursor.key : null
  }

  /**
   * 학습·재학습 상태이고 aheadMs 안에 due가 오는 카드.
   * [state, due] 복합 인덱스로 상태별 범위만 읽는다 — 성숙한 복습 카드는
   * 스캔 대상에 아예 들어오지 않는다.
   */
  async upcomingLearning(aheadMs: number, now: Date): Promise<StoredCard[]> {
    const horizon = new Date(now.getTime() + aheadMs).toISOString()
    const d = await openTmsDb()
    const index = d.transaction('cards').store.index('state_due')
    const out: StoredCard[] = []
    for (const state of [State.Learning, State.Relearning]) {
      const range = IDBKeyRange.bound([state, ''], [state, horizon])
      out.push(...(await index.getAll(range)))
    }
    return out
  }

  /**
   * 등급 적용과 증거 기록을 한 트랜잭션으로. RatedCard 외에는 받지 않으므로
   * 증거 없이 카드만 바뀌는 경로가 없다 — 하드 경계 1.
   */
  async commitRating(rated: RatedCard): Promise<StoredCard> {
    assertRated(rated)
    const d = await openTmsDb()
    const tx = d.transaction(['cards', 'reviews'], 'readwrite')
    // 증거를 먼저 쓴다. 두 번째 쓰기가 동기적으로 던지면 IndexedDB는 트랜잭션을
    // 자동으로 되돌리지 않으므로, 순서를 뒤집으면 카드만 갱신되고 증거가 없는
    // 상태로 커밋될 수 있다. 증거가 먼저면 실패 시 카드가 그대로 남는다.
    await tx.objectStore('reviews').add(rated.entry)
    await tx.objectStore('cards').put(rated.card)
    await tx.done
    return rated.card
  }
}

class IdbReviews implements ReviewLog {
  async all(): Promise<ReviewEntry[]> {
    return (await openTmsDb()).getAll('reviews')
  }

  /** ts 인덱스 하한 범위 — 전체 로그를 JS로 필터하지 않는다 */
  async since(sinceIso: string): Promise<ReviewEntry[]> {
    const d = await openTmsDb()
    return d.getAllFromIndex('reviews', 'ts', IDBKeyRange.lowerBound(sinceIso))
  }

  async count(): Promise<number> {
    return (await openTmsDb()).count('reviews')
  }
}

class IdbLearning implements LearnProgressStore {
  async get(verseId: string): Promise<LearnProgress | undefined> {
    return (await openTmsDb()).get('learning', verseId)
  }

  async all(): Promise<LearnProgress[]> {
    return (await openTmsDb()).getAll('learning')
  }

  async put(verseId: string, step: LadderStep, now: Date): Promise<void> {
    await (await openTmsDb()).put('learning', { verseId, step, updatedAt: now.toISOString() })
  }
}

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

/**
 * 설정 읽기는 스키마 검증을 통과해야 한다. 저장된 값은 export/import와 Gist
 * 동기화로 기기 사이를 오가는 JSON이라 타입 보장이 없다 — 형태가 어긋나면
 * undefined로 취급해 호출 쪽 기본값 경로를 타게 한다.
 */
class IdbSettings implements SettingsStore {
  private async read<T>(key: string, guard: Guard<T>): Promise<T | undefined> {
    const row = await (await openTmsDb()).get('settings', key)
    if (row === undefined || !guard(row.value)) return undefined
    return row.value
  }

  private async write(key: string, value: string | number | boolean): Promise<void> {
    await (await openTmsDb()).put('settings', { key, value })
  }

  goalDate = (): Promise<string | undefined> => this.read('goalDate', isIsoDate)
  setGoalDate = (v: string): Promise<void> => this.write('goalDate', v)
  goalBufferDays = (): Promise<number | undefined> =>
    this.read('goalBufferDays', isFiniteNumber)
  setGoalBufferDays = (v: number): Promise<void> => this.write('goalBufferDays', v)
  examMode = (): Promise<boolean | undefined> => this.read('examMode', isBoolean)
  setExamMode = (v: boolean): Promise<void> => this.write('examMode', v)
  syncToken = (): Promise<string | undefined> => this.read('syncToken', isString)
  setSyncToken = (v: string): Promise<void> => this.write('syncToken', v)
  syncGistId = (): Promise<string | undefined> => this.read('syncGistId', isString)
  setSyncGistId = (v: string): Promise<void> => this.write('syncGistId', v)
  lastSyncAt = (): Promise<string | undefined> => this.read('lastSyncAt', isString)
  setLastSyncAt = (v: string): Promise<void> => this.write('lastSyncAt', v)
}

class IdbStore implements Store {
  readonly cards = new IdbCards()
  readonly reviews = new IdbReviews()
  readonly learning = new IdbLearning()
  readonly settings = new IdbSettings()

  async graduate(verseId: string, directions: readonly Direction[], now: Date): Promise<void> {
    const d = await openTmsDb()
    const tx = d.transaction(['cards', 'learning'], 'readwrite')
    const cards = tx.objectStore('cards')
    for (const dir of directions) {
      const key = cardKey(verseId, dir)
      // 이미 있는 카드의 FSRS 상태는 덮어쓰지 않는다 (재졸업으로 진도 초기화 금지)
      if (!(await cards.get(key))) {
        await cards.put({ key, verseId, direction: dir, card: newCard(now) })
      }
    }
    await tx.objectStore('learning').put({
      verseId,
      step: 'graduated',
      updatedAt: now.toISOString(),
    })
    await tx.done
  }

  async exportAll(now: Date = new Date()): Promise<ExportBundle> {
    const d = await openTmsDb()
    return {
      app: 'scripture-memory',
      version: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      cards: await d.getAll('cards'),
      reviews: await d.getAll('reviews'),
      learning: await d.getAll('learning'),
    }
  }

  async importAll(input: unknown): Promise<void> {
    // 검증·마이그레이션을 먼저 끝낸다 — 저장소를 비운 뒤 실패하면 데이터가 사라진다
    const bundle = decodeBundle(input)
    const d = await openTmsDb()
    const tx = d.transaction(['cards', 'reviews', 'learning'], 'readwrite')
    await tx.objectStore('cards').clear()
    await tx.objectStore('reviews').clear()
    await tx.objectStore('learning').clear()
    for (const c of bundle.cards) await tx.objectStore('cards').put(c)
    for (const r of bundle.reviews) {
      const { id: _id, ...rest } = r
      await tx.objectStore('reviews').add(rest)
    }
    for (const l of bundle.learning) await tx.objectStore('learning').put(l)
    await tx.done
  }

  async reset(): Promise<void> {
    const d = await openTmsDb()
    const tx = d.transaction(['cards', 'reviews', 'learning', 'settings'], 'readwrite')
    await tx.objectStore('cards').clear()
    await tx.objectStore('reviews').clear()
    await tx.objectStore('learning').clear()
    await tx.objectStore('settings').clear()
    await tx.done
  }
}

export const idbStore: Store = new IdbStore()
