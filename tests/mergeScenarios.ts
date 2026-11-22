// 간편 기기 연동(아이폰 → 맥북)에서 운영자가 본 증상 네 장면.
// tests/sync.test.ts(mergeBundles)와 tests/app/pairing.test.ts(receivePairing)가 같이 쓴다.
// 맥북이 받는 쪽, 아이폰이 보내는 쪽이다 — 병합 뒤 맥북의 카드·단계가 아이폰과 같아야 한다.
import { State } from 'ts-fsrs'

import {
  type Direction,
  DIRECTIONS,
  type ReviewEntry,
  type SerializedCard,
  type StoredCard,
} from '../src/domain/card'
import { required } from '../src/domain/invariant'
import type { LadderStep, LearnProgress } from '../src/domain/ladder'
import { type ExportBundle, SCHEMA_VERSION } from '../src/ports/repositories'

/** 2026년 시각 (UTC) */
export const at = (mmdd: string, hm = '00:00'): string => `2026-${mmdd}T${hm}:00.000Z`

function splitKey(key: string): { verseId: string; direction: Direction } {
  const [verseId, direction] = key.split(':')
  const found = DIRECTIONS.find((d) => d === direction)
  if (!found) throw new Error(`카드 키의 방향이 올바르지 않다: ${key}`)
  return { verseId: required(verseId, 'verseId'), direction: found }
}

export function stored(
  key: string,
  over: Partial<SerializedCard> & Pick<SerializedCard, 'reps' | 'due'>,
): StoredCard {
  return {
    key,
    ...splitKey(key),
    card: {
      stability: 10,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 10,
      lapses: 0,
      learning_steps: 0,
      state: over.reps === 0 ? State.New : State.Review,
      ...over,
    },
  }
}

export const learn = (verseId: string, step: LadderStep, updatedAt: string): LearnProgress => ({
  verseId,
  step,
  updatedAt,
})

export const review = (cardKey: string, ts: string): ReviewEntry => ({
  cardKey,
  ...splitKey(cardKey),
  mode: 'recite',
  rating: 3,
  accuracy: null,
  peeks: null,
  ts,
})

export const bundle = (over: Partial<ExportBundle> = {}): ExportBundle => ({
  app: 'scripture-memory',
  version: SCHEMA_VERSION,
  exportedAt: at('11-22'),
  cards: [],
  reviews: [],
  learning: [],
  ...over,
})

/** 맥북에서 오래 복습해 온 AS1a:ref — 졸업 08-01, 마지막 복습 10-01, 다음 복습 12-01 */
const macbookAS1a = (verseId = 'AS1a') => ({
  cards: [stored(`${verseId}:ref`, { reps: 8, due: at('12-01'), last_review: at('10-01') })],
  learning: [learn(verseId, 'graduated', at('08-01'))],
})

export interface Scene {
  name: string
  macbook: ExportBundle
  iphone: ExportBundle
}

/** (가) 아이폰에서 '잊음'으로 강등: 카드가 지워지고 단계가 firstLetter */
export const demoted: Scene = {
  name: '(가) 강등 전파',
  macbook: bundle({ ...macbookAS1a(), reviews: [review('AS1a:ref', at('10-01'))] }),
  iphone: bundle({ learning: [learn('AS1a', 'firstLetter', at('11-21'))] }),
}

/** (나) 강등 뒤 아이폰에서 사다리를 다시 통과: 새 카드(reps 0, 복습 전) */
export const regraduated: Scene = {
  name: '(나) 재졸업한 새 카드',
  macbook: bundle(macbookAS1a()),
  iphone: bundle({
    cards: [stored('AS1a:ref', { reps: 0, due: at('11-21') })],
    learning: [learn('AS1a', 'graduated', at('11-21'))],
  }),
}

/** (다) 같은 reps에서 아이폰이 더 늦게 복습: 재학습 간격이라 due는 더 이르다 */
export const laterReview: Scene = {
  name: '(다) 더 늦은 복습',
  macbook: bundle({
    cards: [stored('AS1a:ref', { reps: 5, due: at('12-20'), last_review: at('11-01') })],
    learning: [learn('AS1a', 'graduated', at('08-01'))],
  }),
  iphone: bundle({
    cards: [
      stored('AS1a:ref', { reps: 5, due: at('11-21', '00:10'), last_review: at('11-21') }),
    ],
    learning: [learn('AS1a', 'graduated', at('08-01'))],
  }),
}

/**
 * (라) 옛 규칙(카드는 reps 많은 쪽, 단계는 사다리 순번 높은 쪽)으로 이미 병합해 어긋난
 * 맥북. 구절 셋에 (가)·(나)·(다)의 옛 병합 결과를 그대로 둔다.
 * - AS1a = (가): 카드가 되살아나 있고 learning graduated(08-01)
 * - AS2a = (나): reps 8 카드에 learning graduated(11-21) — 단계 동률이라 늦은 updatedAt
 * - AS3a = (다): due가 늦은 맥북 카드 그대로
 */
export const diverged: Scene = {
  name: '(라) 재연동 수렴',
  macbook: bundle({
    cards: [
      ...macbookAS1a('AS1a').cards,
      ...macbookAS1a('AS2a').cards,
      stored('AS3a:ref', { reps: 5, due: at('12-20'), last_review: at('11-01') }),
    ],
    learning: [
      learn('AS1a', 'graduated', at('08-01')),
      learn('AS2a', 'graduated', at('11-21')),
      learn('AS3a', 'graduated', at('08-01')),
    ],
  }),
  iphone: bundle({
    cards: [
      stored('AS2a:ref', { reps: 0, due: at('11-21') }),
      stored('AS3a:ref', { reps: 5, due: at('11-21', '00:10'), last_review: at('11-21') }),
    ],
    learning: [
      learn('AS1a', 'firstLetter', at('11-21')),
      learn('AS2a', 'graduated', at('11-21')),
      learn('AS3a', 'graduated', at('08-01')),
    ],
  }),
}

export const SCENES: readonly Scene[] = [demoted, regraduated, laterReview, diverged]

/** 비교용: 카드·단계를 키 순으로 */
export const stateOf = (b: Pick<ExportBundle, 'cards' | 'learning'>) => ({
  cards: [...b.cards].sort((x, y) => (x.key < y.key ? -1 : 1)),
  learning: [...b.learning].sort((x, y) => (x.verseId < y.verseId ? -1 : 1)),
})
