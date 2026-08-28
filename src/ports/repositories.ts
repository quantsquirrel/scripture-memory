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
  /**
   * QT 본문 위치 — '고전 15' 처럼 `약칭 장` 한 칸.
   *
   * 통독 계획과 달리 QT 진도는 앱이 알 수 없다(카톡방에 매일 올라온다).
   * 네트워크를 필수 의존으로 만들지 않으려고(하드 경계 4) 마지막으로 확인한
   * 위치를 저장해 두고, 날짜가 지나면 한 장씩 자동으로 밀어 기본값을 만든다.
   */
  qtPosition(): Promise<string | undefined>
  setQtPosition(v: string): Promise<void>
  /** qtPosition이 가리키는 날짜 'YYYY-MM-DD' — 자동 전진의 기준점 */
  qtPositionDate(): Promise<string | undefined>
  setQtPositionDate(v: string): Promise<void>
  /**
   * 최근에 보여준 묵상 구절 기록 (JSON 문자열, 'YYYY-MM-DD|구절id' 목록).
   *
   * 같은 말씀이 몇 달 안에 다시 오지 않게 하는 데만 쓰는 파생 상태다.
   * FSRS 증거가 아니므로 export 번들에는 들어가지 않는다 — 잃어도 복습
   * 이력은 그대로고, 잠시 중복이 나올 뿐이다.
   */
  meditationLog(): Promise<string | undefined>
  setMeditationLog(v: string): Promise<void>
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
