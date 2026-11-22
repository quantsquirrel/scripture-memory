import { describe, expect, it } from 'vitest'

import { mergeBundles } from '../src/adapters/gist'
import { required } from '../src/domain/invariant'
import {
  at,
  bundle,
  demoted,
  diverged,
  laterReview,
  learn,
  regraduated,
  review,
  stateOf,
  stored,
} from './mergeScenarios'

describe('mergeBundles', () => {
  it('리뷰는 중복 없이 합집합', () => {
    const shared = review('A1a:ref', '2026-07-16T01:00:00Z')
    const a = bundle({ reviews: [shared, review('A1a:ref', '2026-07-17T01:00:00Z')] })
    const b = bundle({ reviews: [shared, review('A1a:topic', '2026-07-17T02:00:00Z')] })
    const m = mergeBundles(a, b)
    expect(m.reviews).toHaveLength(3)
  })

  it('카드는 마지막 복습이 늦은 쪽이 이긴다 — reps가 적어도', () => {
    const a = bundle({
      cards: [stored('A1a:ref', { reps: 5, due: at('07-20'), last_review: at('07-10') })],
    })
    const b = bundle({
      cards: [stored('A1a:ref', { reps: 3, due: at('09-01'), last_review: at('07-15') })],
    })
    expect(required(mergeBundles(a, b).cards[0]).card.reps).toBe(3)
    expect(required(mergeBundles(b, a).cards[0]).card.reps).toBe(3)
  })

  it('변경 시각이 같으면 reps가 많은 쪽, 그다음 due가 늦은 쪽', () => {
    const same = { last_review: at('07-15') }
    const a = bundle({ cards: [stored('A1a:ref', { reps: 5, due: at('07-20'), ...same })] })
    const b = bundle({ cards: [stored('A1a:ref', { reps: 4, due: at('09-01'), ...same })] })
    expect(required(mergeBundles(a, b).cards[0]).card.reps).toBe(5)
    expect(required(mergeBundles(b, a).cards[0]).card.reps).toBe(5)

    const c = bundle({ cards: [stored('A1a:ref', { reps: 5, due: at('07-20'), ...same })] })
    const d = bundle({ cards: [stored('A1a:ref', { reps: 5, due: at('08-01'), ...same })] })
    expect(required(mergeBundles(c, d).cards[0]).card.due).toBe(at('08-01'))
    expect(required(mergeBundles(d, c).cards[0]).card.due).toBe(at('08-01'))
  })

  it('그래도 같으면 인자 순서와 무관하게 같은 카드를 고른다', () => {
    const base = { reps: 5, due: at('07-20'), last_review: at('07-15') }
    const a = bundle({ cards: [stored('A1a:ref', { ...base, stability: 3 })] })
    const b = bundle({ cards: [stored('A1a:ref', { ...base, stability: 7 })] })
    expect(mergeBundles(a, b).cards).toEqual(mergeBundles(b, a).cards)
  })

  it('복습 전 새 카드는 due가 변경 시각이고, last_review 없는 옛 카드(reps>0)는 가장 오래됐다', () => {
    // 기존 fixture의 AS1a:text 모양 — 옛 버전이 last_review를 남기지 않은 카드
    const legacy = stored('A1a:text', { reps: 1, due: at('07-18') })
    const fresh = stored('A1a:text', { reps: 0, due: at('07-01') })
    const reviewed = stored('A1a:text', { reps: 2, due: at('07-30'), last_review: at('06-01') })
    const pick = (x: typeof legacy, y: typeof legacy) =>
      required(mergeBundles(bundle({ cards: [x] }), bundle({ cards: [y] })).cards[0])
    expect(pick(legacy, fresh)).toEqual(fresh)
    expect(pick(fresh, legacy)).toEqual(fresh)
    expect(pick(legacy, reviewed)).toEqual(reviewed)
    expect(pick(fresh, reviewed)).toEqual(fresh)
  })

  it('읽을 수 없는 시각은 가장 오래된 것으로 친다 — 비교가 돌고 돌아 접기 순서를 타지 않는다', () => {
    // 가져온 번들은 decodeBundle이 막지만 mergeAll의 로컬 행은 거치지 않는다
    const x = bundle({ learning: [learn('AS1a', 'typing', '2026-01-01T00:00:00Z')] })
    const y = bundle({ learning: [learn('AS1a', 'firstLetter', 'invalid')] })
    const z = bundle({ learning: [learn('AS1a', 'intro', '2026-12-01T00:00:00Z')] })
    const stepOf = (m: typeof x) => required(m.learning[0]).step
    expect(stepOf(mergeBundles(x, y))).toBe('typing')
    expect(stepOf(mergeBundles(y, z))).toBe('intro')
    expect(stepOf(mergeBundles(mergeBundles(x, y), z))).toBe('intro')
    expect(stepOf(mergeBundles(x, mergeBundles(y, z)))).toBe('intro')

    const cx = bundle({ cards: [stored('A1a:ref', { reps: 0, due: '2026-07-20T00:00:00Z' })] })
    const cy = bundle({
      cards: [
        stored('A1a:ref', { reps: 1, due: '2026-07-01T00:00:00Z', last_review: 'invalid' }),
      ],
    })
    const cz = bundle({
      cards: [
        stored('A1a:ref', {
          reps: 2,
          due: '2026-07-01T00:00:00Z',
          last_review: '2026-07-01T00:00:00Z',
        }),
      ],
    })
    const repsOf = (m: typeof x) => required(m.cards[0]).card.reps
    expect(repsOf(mergeBundles(cx, cy))).toBe(0)
    expect(repsOf(mergeBundles(cy, cz))).toBe(2)
    expect(repsOf(mergeBundles(mergeBundles(cx, cy), cz))).toBe(0)
    expect(repsOf(mergeBundles(cx, mergeBundles(cy, cz)))).toBe(0)
  })

  it('시각은 표기가 아니라 값으로 비교한다 (…00Z 대 …00.000Z)', () => {
    // 문자열로 비교하면 'Z' > '.'이라 앞쪽이 늦은 것으로 잘못 읽힌다
    const a = bundle({
      cards: [
        stored('A1a:ref', { reps: 3, due: at('07-20'), last_review: '2026-07-15T00:00:00Z' }),
      ],
      learning: [learn('A1a', 'firstLetter', '2026-07-17T00:00:00Z')],
    })
    const b = bundle({
      cards: [
        stored('A1a:ref', {
          reps: 4,
          due: at('07-20'),
          last_review: '2026-07-15T00:00:00.000Z',
        }),
      ],
      learning: [learn('A1a', 'graduated', '2026-07-17T00:00:00.000Z')],
    })
    for (const m of [mergeBundles(a, b), mergeBundles(b, a)]) {
      expect(required(m.learning[0]).step).toBe('graduated')
      expect(required(m.cards[0]).card.reps).toBe(4)
    }
  })

  it('학습 상태는 updatedAt이 늦은 쪽이 이긴다 (같으면 사다리 순번이 높은 쪽)', () => {
    const a = bundle({ learning: [learn('AS1a', 'graduated', '2026-07-16T00:00:00Z')] })
    const b = bundle({ learning: [learn('AS1a', 'firstLetter', '2026-07-17T00:00:00Z')] })
    expect(required(mergeBundles(a, b).learning[0]).step).toBe('firstLetter')
    expect(required(mergeBundles(b, a).learning[0]).step).toBe('firstLetter')

    const c = bundle({ learning: [learn('AS1a', 'typing', '2026-07-17T00:00:00Z')] })
    expect(required(mergeBundles(b, c).learning[0]).step).toBe('typing')
    expect(required(mergeBundles(c, b).learning[0]).step).toBe('typing')
  })

  it('고른 단계가 졸업 전이면 그 구절 카드는 빠지고, 학습 행이 없는 구절의 카드는 남는다', () => {
    const a = bundle({
      cards: [
        stored('AS1a:ref', { reps: 2, due: at('07-20'), last_review: at('07-10') }),
        stored('AS2a:ref', { reps: 2, due: at('07-20'), last_review: at('07-10') }),
      ],
      learning: [learn('AS1a', 'graduated', at('07-01'))],
    })
    const b = bundle({ learning: [learn('AS1a', 'typing', at('07-12'))] })
    const m = mergeBundles(a, b)
    expect(m.cards.map((c) => c.key)).toEqual(['AS2a:ref'])
    expect(m.learning).toEqual([learn('AS1a', 'typing', at('07-12'))])
  })

  it('한쪽이 비어 있으면 다른 쪽 그대로', () => {
    const a = bundle({
      cards: [stored('A1a:ref', { reps: 1, due: '2026-07-18T00:00:00Z' })],
      reviews: [review('A1a:ref', '2026-07-17T01:00:00Z')],
      learning: [learn('A1a', 'graduated', '2026-07-17T00:00:00Z')],
    })
    const m = mergeBundles(a, bundle({}))
    expect(m.cards).toHaveLength(1)
    expect(m.reviews).toHaveLength(1)
    expect(m.learning).toHaveLength(1)
  })
})

describe('간편 연동 증상 — 아이폰 번들을 받은 맥북이 아이폰과 같아진다', () => {
  it('(가) 강등 전파: 카드 0장, firstLetter — 복습 기록은 남는다', () => {
    const m = mergeBundles(demoted.macbook, demoted.iphone)
    expect(m.cards).toEqual([])
    expect(m.learning).toEqual([learn('AS1a', 'firstLetter', at('11-21'))])
    expect(m.reviews).toEqual(demoted.macbook.reviews)
    expect(stateOf(m)).toEqual(stateOf(demoted.iphone))
  })

  it('(나) 재졸업한 새 카드가 reps 많은 옛 카드를 대신한다', () => {
    const m = mergeBundles(regraduated.macbook, regraduated.iphone)
    expect(m.cards).toEqual(regraduated.iphone.cards)
    expect(required(m.cards[0]).card.reps).toBe(0)
    expect(stateOf(m)).toEqual(stateOf(regraduated.iphone))
  })

  it('(다) 같은 reps면 마지막 복습이 늦은 아이폰 상태가 남는다 (due가 더 일러도)', () => {
    const m = mergeBundles(laterReview.macbook, laterReview.iphone)
    expect(required(m.cards[0]).card).toEqual(required(laterReview.iphone.cards[0]).card)
    expect(stateOf(m)).toEqual(stateOf(laterReview.iphone))
  })

  it('(라) 옛 규칙으로 어긋난 맥북도 아이폰 번들을 다시 받으면 아이폰 상태가 된다', () => {
    const m = mergeBundles(diverged.macbook, diverged.iphone)
    expect(stateOf(m)).toEqual(stateOf(diverged.iphone))
    // 한 번 더 받아도 그대로다
    expect(stateOf(mergeBundles(m, diverged.iphone))).toEqual(stateOf(diverged.iphone))
  })
})
