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

const makeScheduler = (retention: number, enableFuzz: boolean) =>
  fsrs(generatorParameters({ request_retention: retention, enable_fuzz: enableFuzz }))

const scheduler = makeScheduler(DEFAULT_RETENTION, true)

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
  /** 채점 기준이 된 카드 상태 — 저장된 카드가 이것과 같을 때만 커밋된다 */
  readonly base: SerializedCard
}

/**
 * 채점 기준이 된 카드가 저장소에서 이미 바뀌었다. 커밋하지 않았으므로 카드를
 * 다시 읽어 다시 출제해야 한다 — 새 상태에 옛 증거를 얹으면 카드 상태·기록으로
 * 정하는 복습 방식(policy.ts)이 어긋나 타이핑 감사를 건너뛸 수 있다.
 */
export class StaleCardError extends Error {
  constructor(readonly key: string) {
    super(`다른 탭이나 기기의 동기화로 카드가 바뀌었습니다: ${key}`)
    this.name = 'StaleCardError'
  }
}

/** 같은 일정 상태인가. 채점마다 reps와 last_review가 바뀌므로 둘이 버전 구실을 한다. */
export function isSameSchedule(a: SerializedCard, b: SerializedCard): boolean {
  return a.reps === b.reps && a.last_review === b.last_review && a.due === b.due
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
    base: sc.card,
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
  return previewWith(scheduler, reviveCard(s), now)
}

function previewWith(
  f: ReturnType<typeof makeScheduler>,
  card: Card,
  now: Date,
): Record<Rating, string> {
  const preview = (r: Rating): string =>
    formatInterval(f.next(card, now, GRADE[r]).card.due.getTime() - now.getTime())
  return { 1: preview(1), 2: preview(2), 3: preview(3), 4: preview(4) }
}

/** when 시점까지 추가 복습이 없다고 가정한 예측 기억률 (0~1) */
export function retrievabilityAt(s: SerializedCard, when: Date): number {
  return scheduler.get_retrievability(reviveCard(s), when, false)
}

/**
 * 마지막 복습 뒤 days일이 지난 기억의 기억률 (0~1) — 앱 스케줄러의 망각 곡선. 안정도는 기억률이
 * 목표 기억률로 내려오기까지의 날수다. 숫자만 받고 숫자만 돌려준다(카드를 만들지 않는다).
 */
export function recallAfter(days: number, stability: number): number {
  return scheduler.forgetting_curve(days, stability)
}

/** 예상치에서 복습 한 번 — 날수는 모두 첫 복습한 날(0)부터 센다 */
export interface ForecastReview {
  /** 복습한 날 */
  readonly day: number
  readonly rating: Rating
  /** 복습 뒤의 안정도(일) */
  readonly stability: number
  /** 다음 복습 기한 */
  readonly due: number
  /** 다음 복습까지의 간격 — 등급 칸과 같은 표기(formatInterval) */
  readonly interval: string
}

export interface ReviewForecast {
  /** 첫 복습 직전 등급 칸의 간격 */
  readonly preview: Readonly<Record<Rating, string>>
  /** ratings를 차례로, 매번 기한에 맞춰 복습했을 때 */
  readonly reviews: readonly ForecastReview[]
  /** 첫 복습 뒤로 다시 보지 않으면 마지막 기한에 남는 기억률 (0~1) */
  readonly unreviewedRecall: number
}

const DAY_MS = 86_400_000

/** 예상치의 출발 시각. 흔들림이 없으면 결과는 출발 시각과 무관하다 — 계산을 순수하게 두려고 고정한다 */
const FORECAST_START = new Date(Date.UTC(2026, 0, 1))

/** 흔들림만 끈 스케줄러 — 소개 장면을 열 때 처음 만든다(첫 화면에서 만들지 않는다) */
let forecaster: ReturnType<typeof makeScheduler> | undefined

/**
 * 소개 장면의 예상치: 학습을 갓 마친 카드 한 장(새 카드에 '좋음' 두 번 — 학습 단계를 지나
 * 간격 복습에 들어선 상태)을 ratings대로 매번 기한에 복습하면 간격이 어떻게 자라는가.
 *
 * 앱 스케줄러와 같은 설정(목표 기억률 DEFAULT_RETENTION, 기본 가중치)에서 흔들림(fuzz)만 끈
 * 순수 계산이다 — 흔들림은 같은 날 기한이 몰리지 않게 날짜를 조금 흩는 장치라, 켜 두면 화면의
 * 숫자가 열 때마다 달라진다. 하드 경계 1: 카드는 이 함수 안에서만 살고 밖으로는 글자·숫자뿐인
 * 얼린 값만 나간다. 저장할 수 있는 카드(SerializedCard·StoredCard·Card)나 RatedCard를 돌려주지
 * 않으므로 이 경로로는 어떤 카드의 상태도 바뀌지 않는다.
 */
export function forecastReviews(ratings: readonly Rating[]): ReviewForecast {
  const f = (forecaster ??= makeScheduler(DEFAULT_RETENTION, false))
  let card = createEmptyCard(FORECAST_START)
  for (let i = 0; i < 2; i++) card = f.next(card, card.due, GRADE[3]).card
  const today = card.due.getTime()
  const day = (d: Date) => Math.round((d.getTime() - today) / DAY_MS)
  const preview = Object.freeze(previewWith(f, card, card.due))

  const reviews: ForecastReview[] = []
  let afterFirst: Card | undefined
  for (const rating of ratings) {
    const at = card.due
    card = f.next(card, at, GRADE[rating]).card
    afterFirst ??= card
    reviews.push(
      Object.freeze({
        day: day(at),
        rating,
        stability: card.stability,
        due: day(card.due),
        interval: formatInterval(card.due.getTime() - at.getTime()),
      }),
    )
  }
  const end = reviews.at(-1)?.due ?? 0
  return Object.freeze({
    preview,
    reviews: Object.freeze(reviews),
    unreviewedRecall: afterFirst
      ? f.get_retrievability(afterFirst, new Date(today + end * DAY_MS), false)
      : 1,
  })
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
