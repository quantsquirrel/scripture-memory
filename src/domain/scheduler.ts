import {
  type Card,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Grade,
  Rating as FsrsRating,
  State,
} from 'ts-fsrs'

import type { Rating, ReviewEntry, ReviewEvidence, SerializedCard, StoredCard } from './card'

/** 장기 유지용 기본 목표 기억률 */
export const DEFAULT_RETENTION = 0.9

const makeScheduler = (retention: number) =>
  fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }))

let requestRetention = DEFAULT_RETENTION
let scheduler = makeScheduler(requestRetention)

/**
 * 스케줄러 목표 기억률 변경 (시험 모드).
 * 간격 계산에만 쓰이고 기억 모델(stability/difficulty)이나 카드 영속 데이터에는
 * 관여하지 않으므로, 되돌리면 다음 복습부터 즉시 원래 간격 체계로 복귀한다.
 */
export function setRequestRetention(r: number): void {
  if (r === requestRetention) return
  requestRetention = r
  scheduler = makeScheduler(r)
}

export function getRequestRetention(): number {
  return requestRetention
}

export function serializeCard(c: Card): SerializedCard {
  const base: SerializedCard = {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    // 예외: ts-fsrs가 elapsed_days를 6.0에서 제거 예정으로 표시했지만, 이 필드는
    // v1 사용자 데이터와 골든 fixture(tests/fixtures/export-v1.json)에 이미 들어
    // 있다. 읽고 다시 쓰지 않으면 기존 백업의 왕복이 손실된다 — 하드 경계 3.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
  }
  // exactOptionalPropertyTypes: last_review는 '없음'과 'undefined 값'이 다르다.
  // 복습 전 카드는 키 자체를 두지 않는다 (v1 export와 같은 모양).
  return c.last_review === undefined
    ? base
    : { ...base, last_review: new Date(c.last_review).toISOString() }
}

/**
 * 영속된 state 숫자를 FSRS State로 확인 — 손상된 저장 데이터나 다른 버전의
 * 백업을 조용히 통과시키지 않는다. 조회 표로 만들어 raw number와 열거형을
 * 직접 비교하지 않는다.
 */
const STATE_BY_VALUE = new Map<number, State>([
  [State.New, State.New],
  [State.Learning, State.Learning],
  [State.Review, State.Review],
  [State.Relearning, State.Relearning],
])

export function toState(n: number): State {
  const s = STATE_BY_VALUE.get(n)
  if (s === undefined) throw new Error(`알 수 없는 카드 상태입니다: ${String(n)}`)
  return s
}

export function reviveCard(s: SerializedCard): Card {
  const base: Card = {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    learning_steps: s.learning_steps,
    state: toState(s.state),
  }
  return s.last_review === undefined ? base : { ...base, last_review: new Date(s.last_review) }
}

export function newCard(now: Date = new Date()): SerializedCard {
  return serializeCard(createEmptyCard(now))
}

/** 앱의 등급 숫자(1~4) → ts-fsrs Grade. 총 매핑이라 캐스팅이 필요 없다. */
const GRADE: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
}

/**
 * FSRS 상태 전이의 실제 계산. **이 모듈 밖으로 내보내지 않는다.**
 *
 * 하드 경계 1(증거 없는 등급 적용 금지)을 관례가 아니라 구조로 지키기 위한
 * 장치다. 등급을 적용하려면 rateCard()를 불러야 하고, rateCard는 증거를 필수
 * 인자로 받아 RatedCard를 만든다. RatedCard의 브랜드 심볼(RATED)은 export되지
 * 않으므로 다른 모듈에서는 객체 리터럴로 위조할 수 없고, 저장소 포트는
 * RatedCard만 받는다. 즉 "카드 상태 변경"과 "증거 레코드"는 타입으로 묶여 있다.
 */
function applyRating(s: SerializedCard, rating: Rating, now: Date): SerializedCard {
  const { card } = scheduler.next(reviveCard(s), now, GRADE[rating])
  return serializeCard(card)
}

const RATED = Symbol('domain/rated')

/**
 * 등급이 적용된 카드와 그 근거. 생성 경로는 rateCard() 하나뿐이다.
 * 저장소는 이 타입만 커밋할 수 있으므로 증거 없는 상태 변경이 불가능하다.
 */
export interface RatedCard {
  readonly [RATED]: true
  /** 등급 적용 후의 카드 */
  readonly card: StoredCard
  /** 같은 트랜잭션에 기록될 증거 */
  readonly entry: Omit<ReviewEntry, 'id'>
}

/**
 * 저장소가 커밋 직전에 부르는 검증.
 *
 * 타입 브랜드는 `as unknown as RatedCard` 같은 이중 캐스팅으로 우회할 수 있다 —
 * 컴파일러만으로는 막을 수 없는 구멍이다. 런타임에 브랜드와 증거의 존재를 한 번
 * 더 확인해, 위조된 객체가 카드 상태를 바꾸지 못하게 한다.
 */
export function assertRated(value: RatedCard): void {
  const rated: unknown = value
  if (typeof rated !== 'object' || rated === null || !(RATED in rated)) {
    throw new Error('등급 적용은 rateCard()가 만든 결과만 커밋할 수 있습니다')
  }
  const { card, entry } = value
  if (typeof card !== 'object' || typeof entry !== 'object') {
    throw new Error('등급 적용 결과가 손상되었습니다')
  }
  // 증거가 비어 있으면 커밋을 거부한다 — 경계 1의 마지막 방어선
  if (typeof entry.mode !== 'string' || typeof entry.rating !== 'number') {
    throw new Error('증거(모드·등급) 없이 등급을 적용할 수 없습니다')
  }
  if (typeof entry.ts !== 'string' || Number.isNaN(Date.parse(entry.ts))) {
    throw new Error('증거에 유효한 시각이 없습니다')
  }
}

export function rateCard(
  sc: StoredCard,
  evidence: ReviewEvidence,
  now: Date = new Date(),
): RatedCard {
  return {
    [RATED]: true,
    card: { ...sc, card: applyRating(sc.card, evidence.rating, now) },
    entry: {
      cardKey: sc.key,
      verseId: sc.verseId,
      direction: sc.direction,
      mode: evidence.mode,
      rating: evidence.rating,
      accuracy: evidence.accuracy,
      peeks: evidence.peeks,
      ts: now.toISOString(),
    },
  }
}

/**
 * 등급별 다음 복습 간격 미리보기 (버튼 라벨용).
 * 상태를 반환하지 않고 문자열만 주므로 이 경로로는 등급이 적용되지 않는다.
 */
export function intervalPreview(
  s: SerializedCard,
  now: Date = new Date(),
): Record<Rating, string> {
  const revived = reviveCard(s)
  const preview = (r: Rating): string =>
    formatInterval(scheduler.next(revived, now, GRADE[r]).card.due.getTime() - now.getTime())
  return { 1: preview(1), 2: preview(2), 3: preview(3), 4: preview(4) }
}

/** when 시점까지 추가 복습이 없다고 가정한 예측 기억률 (0~1) */
export function retrievabilityAt(s: SerializedCard, when: Date): number {
  return scheduler.get_retrievability(reviveCard(s), when, false)
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}분`
  const hours = Math.round(min / 60)
  if (hours < 48) return `${hours}시간`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}일`
  const months = days / 30.4
  if (months < 12) return `${months.toFixed(months < 3 ? 1 : 0)}개월`
  return `${(days / 365).toFixed(1)}년`
}

export { State }
