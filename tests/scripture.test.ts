import { describe, expect, it } from 'vitest'

import type { Corpus, FullText } from '../src/domain/scripture'
import { parseRef, textOf } from '../src/domain/scripture'

const corpus: Corpus = new Map([
  ['시 119:11', { ref: '시 119:11', text: '내가 주께 범죄치 아니하려 하여' }],
  ['빌 4:6', { ref: '빌 4:6,7', text: '아무 것도 염려하지 말고 오직 모든 일에' }],
  ['빌 4:7', { ref: '빌 4:6,7', text: '아무 것도 염려하지 말고 오직 모든 일에' }],
])

// 사 7은 8-9절이 한 덩어리다 — 8절 자리에 본문을 두고 9절 자리는 null
const full: FullText = {
  시119: ['1절 본문', '2절 본문'],
  사7: ['1절', '2절', '3절', '4절', '5절', '6절', '7절', '8·9절', null, '10절'],
  고후13: ['1절', '2절', '3절'],
}

describe('parseRef', () => {
  it('낱개 절과 구간을 읽는다', () => {
    expect(parseRef('고전 15:52')).toEqual({ book: '고전', chapter: 15, from: 52, to: 52 })
    expect(parseRef('고전 15:52-58')).toEqual({ book: '고전', chapter: 15, from: 52, to: 58 })
  })

  it('표기가 아닌 것과 거꾸로 된 구간은 받지 않는다', () => {
    expect(parseRef('고전 15')).toBeNull()
    expect(parseRef('오늘의 말씀')).toBeNull()
    expect(parseRef('고전 15:58-52')).toBeNull()
  })
})

describe('textOf — 정본 등급 두 단', () => {
  it('495에 있으면 495를 준다 (전문이 실려 있어도)', () => {
    const hit = textOf({ corpus, full: { 시119: ['전문 쪽 11절'] } }, '시 119:11')
    expect(hit).toEqual({
      ref: '시 119:11',
      text: '내가 주께 범죄치 아니하려 하여',
    })
  })

  it('여러 절을 아우르는 암송 구절은 그 구절의 표기를 그대로 쓴다', () => {
    expect(textOf({ corpus, full }, '빌 4:7')?.ref).toBe('빌 4:6,7')
  })

  it('495에 없으면 전문에서 절을 이어붙인다', () => {
    expect(textOf({ corpus, full }, '시 119:1-2')).toEqual({
      ref: '시 119:1-2',
      text: '1절 본문 2절 본문',
    })
  })

  it('전문이 아직 안 실렸으면 495만 답하고 나머지는 장절로 남는다', () => {
    const sources = { corpus, full: null }
    expect(textOf(sources, '시 119:11')?.text).toBe('내가 주께 범죄치 아니하려 하여')
    expect(textOf(sources, '사 7:1')).toBeNull()
  })

  it('없는 장·없는 절은 지어내지 않는다', () => {
    expect(textOf({ corpus, full }, '고후 13:14')).toBeNull()
    expect(textOf({ corpus, full }, '옵 1:1')).toBeNull()
    expect(textOf({ corpus, full }, '사 7:0')).toBeNull()
  })
})

describe('textOf — 합본 절', () => {
  it('뒤 절을 물으면 덩어리를 주고 실제 범위를 밝힌다', () => {
    // '사 7:9'만 물었지만 개역한글은 8-9절을 한 덩어리로 인쇄한다.
    // 요청한 자리로 속여 보여주면 8절이 섞인 사실이 감춰진다.
    expect(textOf({ corpus, full }, '사 7:9')).toEqual({ ref: '사 7:8-9', text: '8·9절' })
  })

  it('앞 절을 물어도 같은 덩어리와 같은 범위를 준다', () => {
    expect(textOf({ corpus, full }, '사 7:8')).toEqual({ ref: '사 7:8-9', text: '8·9절' })
  })

  it('덩어리를 걸친 구간은 본문을 한 번만 잇는다', () => {
    expect(textOf({ corpus, full }, '사 7:8-10')).toEqual({
      ref: '사 7:8-10',
      text: '8·9절 10절',
    })
  })
})
