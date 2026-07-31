// property-based 검증: 예시 몇 개가 아니라 불변식을 수백 케이스로 흔들어 본다.
// 반례가 나오면 fast-check가 최소 반례로 줄여서 보고한다.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { VERSES } from '../src/data/verses'
import type { Rating, StoredCard } from '../src/domain/card'
import { gradeTyping, ratingFromAccuracy, toChars, tokenize } from '../src/domain/grading'
import { required } from '../src/domain/invariant'
import { parseRef } from '../src/domain/ref'
import { newCard, rateCard, reviveCard, serializeCard } from '../src/domain/scheduler'

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
