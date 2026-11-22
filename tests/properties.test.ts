// property-based 검증: 예시 몇 개가 아니라 불변식을 수백 케이스로 흔들어 본다.
// 반례가 나오면 fast-check가 최소 반례로 줄여서 보고한다.
import { isDeepStrictEqual } from 'node:util'

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { mergeBundles } from '../src/adapters/gist'
import { VERSES } from '../src/data/verses'
import { DIRECTIONS, type Rating, type ReviewEntry, type StoredCard } from '../src/domain/card'
import { gradeTyping, ratingFromAccuracy, toChars, tokenize } from '../src/domain/grading'
import { required } from '../src/domain/invariant'
import type { LadderStep } from '../src/domain/ladder'
import { parseRef } from '../src/domain/ref'
import { newCard, rateCard, reviveCard, serializeCard } from '../src/domain/scheduler'
import type { ExportBundle } from '../src/ports/repositories'
import { at, bundle, learn, review, stateOf, stored } from './mergeScenarios'

/** 한글 어절로 이루어진 본문 — 실제 입력 분포에 가깝게 */
const hangulWord = fc.stringMatching(/^[가-힣]{1,6}$/)
const hangulText = fc
  .array(hangulWord, { minLength: 1, maxLength: 12 })
  .map((ws) => ws.join(' '))

describe('gradeTyping 불변식', () => {
  it('정확도는 항상 0~1 범위다', () => {
    fc.assert(
      fc.property(hangulText, hangulText, (target, attempt) => {
        const { accuracy } = gradeTyping(target, attempt)
        expect(accuracy).toBeGreaterThanOrEqual(0)
        expect(accuracy).toBeLessThanOrEqual(1)
        expect(Number.isNaN(accuracy)).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('동일 입력은 정확도 1.0이고 perfect다', () => {
    fc.assert(
      fc.property(hangulText, (text) => {
        const g = gradeTyping(text, text)
        expect(g.accuracy).toBe(1)
        expect(g.perfect).toBe(true)
        expect(ratingFromAccuracy(g)).toBe(3)
      }),
      { numRuns: 300 },
    )
  })

  it('띄어쓰기만 다르면 여전히 perfect다 (구두점·공백은 비교에서 제외)', () => {
    fc.assert(
      fc.property(hangulText, (text) => {
        expect(gradeTyping(text, text.replace(/\s+/g, '')).perfect).toBe(true)
        expect(gradeTyping(text, text.split('').join(' ')).perfect).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('어절을 지우면 정확도가 단조 감소한다 (증가하지 않는다)', () => {
    fc.assert(
      fc.property(
        fc.array(hangulWord, { minLength: 2, maxLength: 10 }),
        fc.nat(),
        (words, seed) => {
          const target = words.join(' ')
          const dropAt = seed % words.length
          const fewer = words.filter((_, i) => i !== dropAt)
          const before = gradeTyping(target, target).accuracy
          const after = gradeTyping(target, fewer.join(' ')).accuracy
          expect(after).toBeLessThanOrEqual(before)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('어절을 더 지울수록 정확도가 더 낮거나 같다', () => {
    fc.assert(
      fc.property(fc.array(hangulWord, { minLength: 3, maxLength: 10 }), (words) => {
        const target = words.join(' ')
        let prev = 1
        // 뒤에서 하나씩 잘라내며 단조성을 확인
        for (let keep = words.length; keep >= 1; keep--) {
          const acc = gradeTyping(target, words.slice(0, keep).join(' ')).accuracy
          expect(acc).toBeLessThanOrEqual(prev)
          prev = acc
        }
      }),
      { numRuns: 200 },
    )
  })

  it('빈 답안은 정확도 0이고 perfect가 아니다', () => {
    fc.assert(
      fc.property(hangulText, (text) => {
        const g = gradeTyping(text, '')
        expect(g.accuracy).toBe(0)
        expect(g.perfect).toBe(false)
        expect(ratingFromAccuracy(g)).toBe(1)
      }),
      { numRuns: 200 },
    )
  })

  it('ops의 ok+miss 개수는 정답 글자 수와 같다 (표시가 본문을 잃지 않는다)', () => {
    fc.assert(
      fc.property(hangulText, hangulText, (target, attempt) => {
        const g = gradeTyping(target, attempt)
        const fromTarget = g.ops.filter((o) => o.type === 'ok' || o.type === 'miss').length
        expect(fromTarget).toBe(toChars(target).length)
      }),
      { numRuns: 300 },
    )
  })

  it('tokenize는 구두점을 지우고 빈 어절을 남기지 않는다', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        for (const t of tokenize(s)) {
          expect(t).not.toBe('')
          expect(/^[가-힣a-zA-Z0-9]+$/.test(t)).toBe(true)
        }
      }),
      { numRuns: 300 },
    )
  })
})

describe('장절 파서 라운드트립', () => {
  /** ParsedRef → 표준 표기 문자열 */
  const format = (r: { bookAbbr: string; chapter: number; verses: number[] }): string =>
    `${r.bookAbbr} ${r.chapter}:${r.verses.join(',')}`

  it('정본 495구절 전부: 파싱 → 포맷 → 파싱이 같은 결과다', () => {
    for (const v of VERSES) {
      const first = parseRef(`${v.bookAbbr} ${v.chapter}:${v.verses.join(',')}`)
      expect(first, v.id).not.toBeNull()
      const round = parseRef(format(required(first, v.id)))
      expect(round, v.id).toEqual(first)
      // 데이터의 장절과도 일치해야 한다
      expect(required(first, v.id).bookAbbr).toBe(v.bookAbbr)
      expect(required(first, v.id).chapter).toBe(v.chapter)
      expect(required(first, v.id).verses).toEqual(v.verses)
    }
  })

  it('임의의 책·장·절 조합에서 라운드트립이 안정적이다', () => {
    const books = [...new Set(VERSES.map((v) => v.bookAbbr))]
    fc.assert(
      fc.property(
        fc.constantFrom(...books),
        fc.integer({ min: 1, max: 150 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 176 }), { minLength: 1, maxLength: 5 }),
        (book, chapter, verses) => {
          const sorted = [...verses].sort((a, b) => a - b)
          const text = `${book} ${chapter}:${sorted.join(',')}`
          const parsed = parseRef(text)
          expect(parsed).not.toBeNull()
          const p = required(parsed)
          expect(p.chapter).toBe(chapter)
          expect(p.verses).toEqual(sorted)
          expect(parseRef(format(p))).toEqual(p)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('공백·장절 표기 변형이 같은 결과로 정규화된다', () => {
    const books = [...new Set(VERSES.map((v) => v.bookAbbr))]
    fc.assert(
      fc.property(
        fc.constantFrom(...books),
        fc.integer({ min: 1, max: 150 }),
        fc.integer({ min: 1, max: 176 }),
        (book, chapter, verse) => {
          const forms = [
            `${book} ${chapter}:${verse}`,
            `${book}${chapter}:${verse}`,
            `${book} ${chapter}장 ${verse}절`,
            `  ${book}  ${chapter} : ${verse}  `,
          ]
          const results = forms.map((f) => parseRef(f))
          for (const r of results) expect(r).toEqual(results[0])
        },
      ),
      { numRuns: 200 },
    )
  })

  it('범위 표기는 절을 펼치고, 뒤집힌 범위는 거부한다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 20 }),
        (start, span) => {
          const end = start + span
          const parsed = parseRef(`요 3:${start}-${end}`)
          expect(required(parsed).verses).toEqual(
            Array.from({ length: span + 1 }, (_, i) => start + i),
          )
          // 뒤집힌 범위는 null
          if (span > 0) expect(parseRef(`요 3:${end}-${start}`)).toBeNull()
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('카드 직렬화 라운드트립', () => {
  const asStored = (card: ReturnType<typeof newCard>): StoredCard => ({
    key: 'v1:ref',
    verseId: 'v1',
    direction: 'ref',
    card,
  })

  it('serialize → revive → serialize가 같다 (New 카드)', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2020-01-01'),
          max: new Date('2030-01-01'),
          noInvalidDate: true,
        }),
        (d) => {
          const s = newCard(d)
          expect(serializeCard(reviveCard(s))).toEqual(s)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('등급을 임의 순서로 여러 번 적용해도 라운드트립이 유지된다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Rating>(1, 2, 3, 4), { minLength: 1, maxLength: 8 }),
        (ratings) => {
          let card = newCard(new Date('2026-01-01T00:00:00Z'))
          for (const rating of ratings) {
            const at = new Date(new Date(card.due).getTime() + 1000)
            card = rateCard(
              asStored(card),
              { mode: 'typing', rating, accuracy: 1, peeks: null },
              at,
            ).card.card
            // 라운드트립 안정성
            expect(serializeCard(reviveCard(card))).toEqual(card)
            // 영속 필드의 타입 불변식
            expect(typeof card.due).toBe('string')
            expect(Number.isFinite(card.stability)).toBe(true)
            expect(Number.isFinite(card.difficulty)).toBe(true)
            expect(card.reps).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reps는 등급마다 정확히 1 늘고 lapses는 줄지 않는다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Rating>(1, 2, 3, 4), { minLength: 1, maxLength: 10 }),
        (ratings) => {
          let card = newCard(new Date('2026-01-01T00:00:00Z'))
          ratings.forEach((rating, i) => {
            const at = new Date(new Date(card.due).getTime() + 1000)
            const prevLapses = card.lapses
            card = rateCard(
              asStored(card),
              { mode: 'recite', rating, accuracy: null, peeks: null },
              at,
            ).card.card
            expect(card.reps).toBe(i + 1)
            expect(card.lapses).toBeGreaterThanOrEqual(prevLapses)
          })
        },
      ),
      { numRuns: 150 },
    )
  })
})

describe('mergeBundles 병합 속성 (나중에 바뀐 쪽 우선)', () => {
  // 구절·시각을 몇 개로 줄여 같은 키·같은 시각·다른 표기가 자주 겹치게 한다
  const VERSE_IDS = ['AS1a', 'AS2a'] as const
  const STEPS: readonly LadderStep[] = ['intro', 'firstLetter', 'typing', 'graduated']
  const instant = fc
    .tuple(fc.integer({ min: 0, max: 4 }), fc.boolean())
    .map(([m, ms]) => `2026-11-01T00:0${m}:00${ms ? '.000' : ''}Z`)

  const cardArb = fc
    .record({
      verseId: fc.constantFrom(...VERSE_IDS),
      direction: fc.constantFrom(...DIRECTIONS),
      reps: fc.integer({ min: 0, max: 3 }),
      due: instant,
      lastReview: fc.option(instant, { nil: undefined }),
      stability: fc.constantFrom(1, 2),
    })
    .map(({ verseId, direction, reps, due, lastReview, stability }) =>
      stored(`${verseId}:${direction}`, {
        reps,
        due,
        stability,
        ...(lastReview === undefined ? {} : { last_review: lastReview }),
      }),
    )
  const learnArb = fc
    .record({
      verseId: fc.constantFrom(...VERSE_IDS),
      step: fc.constantFrom(...STEPS),
      updatedAt: instant,
    })
    .map(({ verseId, step, updatedAt }) => learn(verseId, step, updatedAt))
  // 같은 키(cardKey|ts|rating)면 같은 기록 — 형식 모델의 '복습 기록은 고유 id'와 같은 가정
  const reviewArb = fc
    .record({
      verseId: fc.constantFrom(...VERSE_IDS),
      direction: fc.constantFrom(...DIRECTIONS),
      ts: instant,
      rating: fc.constantFrom<Rating>(1, 2, 3, 4),
    })
    .map(({ verseId, direction, ts, rating }) => ({
      ...review(`${verseId}:${direction}`, ts),
      rating,
    }))
  const reviewKey = (r: ReviewEntry): string => `${r.cardKey}|${r.ts}|${r.rating}`

  /**
   * 임의 번들. 한 번들 안에서는 키가 겹치지 않는다(저장소가 키로 저장하므로).
   * 암송 목표(goal)는 넣지 않는다 — mergeGoalPrefs는 updatedAt 동률이면 b 쪽을 고르는
   * 기존 동작이라 교환이 아니고, 계약 5에 따라 그대로 둔다.
   */
  const anyBundle = fc
    .record({
      cards: fc.uniqueArray(cardArb, { selector: (c) => c.key, maxLength: 5 }),
      learning: fc.uniqueArray(learnArb, { selector: (l) => l.verseId, maxLength: 2 }),
      reviews: fc.uniqueArray(reviewArb, { selector: reviewKey, maxLength: 4 }),
    })
    .map((over) => bundle(over))

  const stepOf = (b: ExportBundle, verseId: string): LadderStep | undefined =>
    b.learning.find((l) => l.verseId === verseId)?.step

  /** 앱이 지키는 불변식: 카드가 있는 구절은 그 번들에서 졸업이다 */
  const keepsInvariant = (b: ExportBundle): boolean =>
    b.cards.every((c) => stepOf(b, c.verseId) === 'graduated')
  const invariantBundle = anyBundle.map((b) => ({
    ...b,
    cards: b.cards.filter((c) => stepOf(b, c.verseId) === 'graduated'),
  }))

  /** 비교용 정규형: 배열 순서·exportedAt·저장소 id를 뺀다 */
  const norm = (b: ExportBundle) => ({
    ...stateOf(b),
    reviews: b.reviews
      .map(({ id: _id, ...r }) => r)
      .sort((x, y) => (reviewKey(x) < reviewKey(y) ? -1 : 1)),
  })
  const fold = (bs: readonly ExportBundle[]): ExportBundle =>
    bs.slice(1).reduce((acc, b) => mergeBundles(acc, b), required(bs[0]))

  // 제한: 같은 키(cardKey|ts|rating)의 복습 기록은 같은 내용으로 생성한다. 같은 키에 내용이
  // 다른 두 기록은 지금 코드가 뒤 인자 쪽을 남겨 교환이 아니다(기존 동작, 계약 5로 그대로 둔다).
  it('교환: a·b = b·a — 같은 키의 복습 기록은 같은 내용, 암송 목표는 비교에서 뺀다(동률이면 b 쪽인 기존 동작, 계약 5)', () => {
    fc.assert(
      fc.property(anyBundle, anyBundle, (a, b) => {
        expect(norm(mergeBundles(a, b))).toEqual(norm(mergeBundles(b, a)))
      }),
      { numRuns: 500 },
    )
  })

  // 제한: a·a = a는 불변식을 지키는 번들에서만이다. 졸업 전 구절에 카드가 든 번들은 계약 2에
  // 따라 a·a가 그 카드를 내린다 — 앱 경로와 기존 fixture는 이 불변식을 지킨다.
  it('멱등: 임의 번들에서 (a·b)·b = a·b, (a·a)·a = a·a — 불변식을 지키는 번들에서 a·a = a', () => {
    fc.assert(
      fc.property(anyBundle, anyBundle, invariantBundle, (a, b, w) => {
        const ab = mergeBundles(a, b)
        expect(norm(mergeBundles(ab, b))).toEqual(norm(ab))
        const aa = mergeBundles(a, a)
        expect(norm(mergeBundles(aa, a))).toEqual(norm(aa))
        expect(norm(mergeBundles(w, w))).toEqual(norm(w))
      }),
      { numRuns: 500 },
    )
  })

  it('복습 기록 무손실: 입력의 모든 cardKey|ts|rating이 결과에 있고, 없던 기록은 없다', () => {
    fc.assert(
      fc.property(anyBundle, anyBundle, (a, b) => {
        const got = new Set(mergeBundles(a, b).reviews.map(reviewKey))
        const want = new Set([...a.reviews, ...b.reviews].map(reviewKey))
        expect(got).toEqual(want)
      }),
      { numRuns: 500 },
    )
  })

  it('결과에서 학습 단계가 졸업 전인 구절에는 카드가 없다', () => {
    fc.assert(
      fc.property(anyBundle, anyBundle, (a, b) => {
        const m = mergeBundles(a, b)
        for (const c of m.cards)
          expect([undefined, 'graduated']).toContain(stepOf(m, c.verseId))
      }),
      { numRuns: 500 },
    )
  })

  it("입력이 각각 '카드가 있는 구절은 졸업'을 지키면 결과도 지킨다", () => {
    fc.assert(
      fc.property(invariantBundle, invariantBundle, (a, b) => {
        expect(keepsInvariant(mergeBundles(a, b))).toBe(true)
      }),
      { numRuns: 500 },
    )
  })

  it('새로 만든 상태가 없다: 결과의 카드·학습 행은 모두 입력 중 하나와 똑같다', () => {
    fc.assert(
      fc.property(anyBundle, anyBundle, (a, b) => {
        const m = mergeBundles(a, b)
        for (const c of m.cards) expect([...a.cards, ...b.cards]).toContainEqual(c)
        for (const l of m.learning) expect([...a.learning, ...b.learning]).toContainEqual(l)
      }),
      { numRuns: 500 },
    )
  })

  // --- 일관된 이력: 기기 셋이 앱이 하는 일만 하고, 시각은 전역으로 늘어난다 ---

  type Op =
    | { kind: 'graduate' | 'ladder' | 'demote'; dev: number; verseId: string }
    | { kind: 'review'; dev: number; key: string }
    | { kind: 'pair'; dev: number; from: number }

  // 이력은 구절 하나로 — 같은 카드를 여러 기기가 엇갈려 만지게 해야 모서리에 닿는다
  const dev = fc.integer({ min: 0, max: 2 })
  const verse = fc.constant('AS1a')
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    {
      arbitrary: fc.record({ kind: fc.constant('graduate' as const), dev, verseId: verse }),
      weight: 2,
    },
    {
      arbitrary: fc.record({ kind: fc.constant('ladder' as const), dev, verseId: verse }),
      weight: 1,
    },
    {
      arbitrary: fc.record({ kind: fc.constant('demote' as const), dev, verseId: verse }),
      weight: 1,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant('review' as const),
        dev,
        key: fc.tuple(verse, fc.constantFrom(...DIRECTIONS)).map(([v, d]) => `${v}:${d}`),
      }),
      weight: 4,
    },
    { arbitrary: fc.record({ kind: fc.constant('pair' as const), dev, from: dev }), weight: 3 },
  )

  const others = (b: ExportBundle, verseId: string) => ({
    cards: b.cards.filter((c) => c.verseId !== verseId),
    learning: b.learning.filter((l) => l.verseId !== verseId),
  })

  /** Store.graduate·demoteToLadder·learning.put·submitReview와 간편 연동(mergeAll)의 번들 위 대역 */
  function apply(devs: readonly ExportBundle[], op: Op, t: string): ExportBundle {
    const b = required(devs[op.dev])
    switch (op.kind) {
      case 'graduate': {
        // 없는 방향만 새 카드로 — 이미 졸업한 구절(학습 화면 재통과)은 카드를 두고 시각만 오른다
        const missing = DIRECTIONS.map((d) => `${op.verseId}:${d}`)
          .filter((k) => !b.cards.some((c) => c.key === k))
          .map((k) => stored(k, { reps: 0, due: t }))
        return bundle({
          ...b,
          cards: [...b.cards, ...missing],
          learning: [...others(b, op.verseId).learning, learn(op.verseId, 'graduated', t)],
        })
      }
      case 'ladder': {
        // 졸업 전 사다리 한 칸(intro→firstLetter→typing). 졸업한 구절은 typing에서 다시 열려
        // 졸업 전까지 아무것도 쓰지 않는다
        const step = stepOf(b, op.verseId)
        if (step === 'graduated' || step === 'typing') return b
        const next = step === 'firstLetter' ? 'typing' : 'firstLetter'
        return bundle({
          ...b,
          learning: [...others(b, op.verseId).learning, learn(op.verseId, next, t)],
        })
      }
      case 'demote': {
        if (!b.cards.some((c) => c.verseId === op.verseId)) return b
        return bundle({
          ...b,
          ...others(b, op.verseId),
          learning: [...others(b, op.verseId).learning, learn(op.verseId, 'firstLetter', t)],
        })
      }
      case 'review': {
        const card = b.cards.find((c) => c.key === op.key)
        if (!card) return b
        const reps = card.card.reps + 1
        const due = new Date(Date.parse(t) + reps * 86_400_000).toISOString()
        return bundle({
          ...b,
          cards: b.cards.map((c) =>
            c.key === op.key ? stored(op.key, { reps, due, last_review: t }) : c,
          ),
          reviews: [...b.reviews, review(op.key, t)],
        })
      }
      case 'pair':
        return op.from === op.dev ? b : mergeBundles(b, required(devs[op.from]))
    }
  }

  /** 이력을 돌려 모든 시점의 기기 상태(스냅숏)와 기기별 마지막 상태를 모은다 */
  function play(ops: readonly Op[]): { snaps: ExportBundle[]; last: ExportBundle[] } {
    let devs = [bundle(), bundle(), bundle()]
    const snaps = [bundle()]
    ops.forEach((op, i) => {
      const t = new Date(Date.UTC(2026, 10, 1) + (i + 1) * 60_000).toISOString()
      const next = apply(devs, op, t)
      devs = devs.map((d, n) => (n === op.dev ? next : d))
      snaps.push(next)
    })
    return { snaps, last: devs }
  }

  /** 세 번들의 후보: 기기 셋의 마지막 상태와 이력 중 아무 시점 셋 — 순서 있는 세 쌍을 다 본다 */
  const historyArb = fc
    .array(opArb, { minLength: 4, maxLength: 40, size: 'max' })
    .chain((ops) => {
      const { snaps, last } = play(ops)
      const when = fc.integer({ min: 0, max: snaps.length - 1 })
      return fc.tuple(when, when, when).map((idx) => ({
        snaps,
        candidates: [...last, ...idx.map((i) => required(snaps[i]))],
      }))
    })

  /**
   * 접기 순서가 결과를 바꿀 수 있는 유일한 모양: 두 번들 병합의 학습 단계가 졸업 전인데
   * 세 번들 전체로는 졸업이다(셋째 번들의 더 늦은 졸업). 앞쪽 접기에서 졸업 전 단계가
   * 두 번들의 카드를 먼저 버리고, 그 뒤 셋째 번들의 졸업이 이겨도 버린 카드는 돌아오지
   * 않는다. 삭제 표식 없이는 풀 수 없다 — 아래 '알려진 모서리' 테스트.
   */
  function foldOrderMatters(a: ExportBundle, b: ExportBundle, c: ExportBundle): boolean {
    const ab = mergeBundles(a, b)
    const bc = mergeBundles(b, c)
    const abc = mergeBundles(ab, c)
    const pre = (m: ExportBundle, v: string) => {
      const s = stepOf(m, v)
      return s !== undefined && s !== 'graduated'
    }
    return VERSE_IDS.some((v) => stepOf(abc, v) === 'graduated' && (pre(ab, v) || pre(bc, v)))
  }

  const permutations = <T>(xs: readonly T[]): T[][] =>
    xs.length <= 1
      ? [[...xs]]
      : xs.flatMap((x, i) =>
          permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
        )

  /**
   * 모서리에서 지켜야 하는 것: 두 접기 결과가 각각 불변식을 지키고, 두 결과와 세 입력을
   * 주어진 순서(기본: 120가지 전부)로 다시 병합하면 같은 상태로 모인다.
   */
  function expectConverges(
    r1: ExportBundle,
    r2: ExportBundle,
    inputs: readonly ExportBundle[],
    orders: readonly ExportBundle[][] = permutations([r1, r2, ...inputs]),
  ) {
    for (const r of [r1, r2]) {
      expect(keepsInvariant(r)).toBe(true)
      for (const c of r.cards) expect(stepOf(r, c.verseId)).toBe('graduated')
    }
    const healed = norm(mergeBundles(r1, r2))
    for (const order of orders) expect(norm(fold(order))).toEqual(healed)
  }

  it('일관된 이력에서 세 번들 접기 순서 무관: (a·b)·c = a·(b·c) — 알려진 모서리만 예외', () => {
    let differed = 0
    fc.assert(
      fc.property(historyArb, ({ snaps, candidates }) => {
        for (const s of snaps) expect(keepsInvariant(s)).toBe(true) // 이력이 앱의 불변식을 지킨다
        for (const a of candidates) {
          for (const b of candidates) {
            for (const c of candidates) {
              const r1 = mergeBundles(mergeBundles(a, b), c)
              const r2 = mergeBundles(a, mergeBundles(b, c))
              if (!foldOrderMatters(a, b, c)) {
                expect(norm(r1)).toEqual(norm(r2))
                continue
              }
              if (!isDeepStrictEqual(norm(r1), norm(r2))) differed++
              expectConverges(
                r1,
                r2,
                [a, b, c],
                [
                  [r1, a, b, c],
                  [r2, c, b, a],
                  [a, b, c, r1, r2],
                  [c, r2, a, r1, b],
                ],
              )
            }
          }
        }
      }),
      { numRuns: 300 },
    )
    // 생성기가 모서리에 실제로 닿는다 — 닿지 않으면 위 예외 분기는 공허하다
    expect(differed).toBeGreaterThan(0)
  })

  describe('알려진 모서리: 졸업 전 단계 · 옛 졸업 쪽의 더 늦은 카드 · 셋째 번들의 더 늦은 졸업', () => {
    /** 옛 졸업(08-01) 그대로 연동하지 않은 기기 — 11-20에 복습했다 */
    const staleReviewedLate = bundle({
      cards: [stored('AS1a:ref', { reps: 8, due: at('12-20'), last_review: at('11-20') })],
      reviews: [review('AS1a:ref', at('11-20'))],
      learning: [learn('AS1a', 'graduated', at('08-01'))],
    })
    /** 11-15에 사다리를 다시 통과해 졸업 — 새 카드 */
    const regraduatedNew = bundle({
      cards: [stored('AS1a:ref', { reps: 0, due: at('11-15') })],
      learning: [learn('AS1a', 'graduated', at('11-15'))],
    })
    const cases = [
      {
        name: '계약 사례: 11-10 강등, 옛 졸업 쪽이 11-20 복습, 11-15 재졸업한 새 카드',
        a: bundle({
          reviews: [review('AS1a:ref', at('10-01'))],
          learning: [learn('AS1a', 'firstLetter', at('11-10'))],
        }),
        b: staleReviewedLate,
        c: regraduatedNew,
      },
      {
        name: 'F: 졸업 전 단계가 강등이 아니라 연동 안 한 기기의 새 학습 시작(11-10)이어도 같다',
        a: bundle({ learning: [learn('AS1a', 'firstLetter', at('11-10'))] }),
        b: staleReviewedLate,
        c: regraduatedNew,
      },
      {
        name: 'V: 셋째 번들이 졸업한 구절을 학습 화면에서 다시 통과(카드는 옛것) — 복습(10-01)이 강등(11-10)보다 일러도',
        a: bundle({
          reviews: [review('AS1a:ref', at('09-01'))],
          learning: [learn('AS1a', 'firstLetter', at('11-10'))],
        }),
        b: bundle({
          cards: [stored('AS1a:ref', { reps: 8, due: at('12-01'), last_review: at('10-01') })],
          learning: [learn('AS1a', 'graduated', at('08-01'))],
        }),
        c: bundle({
          cards: [stored('AS1a:ref', { reps: 5, due: at('11-01'), last_review: at('09-01') })],
          learning: [learn('AS1a', 'graduated', at('11-15'))],
        }),
      },
    ]

    for (const { name, a, b, c } of cases) {
      it(name, () => {
        expect(foldOrderMatters(a, b, c)).toBe(true)
        const r1 = mergeBundles(mergeBundles(a, b), c)
        const r2 = mergeBundles(a, mergeBundles(b, c))
        // 앞쪽 접기는 a의 졸업 전 단계가 b의 카드를 먼저 버려 c의 카드만 남는다
        expect(r1.cards).toEqual(c.cards)
        expect(r2.cards).toEqual(b.cards)
        expect(r1.learning).toEqual(c.learning)
        expect(r2.learning).toEqual(c.learning)
        // 두 결과 각각 불변식, 결과 둘과 입력 셋을 120가지 순서로 다시 병합해도 b의 카드로 모인다
        expectConverges(r1, r2, [a, b, c])
        expect(mergeBundles(r1, r2).cards).toEqual(b.cards)
      })
    }
  })
})
