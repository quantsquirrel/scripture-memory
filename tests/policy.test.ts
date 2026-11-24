// 가드레일: 자가 채점(recite)은 주기적 객관 감사와 함께만 존재한다.
// 이 정책이 무너지면 자가 신고가 FSRS 데이터를 무한정 오염시킬 수 있다 — 앱의 창립 가치 위반.
import { describe, expect, it } from 'vitest'

import {
  type Direction,
  DIRECTIONS,
  type Rating,
  type ReviewEntry,
  type ReviewMode,
  type StoredCard,
} from '../src/domain/card'
import { required } from '../src/domain/invariant'
import { hasAuditDebt, orderQueue, reviewMode } from '../src/domain/policy'
import { State } from '../src/domain/scheduler'

const MINUTE_STATES = [State.New, State.Learning, State.Relearning] as const
const ALL_STATES = [...MINUTE_STATES, State.Review] as const

/** 기록 한 줄 — 감사 빚 판정은 mode·rating·ts만 본다 */
let seq = 0
function entry(mode: ReviewMode, rating: Rating, ts?: string): ReviewEntry {
  seq++
  return {
    cardKey: 'v1:topic',
    verseId: 'v1',
    direction: 'topic',
    mode,
    rating,
    accuracy: mode === 'typing' ? (rating === 1 ? 0.2 : 1) : null,
    peeks: mode === 'firstLetter' ? 0 : null,
    ts: ts ?? new Date(Date.UTC(2026, 0, 1) + seq * 86400_000).toISOString(),
  }
}

const review = (reps: number) => ({ state: State.Review, reps })

describe('reviewMode 정책', () => {
  it('말씀→장절 방향은 상태·기록과 무관하게 언제나 장절 입력(객관 채점)', () => {
    const debt = [entry('recite', 1)]
    for (const state of ALL_STATES) {
      for (const reps of [0, 1, 3, 4, 10, 100]) {
        expect(reviewMode('text', { state, reps }, [])).toBe('refInput')
        expect(reviewMode('text', { state, reps }, debt)).toBe('refInput')
      }
    }
  })

  it('규칙 A: 분 단위 단계(새 카드·학습·재학습)는 reps·기록과 무관하게 첫글자 힌트', () => {
    const debt = [entry('typing', 1)]
    for (const dir of ['topic', 'ref'] as const) {
      for (const state of MINUTE_STATES) {
        for (const reps of [0, 1, 2, 3, 4, 9, 50]) {
          expect(reviewMode(dir, { state, reps }, [])).toBe('firstLetter')
          // 감사 빚이 있어도 분 단위 재도전은 감사 차례가 아니다
          expect(reviewMode(dir, { state, reps }, debt)).toBe('firstLetter')
        }
      }
    }
  })

  it('규칙 A: 간격 복습(Review 상태)은 reps가 작아도 첫글자 힌트가 아니다', () => {
    for (const dir of ['topic', 'ref'] as const) {
      for (let reps = 0; reps <= 60; reps++) {
        expect(['recite', 'typing']).toContain(reviewMode(dir, review(reps), []))
      }
    }
    // 졸업 직후 첫 간격 복습(reps 2)은 낭송이다 — 예전 정책은 여기서 첫글자였다
    expect(reviewMode('topic', review(2), [])).toBe('recite')
  })

  it('Review 상태는 5회마다 타이핑 감사가 낀다', () => {
    expect(reviewMode('topic', review(4), [])).toBe('typing')
    expect(reviewMode('topic', review(9), [])).toBe('typing')
    expect(reviewMode('ref', review(14), [])).toBe('typing')
    expect(reviewMode('ref', review(3), [])).toBe('recite')
    expect(reviewMode('ref', review(5), [])).toBe('recite')
  })

  it('규칙 B: 감사 빚이 있는 Review 카드는 5회 차례가 아니어도 타이핑 감사', () => {
    for (const reps of [2, 3, 5, 6, 7, 8]) {
      expect(reviewMode('topic', review(reps), [entry('recite', 1)])).toBe('typing')
      expect(reviewMode('ref', review(reps), [entry('typing', 1)])).toBe('typing')
    }
  })

  it('불변식: 빈 기록에서 어떤 방향·상태로도 자가 채점만으로 5회 연속 진행할 수 없다', () => {
    for (const dir of DIRECTIONS) {
      for (const state of ALL_STATES) {
        for (let start = 0; start <= 100; start++) {
          const window = [0, 1, 2, 3, 4].map((i) =>
            reviewMode(dir, { state, reps: start + i }, []),
          )
          expect(
            window.some((m) => m !== 'recite'),
            `${dir} state ${String(state)} reps ${start}~${start + 4}가 전부 recite`,
          ).toBe(true)
        }
      }
    }
  })

  it('기록은 낭송을 타이핑 감사로 바꿀 수만 있다 — 다른 방식은 기록과 무관 (기록 조회 생략의 근거)', () => {
    const histories: ReviewEntry[][] = [
      [],
      [entry('recite', 1)],
      [entry('typing', 1)],
      [entry('firstLetter', 1)],
      [entry('recite', 1), entry('typing', 3)],
      [entry('typing', 3), entry('recite', 1)],
    ]
    for (const dir of DIRECTIONS) {
      for (const state of ALL_STATES) {
        for (let reps = 0; reps <= 20; reps++) {
          const bare = reviewMode(dir, { state, reps }, [])
          for (const h of histories) {
            const withHistory = reviewMode(dir, { state, reps }, h)
            if (bare === 'recite') expect(['recite', 'typing']).toContain(withHistory)
            else expect(withHistory).toBe(bare)
          }
        }
      }
    }
  })
})

describe('hasAuditDebt — 감사 빚 판정', () => {
  it('기록이 없거나 실패가 없으면 빚이 없다', () => {
    expect(hasAuditDebt([])).toBe(false)
    expect(hasAuditDebt([entry('recite', 3), entry('typing', 3), entry('recite', 4)])).toBe(
      false,
    )
  })

  it("간격 복습 방식(낭송·타이핑)의 '다시'가 빚을 만든다", () => {
    expect(hasAuditDebt([entry('recite', 1)])).toBe(true)
    expect(hasAuditDebt([entry('typing', 1)])).toBe(true)
  })

  it("분 단위 재도전(첫글자)과 장절 입력의 '다시'는 빚을 만들지 않는다", () => {
    expect(hasAuditDebt([entry('firstLetter', 1)])).toBe(false)
    expect(hasAuditDebt([entry('refInput', 1)])).toBe(false)
  })

  it("타이핑 감사를 '다시'가 아닌 등급(어려움 포함)으로 통과하면 빚이 사라진다", () => {
    for (const pass of [2, 3, 4] as const) {
      expect(hasAuditDebt([entry('recite', 1), entry('typing', pass)])).toBe(false)
    }
  })

  it('첫글자 통과·낭송 통과는 빚을 갚지 못한다', () => {
    expect(hasAuditDebt([entry('typing', 1), entry('firstLetter', 3)])).toBe(true)
    expect(
      hasAuditDebt([entry('recite', 1), entry('firstLetter', 4), entry('recite', 3)]),
    ).toBe(true)
  })

  it('감사를 통과한 뒤 다시 틀리면 새 빚이 생긴다 (연속 실패)', () => {
    expect(hasAuditDebt([entry('recite', 1), entry('typing', 3), entry('recite', 1)])).toBe(
      true,
    )
    expect(hasAuditDebt([entry('typing', 1), entry('typing', 1)])).toBe(true)
  })

  it('저장 순서가 아니라 시각(ts)으로 앞뒤를 본다 — 병합·가져오기 순서에 무관', () => {
    const fail = entry('recite', 1, '2026-03-01T00:00:00.000Z')
    const pass = entry('typing', 3, '2026-03-05T00:00:00.000Z')
    expect(hasAuditDebt([pass, fail])).toBe(false)
    expect(hasAuditDebt([fail, pass])).toBe(false)
    const laterFail = entry('typing', 1, '2026-03-09T00:00:00.000Z')
    expect(hasAuditDebt([laterFail, pass, fail])).toBe(true)
  })

  it('문자열이 아니라 시각으로 비교한다 — 가져온 ts의 시간대 오프셋에도 앞뒤가 맞다', () => {
    // 통과 10:00+09:00(=01:00Z) 뒤의 05:00Z '다시'는 빚이다 (문자열로는 앞으로 보인다)
    const pass = entry('typing', 3, '2026-06-01T10:00:00+09:00')
    const fail = entry('recite', 1, '2026-06-01T05:00:00.000Z')
    expect(hasAuditDebt([pass, fail])).toBe(true)
    // 반대로 00:30Z '다시'는 그 통과보다 앞이라 갚은 것이다
    expect(hasAuditDebt([pass, entry('recite', 1, '2026-06-01T00:30:00.000Z')])).toBe(false)
  })

  it('밀리초 유무가 섞인 표기도 시각으로 비교한다 (…00Z 대 …00.500Z)', () => {
    // 문자열로는 'Z'(90) > '.'(46)이라 0.5초 뒤의 '다시'가 앞으로 보였다
    const pass = entry('typing', 3, '2026-03-01T10:00:00Z')
    expect(hasAuditDebt([pass, entry('recite', 1, '2026-03-01T10:00:00.500Z')])).toBe(true)
    // 반대로 '다시' 0.5초 뒤의 통과는 빚을 갚는다
    const fail = entry('recite', 1, '2026-03-01T10:00:00Z')
    expect(hasAuditDebt([fail, entry('typing', 3, '2026-03-01T10:00:00.500Z')])).toBe(false)
  })

  it('통과와 같은 시각의 다시는 빚으로 본다 (객관 감사 쪽으로 닫는다)', () => {
    const ts = '2026-06-01T01:00:00.000Z'
    expect(hasAuditDebt([entry('typing', 3, ts), entry('recite', 1, ts)])).toBe(true)
    // 표기만 다른 같은 시각도 같다
    expect(
      hasAuditDebt([entry('typing', 3, '2026-06-01T10:00:00+09:00'), entry('typing', 1, ts)]),
    ).toBe(true)
  })

  it('읽을 수 없는 시각: 그런 통과는 빚을 갚지 못하고, 그런 다시는 통과가 없으면 빚이다', () => {
    expect(hasAuditDebt([entry('recite', 1, 'not-a-date')])).toBe(true)
    expect(hasAuditDebt([entry('recite', 1), entry('typing', 3, 'not-a-date')])).toBe(true)
    // 제대로 된 통과 뒤에는 시각을 모르는 '다시'를 가장 오래된 것으로 친다
    expect(hasAuditDebt([entry('recite', 1, 'not-a-date'), entry('typing', 3)])).toBe(false)
  })
})

// 가드레일: 복습 큐가 같은 구절의 카드를 연달아 내보내면, 직전 카드가 장절 답을
// 유출해 말씀→장절 객관 채점이 무의미해진다. 또 due 순 고정 정렬은 외운 순서를
// 재생해 순서 단서를 만든다.
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function card(verseId: string, direction: Direction): StoredCard {
  return {
    key: `${verseId}:${direction}`,
    verseId,
    direction,
    card: {
      due: '2026-07-18T00:00:00.000Z',
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: 0,
    },
  }
}

const fullDeck = (verses: string[]) => verses.flatMap((v) => DIRECTIONS.map((d) => card(v, d)))

describe('orderQueue 정책', () => {
  it('입력의 순열이다 — 카드를 잃거나 만들지 않는다', () => {
    const deck = fullDeck(['v1', 'v2', 'v3', 'v4'])
    const out = orderQueue(deck, seeded(1))
    expect(out.map((c) => c.key).sort()).toEqual(deck.map((c) => c.key).sort())
  })

  it('같은 구절의 카드가 연달아 나오지 않는다 (구절 2개 이상)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const out = orderQueue(fullDeck(['v1', 'v2', 'v3', 'v4', 'v5']), seeded(seed))
      for (let i = 1; i < out.length; i++) {
        expect(required(out[i]).verseId, `seed ${seed} 위치 ${i}`).not.toBe(
          required(out[i - 1]).verseId,
        )
      }
    }
  })

  it('같은 구절 카드 사이 간격이 due 구절 수만큼 벌어진다', () => {
    const verses = ['v1', 'v2', 'v3', 'v4', 'v5']
    const out = orderQueue(fullDeck(verses), seeded(7))
    const lastAt = new Map<string, number>()
    out.forEach((c, i) => {
      const prev = lastAt.get(c.verseId)
      if (prev !== undefined) expect(i - prev).toBeGreaterThanOrEqual(verses.length)
      lastAt.set(c.verseId, i)
    })
  })

  it('순서가 셔플된다 — 외운 순서(입력 순서) 그대로 나오지 않는다', () => {
    const deck = fullDeck(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])
    const inputOrder = deck.map((c) => c.key)
    // 시드 몇 개 중 하나라도 입력 순서와 다르면 셔플이 동작하는 것
    const anyShuffled = [1, 2, 3].some(
      (s) =>
        orderQueue(deck, seeded(s))
          .map((c) => c.key)
          .join() !== inputOrder.join(),
    )
    expect(anyShuffled).toBe(true)
  })

  it('같은 시드는 같은 순서(결정적)', () => {
    const deck = fullDeck(['v1', 'v2', 'v3'])
    expect(orderQueue(deck, seeded(9)).map((c) => c.key)).toEqual(
      orderQueue(deck, seeded(9)).map((c) => c.key),
    )
  })

  it('한 구절만 남으면 인접이 불가피 — 그래도 전부 나온다', () => {
    const deck = [...DIRECTIONS.map((d) => card('v1', d)), card('v2', 'ref')]
    const out = orderQueue(deck, seeded(3))
    expect(out).toHaveLength(4)
    expect(out.map((c) => c.key).sort()).toEqual(deck.map((c) => c.key).sort())
  })

  it('빈 큐는 빈 큐', () => {
    expect(orderQueue([], seeded(1))).toEqual([])
  })
})
