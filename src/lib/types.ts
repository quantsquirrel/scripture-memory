export type Direction = 'topic' | 'ref' | 'text'

export const DIRECTIONS: Direction[] = ['topic', 'ref', 'text']

export const DIRECTION_LABEL: Record<Direction, string> = {
  topic: '주제 → 말씀',
  ref: '장절 → 말씀',
  text: '말씀 → 장절',
}

export interface SerializedCard {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: number
  last_review?: string
}

export interface StoredCard {
  key: string // `${verseId}:${direction}`
  verseId: string
  direction: Direction
  card: SerializedCard
}

export type ReviewMode = 'firstLetter' | 'recite' | 'typing' | 'refInput'

export interface ReviewEntry {
  id?: number
  cardKey: string
  verseId: string
  direction: Direction
  mode: ReviewMode
  rating: 1 | 2 | 3 | 4
  accuracy: number | null
  peeks: number | null
  ts: string
}

/** step: 0 소개, 1 첫글자, 2 타이핑, 3 졸업(복습 큐 편입) */
export interface LearnProgress {
  verseId: string
  step: number
  updatedAt: string
}
