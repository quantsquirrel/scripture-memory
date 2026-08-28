import type { Direction, ReviewEntry, StoredCard } from '../domain/card'
import type { LadderStep, LearnProgress } from '../domain/ladder'
import type { RatedCard } from '../domain/scheduler'

/**
 * 저장소 포트. 도메인은 이 인터페이스만 알고 IndexedDB·Gist·인메모리 구현을
 * 구분하지 않는다. 반대로 어댑터는 도메인 규칙을 알지 않는다.
 */
export interface CardRepository {
  all(): Promise<StoredCard[]>
  get(key: string): Promise<StoredCard | undefined>
  /** due <= now 인 카드를 due 오름차순으로 */
  due(now: Date): Promise<StoredCard[]>
  /** 가장 이른 due (카드가 없으면 null) */
  nextDueAt(): Promise<string | null>
  /** 학습·재학습 단계이고 aheadMs 안에 due가 도래하는 카드 (learn-ahead) */
  upcomingLearning(aheadMs: number, now: Date): Promise<StoredCard[]>
  /**
   * 등급 적용의 유일한 쓰기 경로.
   *
   * RatedCard만 받는다 — 그 타입은 domain/scheduler.ts에서만 만들 수 있고
   * 생성 시 증거를 필수로 요구하므로, 구현은 카드 갱신과 증거 기록을 반드시
   * 한 트랜잭션으로 처리하게 된다. 하드 경계 1.
   */
  commitRating(rated: RatedCard): Promise<StoredCard>
}

export interface ReviewLog {
  all(): Promise<ReviewEntry[]>
  /** ts >= sinceIso 인 복습 기록 */
  since(sinceIso: string): Promise<ReviewEntry[]>
  count(): Promise<number>
}

export interface LearnProgressStore {
  get(verseId: string): Promise<LearnProgress | undefined>
  all(): Promise<LearnProgress[]>
  put(verseId: string, step: LadderStep, now: Date): Promise<void>
}

export interface SettingsStore {
  goalDate(): Promise<string | undefined>
  setGoalDate(v: string): Promise<void>
  goalBufferDays(): Promise<number | undefined>
  setGoalBufferDays(v: number): Promise<void>
  syncToken(): Promise<string | undefined>
  setSyncToken(v: string): Promise<void>
  syncGistId(): Promise<string | undefined>
  setSyncGistId(v: string): Promise<void>
  lastSyncAt(): Promise<string | undefined>
  setLastSyncAt(v: string): Promise<void>
}

/** export/import 번들의 현재 스키마 버전 */
export const SCHEMA_VERSION = 2

export interface ExportBundle {
  app: 'scripture-memory'
  version: typeof SCHEMA_VERSION
  exportedAt: string
  cards: StoredCard[]
  reviews: ReviewEntry[]
  learning: LearnProgress[]
}

/**
 * 저장소 묶음. 여러 스토어를 한 트랜잭션으로 다뤄야 하는 연산은 개별 포트가
 * 아니라 여기 둔다 — 트랜잭션 경계를 인터페이스에 드러내기 위해서다.
 */
export interface Store {
  readonly cards: CardRepository
  readonly reviews: ReviewLog
  readonly learning: LearnProgressStore
  readonly settings: SettingsStore
  /**
   * 졸업: 없는 방향의 카드를 만들고 진행 상태를 'graduated'로 —
   * 두 스토어를 한 트랜잭션으로 처리한다. 기존 카드의 FSRS 상태는 덮어쓰지 않는다.
   */
  graduate(verseId: string, directions: readonly Direction[], now: Date): Promise<void>
  exportAll(now?: Date): Promise<ExportBundle>
  /** v1·v2 번들을 모두 받는다 (v1은 마이그레이션해서 적용) */
  importAll(input: unknown): Promise<void>
  reset(): Promise<void>
}
