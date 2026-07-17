import { describe, expect, it } from 'vitest'
import { gradeTyping, ratingFromAccuracy, ratingFromPeeks, tokenize } from '../src/lib/diff'

const TARGET =
  '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새것이 되었도다'

describe('tokenize', () => {
  it('구두점을 제거하고 어절로 나눈다', () => {
    expect(tokenize('보라, 새것이 되었도다!')).toEqual(['보라', '새것이', '되었도다'])
  })
})

describe('gradeTyping', () => {
  it('완전 일치는 perfect', () => {
    const g = gradeTyping(TARGET, TARGET)
    expect(g.perfect).toBe(true)
    expect(g.accuracy).toBe(1)
    expect(ratingFromAccuracy(g)).toBe(3)
  })

  it('구두점·공백 차이는 무시한다', () => {
    const g = gradeTyping(TARGET, '그런즉  누구든지 그리스도 안에 있으면, 새로운 피조물이라 이전 것은 지나갔으니 보라! 새것이 되었도다.')
    expect(g.perfect).toBe(true)
  })

  it('어절 하나 누락 → perfect 아님, miss 표시', () => {
    const g = gradeTyping(TARGET, TARGET.replace(' 보라', ''))
    expect(g.perfect).toBe(false)
    expect(g.ops.some((o) => o.type === 'miss' && o.word === '보라')).toBe(true)
    expect(g.accuracy).toBeCloseTo(12 / 13, 5)
    expect(ratingFromAccuracy(g)).toBe(2) // >=0.9 → Hard
  })

  it('조사 오류(어절 불일치)는 miss+extra로 잡힌다', () => {
    const g = gradeTyping('나를 사랑하는 자는', '나를 사랑하는 자가')
    expect(g.perfect).toBe(false)
    expect(g.ops.filter((o) => o.type === 'miss')).toHaveLength(1)
    expect(g.ops.filter((o) => o.type === 'extra')).toHaveLength(1)
  })

  it('추가 어절도 감점한다', () => {
    const g = gradeTyping('보라 새것이 되었도다', '보라 정말 새것이 되었도다')
    expect(g.perfect).toBe(false)
    expect(g.accuracy).toBeCloseTo(3 / 4, 5)
  })

  it('절반 이하로 틀리면 Again', () => {
    const g = gradeTyping(TARGET, '그런즉 누구든지')
    expect(ratingFromAccuracy(g)).toBe(1)
  })
})

describe('ratingFromPeeks', () => {
  it('0회 Good, 1~2회 Hard, 3회 이상 Again', () => {
    expect(ratingFromPeeks(0)).toBe(3)
    expect(ratingFromPeeks(1)).toBe(2)
    expect(ratingFromPeeks(2)).toBe(2)
    expect(ratingFromPeeks(3)).toBe(1)
  })
})
