/**
 * 캡처 상태의 시드 재료. 모든 시각은 고정 시각 NOW에서 잰 거리로 적는다 — 브라우저 시계도
 * 같은 NOW에 묶이므로(run.ts) 홈의 날짜·D-day·"N일 후"·복습 큐의 due 판정이 실행마다 같다.
 *
 * 시드는 앱이 쓰는 저장 형태 그대로다(src/adapters/indexeddb.ts의 cards·reviews·learning·
 * settings). 앱 코드에 시험용 구멍을 내지 않고 브라우저 쪽에서 IndexedDB에 넣는다.
 */
import {
  collectionOf,
  sectionOf,
  VERSE_BY_ID,
  type VerseEntry,
  VERSES,
} from '../../src/data/verses'
import type { StoredCard } from '../../src/domain/card'
import {
  type Direction,
  DIRECTIONS,
  type ReviewEntry,
  type ReviewMode,
} from '../../src/domain/card'
import type { LadderStep, LearnProgress } from '../../src/domain/ladder'
import { State } from '../../src/domain/scheduler'

/** 2026-11-24 화요일 아침 9시(서울) */
export const NOW = new Date('2026-11-24T09:00:00+09:00')
export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

/** NOW에서 offset(ms)만큼 떨어진 시각 */
export const at = (offset: number): string => new Date(NOW.getTime() + offset).toISOString()

/** 가장 긴 구절(역대상 29:11-13, 221자)과 가장 짧은 구절(데살로니가전서 5:17, 10자) */
export const LONG = 'D4-28a'
export const SHORT = 'D4-1a'

export function verse(id: string): VerseEntry {
  const v = VERSE_BY_ID[id]
  if (!v) throw new Error(`구절 ${id}가 데이터에 없다`)
  return v
}

export const idsOfCollection = (key: string): string[] =>
  VERSES.filter((v) => collectionOf(v).key === key).map((v) => v.id)

export const idsOfSection = (key: string): string[] =>
  VERSES.filter((v) => sectionOf(v).key === key).map((v) => v.id)

export const ALL_IDS: readonly string[] = VERSES.map((v) => v.id)

export interface Seed {
  cards: StoredCard[]
  reviews: ReviewEntry[]
  learning: LearnProgress[]
  settings: { key: string; value: unknown }[]
}

/** 시드 조각을 이어 붙인다 — 같은 키의 카드는 뒤 조각이 이긴다(put 순서) */
export function seed(...parts: Partial<Seed>[]): Seed {
  return {
    cards: parts.flatMap((p) => p.cards ?? []),
    reviews: parts.flatMap((p) => p.reviews ?? []),
    learning: parts.flatMap((p) => p.learning ?? []),
    settings: parts.flatMap((p) => p.settings ?? []),
  }
}

/** 복습 방식(src/domain/policy.ts)이 정해지는 카드 모양 */
export type CardKind = 'recite' | 'typing' | 'firstLetter'

const KIND: Record<CardKind, { state: State; reps: number }> = {
  // Review 상태, (reps+1)%5 ≠ 0, 기록 없음 → 낭송
  recite: { state: State.Review, reps: 3 },
  // Review 상태, (reps+1)%5 = 0 → 타이핑 감사
  typing: { state: State.Review, reps: 4 },
  // 재학습(분 단위) → 첫글자 힌트
  firstLetter: { state: State.Relearning, reps: 4 },
}

/** 카드 한 장. due는 NOW에서 잰 거리. 말씀→장절(text) 카드는 방식과 무관하게 장절 입력이다 */
export function card(
  verseId: string,
  direction: Direction,
  due: number,
  kind: CardKind = 'recite',
): StoredCard {
  const { state, reps } = KIND[kind]
  const learning = state !== State.Review
  return {
    key: `${verseId}:${direction}`,
    verseId,
    direction,
    card: {
      due: at(due),
      stability: learning ? 0.6 : 12,
      difficulty: 5.2,
      elapsed_days: learning ? 0 : 12,
      scheduled_days: learning ? 0 : 12,
      reps,
      lapses: learning ? 1 : 0,
      learning_steps: 0,
      state,
      last_review: learning ? at(due - 10 * MIN) : at(due - 12 * DAY),
    },
  }
}

/** 졸업한 구절들 — 사다리 기록과 3방향 카드(모두 같은 due) */
export function graduate(
  ids: readonly string[],
  opts: { due?: number; updatedAt?: number; cards?: boolean } = {},
): Partial<Seed> {
  const due = opts.due ?? 5 * DAY
  return {
    learning: ids.map((verseId) => progress(verseId, 'graduated', opts.updatedAt ?? -30 * DAY)),
    cards:
      opts.cards === false
        ? []
        : ids.flatMap((id) => DIRECTIONS.map((dir) => card(id, dir, due))),
  }
}

export function progress(verseId: string, step: LadderStep, updatedAt = -DAY): LearnProgress {
  return { verseId, step, updatedAt: at(updatedAt) }
}

/** 복습 기록 한 줄(증거) */
export function log(
  cardKey: string,
  ts: number,
  mode: ReviewMode = 'recite',
  rating: 1 | 2 | 3 | 4 = 3,
): ReviewEntry {
  const [verseId, direction] = cardKey.split(':') as [string, Direction]
  return {
    cardKey,
    verseId,
    direction,
    ts: at(ts),
    mode,
    rating,
    accuracy: mode === 'typing' || mode === 'refInput' ? 1 : null,
    peeks: mode === 'firstLetter' ? 0 : null,
  }
}

/** 오늘(자정 뒤) n회 복습한 기록 */
export function todayLogs(n: number, cardKey = 'AS1a:ref'): ReviewEntry[] {
  return Array.from({ length: n }, (_, i) => log(cardKey, -(i + 1) * 20 * MIN))
}

/** 암송 목표 설정 행 — 값과 바꾼 시각을 함께 둔다(src/adapters/goalPrefs.ts) */
export function goal(g: { date?: string; buffer?: number; scope?: string }): Partial<Seed> {
  const rows: { key: string; value: unknown }[] = []
  if (g.date !== undefined) rows.push({ key: 'goalDate', value: g.date })
  if (g.buffer !== undefined) rows.push({ key: 'goalBufferDays', value: g.buffer })
  if (g.scope !== undefined) rows.push({ key: 'goalScope', value: g.scope })
  rows.push({ key: 'goalUpdatedAt', value: at(-7 * DAY) })
  return { settings: rows }
}

/** 앞에서부터 어절의 ratio만큼 — 입력 중이거나 많이 틀린 답안 */
export function partial(text: string, ratio: number): string {
  const words = text.split(' ')
  return words.slice(0, Math.max(1, Math.round(words.length * ratio))).join(' ')
}

/** 가운데 글자 하나만 다른 답안 — 정확도 90% 이상이지만 완벽하지 않다 */
export function oneOff(text: string): string {
  const mid = Math.floor(text.length / 2)
  let i = mid
  while (i < text.length && !/[가-힣]/.test(text.charAt(i))) i++
  const swap = text.charAt(i) === '가' ? '나' : '가'
  return text.slice(0, i) + swap + text.slice(i + 1)
}
