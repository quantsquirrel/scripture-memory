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

export const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true }),
)

export function serializeCard(c: Card): SerializedCard {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review).toISOString() : undefined,
  }
}

export function reviveCard(s: SerializedCard): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card
}

export function newCard(now: Date = new Date()): SerializedCard {
  return serializeCard(createEmptyCard(now))
}

export function applyRating(
  s: SerializedCard,
  rating: 1 | 2 | 3 | 4,
  now: Date = new Date(),
): SerializedCard {
  const { card } = scheduler.next(reviveCard(s), now, rating as Grade)
  return serializeCard(card)
}

/** 등급별 다음 복습 간격 미리보기 (버튼 라벨용) */
export function intervalPreview(
  s: SerializedCard,
  now: Date = new Date(),
): Record<1 | 2 | 3 | 4, string> {
  const out = {} as Record<1 | 2 | 3 | 4, string>
  for (const r of [1, 2, 3, 4] as const) {
    const { card } = scheduler.next(reviveCard(s), now, r as Grade)
    out[r] = formatInterval(card.due.getTime() - now.getTime())
  }
  return out
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
