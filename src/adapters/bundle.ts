import {
  type Direction,
  DIRECTIONS,
  type Rating,
  REVIEW_MODES,
  type ReviewEntry,
  type ReviewMode,
  type SerializedCard,
  type StoredCard,
} from '../domain/card'
import { type LadderStep, type LearnProgress, stepFromLegacy } from '../domain/ladder'
import { toState } from '../domain/scheduler'
import { type ExportBundle, SCHEMA_VERSION } from '../ports/repositories'

/**
 * 백업 번들 검증·마이그레이션.
 *
 * 입력은 사용자가 고른 파일이나 Gist 응답이라 런타임에 무엇이든 올 수 있다.
 * 선언 타입을 믿으면 "형식 확인"이 컴파일러에게는 항상 참인 조건이 되어 실제로는
 * 검사가 없는 것과 같다. 저장소를 비우기 전에 전부 검증하고, v1은 v2로 올린다.
 *
 * v1 → v2 차이: learning[].step이 숫자(0~3)에서 사다리 단계 문자열로 바뀌었다.
 * 숫자 단계는 전이 규칙이 어디에도 적히지 않은 매직 넘버였다 (domain/ladder.ts).
 */
export function decodeBundle(input: unknown): ExportBundle {
  const b = asRecord(input, '번들')
  if (b['app'] !== 'scripture-memory') throw new Error('알 수 없는 백업 형식입니다')
  const version = b['version']
  if (version !== 1 && version !== SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 백업 버전입니다: ${String(version)}`)
  }
  if (
    !Array.isArray(b['cards']) ||
    !Array.isArray(b['reviews']) ||
    !Array.isArray(b['learning'])
  ) {
    throw new Error('백업 파일이 손상되었습니다 (cards/reviews/learning 누락)')
  }
  return {
    app: 'scripture-memory',
    version: SCHEMA_VERSION,
    exportedAt:
      typeof b['exportedAt'] === 'string' ? b['exportedAt'] : new Date(0).toISOString(),
    cards: b['cards'].map(asStoredCard),
    reviews: b['reviews'].map(asReviewEntry),
    learning: b['learning'].map(asLearnProgress),
  }
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`백업의 ${what} 형식이 올바르지 않습니다`)
  }
  return { ...v }
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`백업의 ${what}이(가) 문자열이 아닙니다`)
  return v
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`백업의 ${what}이(가) 숫자가 아닙니다`)
  }
  return v
}

function asDirection(v: unknown): Direction {
  const found = DIRECTIONS.find((d) => d === v)
  if (!found) throw new Error(`백업에 알 수 없는 방향이 있습니다: ${String(v)}`)
  return found
}

function asRating(v: unknown): Rating {
  if (v === 1 || v === 2 || v === 3 || v === 4) return v
  throw new Error(`백업에 알 수 없는 등급이 있습니다: ${String(v)}`)
}

function asReviewMode(v: unknown): ReviewMode {
  const found = REVIEW_MODES.find((m) => m === v)
  if (!found) throw new Error(`백업에 알 수 없는 복습 모드가 있습니다: ${String(v)}`)
  return found
}

export function asStoredCard(v: unknown): StoredCard {
  const c = asRecord(v, 'card')
  const card = asRecord(c['card'], 'card.card')
  const base: SerializedCard = {
    due: str(card['due'], 'card.due'),
    stability: num(card['stability'], 'card.stability'),
    difficulty: num(card['difficulty'], 'card.difficulty'),
    elapsed_days: num(card['elapsed_days'], 'card.elapsed_days'),
    scheduled_days: num(card['scheduled_days'], 'card.scheduled_days'),
    reps: num(card['reps'], 'card.reps'),
    lapses: num(card['lapses'], 'card.lapses'),
    learning_steps: num(card['learning_steps'], 'card.learning_steps'),
    state: toState(num(card['state'], 'card.state')),
  }
  return {
    key: str(c['key'], 'card.key'),
    verseId: str(c['verseId'], 'card.verseId'),
    direction: asDirection(c['direction']),
    card:
      card['last_review'] === undefined
        ? base
        : { ...base, last_review: str(card['last_review'], 'card.last_review') },
  }
}

export function asReviewEntry(v: unknown): ReviewEntry {
  const r = asRecord(v, 'review')
  return {
    cardKey: str(r['cardKey'], 'review.cardKey'),
    verseId: str(r['verseId'], 'review.verseId'),
    direction: asDirection(r['direction']),
    mode: asReviewMode(r['mode']),
    rating: asRating(r['rating']),
    accuracy: r['accuracy'] === null ? null : num(r['accuracy'], 'review.accuracy'),
    peeks: r['peeks'] === null ? null : num(r['peeks'], 'review.peeks'),
    ts: str(r['ts'], 'review.ts'),
  }
}

const LADDER_STEPS: readonly LadderStep[] = ['intro', 'firstLetter', 'typing', 'graduated']

/** v1은 step이 숫자, v2는 문자열 — 양쪽을 받아 사다리 단계로 정규화한다 */
export function asLadderStep(v: unknown): LadderStep {
  if (typeof v === 'number') return stepFromLegacy(v)
  const found = LADDER_STEPS.find((s) => s === v)
  if (!found) throw new Error(`백업에 알 수 없는 학습 단계가 있습니다: ${String(v)}`)
  return found
}

export function asLearnProgress(v: unknown): LearnProgress {
  const l = asRecord(v, 'learning')
  return {
    verseId: str(l['verseId'], 'learning.verseId'),
    step: asLadderStep(l['step']),
    updatedAt: str(l['updatedAt'], 'learning.updatedAt'),
  }
}
