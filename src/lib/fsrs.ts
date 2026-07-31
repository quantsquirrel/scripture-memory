import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs'
import type { SerializedCard } from './types'

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
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
  }
  // exactOptionalPropertyTypes: last_review는 '없음'과 'undefined 값'이 다르다.
  // 복습 전 카드는 키 자체를 두지 않는다 (v1 export와 바이트 단위로 같은 모양).
  return c.last_review === undefined
    ? base
    : { ...base, last_review: new Date(c.last_review).toISOString() }
}

/** 영속된 state 숫자를 FSRS State로 확인 — 손상된 저장 데이터를 조용히 통과시키지 않는다 */
function toState(n: number): State {
  if (n === State.New || n === State.Learning || n === State.Review || n === State.Relearning) {
    return n
  }
  throw new Error(`알 수 없는 카드 상태입니다: ${String(n)}`)
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
const GRADE: Record<1 | 2 | 3 | 4, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
}

export function applyRating(
  s: SerializedCard,
  rating: 1 | 2 | 3 | 4,
  now: Date = new Date(),
): SerializedCard {
  const { card } = scheduler.next(reviveCard(s), now, GRADE[rating])
  return serializeCard(card)
}

/** 등급별 다음 복습 간격 미리보기 (버튼 라벨용) */
export function intervalPreview(
  s: SerializedCard,
  now: Date = new Date(),
): Record<1 | 2 | 3 | 4, string> {
  const revived = reviveCard(s)
  const preview = (r: 1 | 2 | 3 | 4): string =>
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

export { Rating, State }
