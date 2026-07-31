import type { State } from 'ts-fsrs'

export type Direction = 'topic' | 'ref' | 'text'

/** 졸업 시 생성되는 3방향. 순서는 카드 생성 순서이자 표시 순서의 정본이다. */
export const DIRECTIONS: readonly Direction[] = ['topic', 'ref', 'text']

export const DIRECTION_LABEL: Record<Direction, string> = {
  topic: '주제 → 말씀',
  ref: '장절 → 말씀',
  text: '말씀 → 장절',
}

/** IndexedDB·export에 그대로 들어가는 FSRS 카드의 영속 형태 */
export interface SerializedCard {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  /** 영속 형태는 숫자지만 값 집합은 State로 고정된다 */
  state: State
  last_review?: string
}

export interface StoredCard {
  key: string // `${verseId}:${direction}`
  verseId: string
  direction: Direction
  card: SerializedCard
}

export function cardKey(verseId: string, direction: Direction): string {
  return `${verseId}:${direction}`
}

export type Rating = 1 | 2 | 3 | 4

export type ReviewMode = 'firstLetter' | 'recite' | 'typing' | 'refInput'

export const REVIEW_MODES: readonly ReviewMode[] = [
  'firstLetter',
  'recite',
  'typing',
  'refInput',
]

/**
 * 등급 하나에 대한 증거. 객관 모드는 accuracy나 peeks 중 하나가 반드시 채워지고,
 * recite(자가 채점)만 양쪽이 null인 채로 남을 수 있다 — 그 예외가 허용되는 근거는
 * policy.ts의 주기적 타이핑 감사다.
 */
export interface ReviewEvidence {
  mode: ReviewMode
  rating: Rating
  accuracy: number | null
  peeks: number | null
}

export interface ReviewEntry extends ReviewEvidence {
  id?: number
  cardKey: string
  verseId: string
  direction: Direction
  ts: string
}
