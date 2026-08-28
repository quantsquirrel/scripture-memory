import { cardKey, type Direction, type ReviewEntry, type StoredCard } from '../domain/card'
import type { LadderStep, LearnProgress } from '../domain/ladder'
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

/**
 * 인메모리 저장소. 도메인·앱 계층 테스트가 fake-indexeddb 없이 돌게 하려고 있다.
 * IndexedDB 어댑터와 같은 포트를 구현하므로, 같은 테스트를 양쪽에 돌려
 * "구현이 달라도 규칙은 같다"를 확인할 수 있다.
 *
 * 트랜잭션성은 흉내내지 않는다 — 단일 스레드에서 동기적으로 갱신하므로
 * 중간 상태가 관측되지 않는다.
 */
export class MemoryStore implements Store {
  private cardRows = new Map<string, StoredCard>()
  private reviewRows: ReviewEntry[] = []
  private learningRows = new Map<string, LearnProgress>()
  private settingRows = new Map<string, unknown>()
  private nextReviewId = 1

  readonly cards: CardRepository = {
    all: () => Promise.resolve([...this.cardRows.values()]),
    get: (key) => Promise.resolve(this.cardRows.get(key)),
    due: (now) => {
      const iso = now.toISOString()
      return Promise.resolve(
        [...this.cardRows.values()]
          .filter((c) => c.card.due <= iso)
          .sort((a, b) => (a.card.due < b.card.due ? -1 : 1)),
      )
    },
    nextDueAt: () => {
      const dues = [...this.cardRows.values()].map((c) => c.card.due).sort()
      return Promise.resolve(dues[0] ?? null)
    },
    upcomingLearning: (aheadMs, now) => {
      const horizon = new Date(now.getTime() + aheadMs).toISOString()
      return Promise.resolve(
        [...this.cardRows.values()].filter(
          (c) =>
            (c.card.state === State.Learning || c.card.state === State.Relearning) &&
            c.card.due <= horizon,
        ),
      )
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    commitRating: async (rated: RatedCard) => {
      // 포트가 Promise를 약속하므로 검증 실패도 동기 throw가 아니라 reject로 나간다
      assertRated(rated)
      this.cardRows.set(rated.card.key, rated.card)
      this.reviewRows.push({ ...rated.entry, id: this.nextReviewId++ })
      return rated.card
    },
  }

  readonly reviews: ReviewLog = {
    all: () => Promise.resolve([...this.reviewRows]),
    since: (sinceIso) => Promise.resolve(this.reviewRows.filter((r) => r.ts >= sinceIso)),
    count: () => Promise.resolve(this.reviewRows.length),
  }

  readonly learning: LearnProgressStore = {
    get: (verseId) => Promise.resolve(this.learningRows.get(verseId)),
    all: () => Promise.resolve([...this.learningRows.values()]),
    put: (verseId, step: LadderStep, now) => {
      this.learningRows.set(verseId, { verseId, step, updatedAt: now.toISOString() })
      return Promise.resolve()
    },
  }

  readonly settings: SettingsStore = {
    goalDate: () => this.readSetting('goalDate', (v) => typeof v === 'string'),
    setGoalDate: (v) => this.writeSetting('goalDate', v),
    goalBufferDays: () => this.readSetting('goalBufferDays', (v) => typeof v === 'number'),
    setGoalBufferDays: (v) => this.writeSetting('goalBufferDays', v),
    syncToken: () => this.readSetting('syncToken', (v) => typeof v === 'string'),
    setSyncToken: (v) => this.writeSetting('syncToken', v),
    syncGistId: () => this.readSetting('syncGistId', (v) => typeof v === 'string'),
    setSyncGistId: (v) => this.writeSetting('syncGistId', v),
    lastSyncAt: () => this.readSetting('lastSyncAt', (v) => typeof v === 'string'),
    setLastSyncAt: (v) => this.writeSetting('lastSyncAt', v),
  }

  private readSetting<T>(key: string, ok: (v: unknown) => boolean): Promise<T | undefined> {
    const v = this.settingRows.get(key)
    return Promise.resolve(v !== undefined && ok(v) ? (v as T) : undefined)
  }

  private writeSetting(key: string, value: string | number | boolean): Promise<void> {
    this.settingRows.set(key, value)
    return Promise.resolve()
  }

  graduate(verseId: string, directions: readonly Direction[], now: Date): Promise<void> {
    for (const dir of directions) {
      const key = cardKey(verseId, dir)
      if (!this.cardRows.has(key)) {
        this.cardRows.set(key, { key, verseId, direction: dir, card: newCard(now) })
      }
    }
    this.learningRows.set(verseId, {
      verseId,
      step: 'graduated',
      updatedAt: now.toISOString(),
    })
    return Promise.resolve()
  }

  exportAll(now: Date = new Date()): Promise<ExportBundle> {
    return Promise.resolve({
      app: 'scripture-memory',
      version: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      cards: [...this.cardRows.values()],
      reviews: [...this.reviewRows],
      learning: [...this.learningRows.values()],
    })
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async importAll(input: unknown): Promise<void> {
    const bundle = decodeBundle(input)
    this.cardRows = new Map(bundle.cards.map((c) => [c.key, c]))
    this.reviewRows = bundle.reviews.map((r) => {
      const { id: _id, ...rest } = r
      return { ...rest, id: this.nextReviewId++ }
    })
    this.learningRows = new Map(bundle.learning.map((l) => [l.verseId, l]))
  }

  reset(): Promise<void> {
    this.cardRows.clear()
    this.reviewRows = []
    this.learningRows.clear()
    this.settingRows.clear()
    this.nextReviewId = 1
    return Promise.resolve()
  }
}
