import { type SyncConfig, syncNow as gistSync, type SyncResult } from '../adapters/gist'
import { idbStore } from '../adapters/indexeddb'
import type { ReviewEntry, ReviewEvidence, StoredCard } from '../domain/card'
import type { LadderCommand, LadderOutcome, LadderStep, LearnProgress } from '../domain/ladder'
import type { ExportBundle, SettingsStore, Store } from '../ports/repositories'
import * as review from './review'
import { notifying } from './revision'
import * as settingsUseCase from './settings'

/**
 * 뷰가 쓰는 유스케이스 표면. 기본 저장소(IndexedDB)에 묶어 둔 얇은 바인딩이며,
 * 규칙은 전부 domain/과 app/에 있다.
 *
 * 여기에 등급을 적용하는 함수는 submitReview 하나뿐이다. domain의 applyRating은
 * 모듈 밖으로 나가지 않고, 저장소는 RatedCard만 커밋하므로 뷰에서 다른 경로로
 * FSRS 상태를 바꿀 수 없다.
 */
export const store: Store = idbStore

export const settings: SettingsStore = store.settings

export const dueCards = (now: Date = new Date()): Promise<StoredCard[]> => store.cards.due(now)

export const upcomingLearningCards = (
  aheadMs: number,
  now: Date = new Date(),
): Promise<StoredCard[]> => store.cards.upcomingLearning(aheadMs, now)

export const nextDueAt = (): Promise<string | null> => store.cards.nextDueAt()

export const getAllCards = (): Promise<StoredCard[]> => store.cards.all()

export const reviewsSince = (sinceIso: string): Promise<ReviewEntry[]> =>
  store.reviews.since(sinceIso)

export const allReviews = (): Promise<ReviewEntry[]> => store.reviews.all()

export const reviewCount = (): Promise<number> => store.reviews.count()

export const getLearning = (verseId: string): Promise<LearnProgress | undefined> =>
  store.learning.get(verseId)

export const getAllLearning = (): Promise<LearnProgress[]> => store.learning.all()

export const exportAll = (): Promise<ExportBundle> => store.exportAll()

export const importAll = notifying((input: unknown): Promise<void> => store.importAll(input))

export const resetAll = notifying((): Promise<void> => store.reset())

/** 등급 적용의 유일한 경로 — 증거 없이는 호출할 수 없다 */
export const submitReview = notifying(
  (card: StoredCard, evidence: ReviewEvidence, now?: Date): Promise<StoredCard> =>
    review.submitReview(store, card, evidence, now),
)

export const openLadder = (verseId: string): Promise<LadderStep> =>
  review.openLadder(store, verseId)

export const runLadder = notifying(
  (verseId: string, cmd: LadderCommand, now?: Date): Promise<LadderOutcome> =>
    review.runLadder(store, verseId, cmd, now),
)

export const applySchedulerSettings = (now?: Date): Promise<void> =>
  settingsUseCase.applySchedulerSettings(store, now)

// 설정 접근자 — 포트의 메서드를 뷰가 쓰는 이름으로 얇게 묶어 둔다
export const getGoalDate = (): Promise<string | undefined> => settings.goalDate()
export const setGoalDate = notifying((v: string): Promise<void> => settings.setGoalDate(v))
export const getGoalBufferDays = (): Promise<number | undefined> => settings.goalBufferDays()
export const setGoalBufferDays = notifying((v: number): Promise<void> =>
  settings.setGoalBufferDays(v),
)
export const getExamMode = (): Promise<boolean | undefined> => settings.examMode()
export const setExamMode = notifying((v: boolean): Promise<void> => settings.setExamMode(v))
export const getSyncToken = (): Promise<string | undefined> => settings.syncToken()
export const setSyncToken = notifying((v: string): Promise<void> => settings.setSyncToken(v))
export const getSyncGistId = (): Promise<string | undefined> => settings.syncGistId()
export const setSyncGistId = notifying((v: string): Promise<void> => settings.setSyncGistId(v))
export const getLastSyncAt = (): Promise<string | undefined> => settings.lastSyncAt()
export const setLastSyncAt = notifying((v: string): Promise<void> => settings.setLastSyncAt(v))

/** Gist 동기화 (선택 기능) — 기본 저장소에 묶어 둔 바인딩 */
export const syncNow = notifying((cfg: SyncConfig): Promise<SyncResult> => gistSync(store, cfg))
