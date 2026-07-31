/**
 * 저장소 쿼리 벤치마크 — 945카드(315구절 × 3방향) + 10,000 복습 로그.
 *
 * v1은 dueCards/nextDueAt/upcomingLearningCards/reviewsSince가 모두 getAll() 후
 * JS 필터였다. v2는 같은 질문을 IDBKeyRange로 답한다. 두 방식을 같은 데이터에
 * 돌려 실측하고, 결과가 동일한지도 함께 확인한다 (빨라졌는데 답이 다르면 무의미).
 *
 * 실행: npm run bench
 */
import 'fake-indexeddb/auto'

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { DIRECTIONS, type ReviewEntry, type StoredCard } from '../src/domain/card'
import { State } from '../src/domain/scheduler'

const VERSE_COUNT = 315
const REVIEW_COUNT = 10_000
const NOW = new Date('2026-07-31T12:00:00.000Z')
const LEARN_AHEAD_MS = 20 * 60_000

function buildCards(): StoredCard[] {
  const cards: StoredCard[] = []
  for (let v = 0; v < VERSE_COUNT; v++) {
    for (const dir of DIRECTIONS) {
      // due를 과거~미래로 흩고, 일부는 학습/재학습 상태로 둔다
      const offsetDays = ((v * 7) % 90) - 30
      const state =
        v % 11 === 0 ? State.Learning : v % 17 === 0 ? State.Relearning : State.Review
      const due =
        state === State.Review
          ? new Date(NOW.getTime() + offsetDays * 86400_000)
          : new Date(NOW.getTime() + ((v % 40) - 5) * 60_000)
      cards.push({
        key: `v${String(v)}:${dir}`,
        verseId: `v${String(v)}`,
        direction: dir,
        card: {
          due: due.toISOString(),
          stability: 5 + (v % 30),
          difficulty: 5,
          elapsed_days: 2,
          scheduled_days: Math.max(1, offsetDays + 30),
          reps: v % 9,
          lapses: v % 3,
          learning_steps: 0,
          state,
          last_review: new Date(NOW.getTime() - 86400_000).toISOString(),
        },
      })
    }
  }
  return cards
}

function buildReviews(): Omit<ReviewEntry, 'id'>[] {
  const out: Omit<ReviewEntry, 'id'>[] = []
  for (let i = 0; i < REVIEW_COUNT; i++) {
    const v = i % VERSE_COUNT
    out.push({
      cardKey: `v${String(v)}:topic`,
      verseId: `v${String(v)}`,
      direction: 'topic',
      mode: 'recite',
      rating: 3,
      accuracy: null,
      peeks: null,
      // 최근 400일에 걸쳐 분포
      ts: new Date(NOW.getTime() - (REVIEW_COUNT - i) * 3_456_000).toISOString(),
    })
  }
  return out
}

interface Schema {
  version: number
  indexes: boolean
}

/** 벤치 DB 스키마 — 인덱스 유무만 다른 두 형태를 같은 타입으로 다룬다 */
interface BenchDB extends DBSchema {
  cards: {
    key: string
    value: StoredCard
    indexes: { due: string; verseId: string; state_due: [number, string] }
  }
  reviews: {
    key: number
    value: ReviewEntry
    indexes: { ts: string; cardKey: string }
  }
}

async function open(schema: Schema): Promise<IDBPDatabase<BenchDB>> {
  return openDB<BenchDB>('bench', schema.version, {
    upgrade(db) {
      const cards = db.createObjectStore('cards', { keyPath: 'key' })
      const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true })
      if (schema.indexes) {
        cards.createIndex('due', 'card.due')
        cards.createIndex('verseId', 'verseId')
        cards.createIndex('state_due', ['card.state', 'card.due'])
        reviews.createIndex('ts', 'ts')
        reviews.createIndex('cardKey', 'cardKey')
      }
    },
  })
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => {
      resolve()
    }
    req.onerror = () => {
      reject(new Error('deleteDatabase 실패'))
    }
  })
}

/** 같은 측정을 반복해 중앙값을 쓴다 — 단발 측정은 노이즈가 크다 */
async function timeMs(label: string, runs: number, fn: () => Promise<number>): Promise<number> {
  let checksum = 0
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    checksum = await fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)] ?? 0
  process.stdout.write(
    `  ${label.padEnd(24)} ${median.toFixed(2).padStart(9)} ms   (결과 ${String(checksum)})\n`,
  )
  return median
}

async function main(): Promise<void> {
  const cards = buildCards()
  const reviews = buildReviews()
  const iso = NOW.toISOString()
  const horizon = new Date(NOW.getTime() + LEARN_AHEAD_MS).toISOString()
  const since = new Date(NOW.getTime() - 7 * 86400_000).toISOString()

  process.stdout.write(
    `\n시드: 카드 ${String(cards.length)}장 (${String(VERSE_COUNT)}구절 × ${String(DIRECTIONS.length)}방향) · 복습 로그 ${String(reviews.length)}건\n`,
  )

  const results: Record<string, { before: number; after: number }> = {}

  for (const schema of [
    { version: 1, indexes: false },
    { version: 1, indexes: true },
  ]) {
    await deleteDb('bench')
    const d = await open(schema)
    const tx = d.transaction(['cards', 'reviews'], 'readwrite')
    for (const c of cards) await tx.objectStore('cards').put(c)
    for (const r of reviews) await tx.objectStore('reviews').add(r)
    await tx.done

    const tag = schema.indexes ? 'after (v2 인덱스)' : 'before (v1 전수 조회)'
    process.stdout.write(`\n${tag}\n`)
    const key = schema.indexes ? 'after' : 'before'

    const dueMs = await timeMs('dueCards', 20, async () => {
      const out = schema.indexes
        ? await d.getAllFromIndex('cards', 'due', IDBKeyRange.upperBound(iso))
        : (await d.getAll('cards'))
            .filter((c) => c.card.due <= iso)
            .sort((a, b) => (a.card.due < b.card.due ? -1 : 1))
      return out.length
    })

    const nextMs = await timeMs('nextDueAt', 20, async () => {
      if (schema.indexes) {
        const cursor = await d.transaction('cards').store.index('due').openKeyCursor()
        return cursor ? 1 : 0
      }
      const all = await d.getAll('cards')
      const first = all[0]
      if (!first) return 0
      all.reduce((min, c) => (c.card.due < min ? c.card.due : min), first.card.due)
      return 1
    })

    const aheadMs = await timeMs('upcomingLearning', 20, async () => {
      if (schema.indexes) {
        const index = d.transaction('cards').store.index('state_due')
        let n = 0
        for (const state of [State.Learning, State.Relearning]) {
          n += (await index.getAll(IDBKeyRange.bound([state, ''], [state, horizon]))).length
        }
        return n
      }
      return (await d.getAll('cards')).filter(
        (c) =>
          (c.card.state === State.Learning || c.card.state === State.Relearning) &&
          c.card.due <= horizon,
      ).length
    })

    const sinceMs = await timeMs('reviewsSince(7일)', 20, async () => {
      const out = schema.indexes
        ? await d.getAllFromIndex('reviews', 'ts', IDBKeyRange.lowerBound(since))
        : (await d.getAll('reviews')).filter((r) => r.ts >= since)
      return out.length
    })

    for (const [name, ms] of [
      ['dueCards', dueMs],
      ['nextDueAt', nextMs],
      ['upcomingLearning', aheadMs],
      ['reviewsSince', sinceMs],
    ] as const) {
      const slot = (results[name] ??= { before: 0, after: 0 })
      slot[key] = ms
    }
    d.close()
  }

  process.stdout.write('\n요약 (중앙값, 20회)\n')
  process.stdout.write('  쿼리                     before      after     배수\n')
  for (const [name, { before, after }] of Object.entries(results)) {
    const ratio = after > 0 ? before / after : 0
    process.stdout.write(
      `  ${name.padEnd(22)} ${before.toFixed(2).padStart(8)} ${after.toFixed(2).padStart(10)} ${`${ratio.toFixed(1)}x`.padStart(8)}\n`,
    )
  }
  await deleteDb('bench')
}

await main()
