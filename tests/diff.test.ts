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

  it('구두점 차이는 무시한다', () => {
    const g = gradeTyping(TARGET, '그런즉 누구든지 그리스도 안에 있으면, 새로운 피조물이라 이전 것은 지나갔으니 보라! 새것이 되었도다.')
    expect(g.perfect).toBe(true)
  })

  it('띄어쓰기 차이는 정답 판정에 영향을 주지 않는다', () => {
    // 붙여쓰기
    expect(gradeTyping('감당할 시험 밖에는', '감당할시험밖에는').perfect).toBe(true)
    // 과다·불규칙 띄어쓰기
    expect(gradeTyping('감당할 시험 밖에는', '감 당 할  시험  밖에는').perfect).toBe(true)
    // 어절 경계만 옮긴 경우도 100%
    expect(gradeTyping('감당할 시험 밖에는', '감당할시험 밖에는').accuracy).toBe(1)
    // 정답의 어절 띄어쓰기와 무관하게 전체 붙여써도 통과
    expect(gradeTyping(TARGET, TARGET.replace(/\s+/g, '')).perfect).toBe(true)
  })

  it("글자가 틀리면(허락지→허락치) 오답으로 잡는다", () => {
    const g = gradeTyping('허락지 아니하시고', '허락치 아니하시고')
    expect(g.perfect).toBe(false)
    expect(g.ops.some((o) => o.type === 'miss' && o.word === '지')).toBe(true)
    expect(g.ops.some((o) => o.type === 'extra' && o.word === '치')).toBe(true)
  })

  it('한 어절 누락 → perfect 아님, 해당 글자 miss', () => {
    const g = gradeTyping(TARGET, TARGET.replace(' 보라', ''))
    expect(g.perfect).toBe(false)
    const missed = g.ops.filter((o) => o.type === 'miss').map((o) => o.word).join('')
    expect(missed).toBe('보라')
    expect(g.accuracy).toBeCloseTo(40 / 42, 5)
    expect(ratingFromAccuracy(g)).toBe(2) // >=0.9 → Hard
  })

  it('조사 오류(글자 불일치)는 miss+extra로 잡힌다', () => {
    const g = gradeTyping('나를 사랑하는 자는', '나를 사랑하는 자가')
    expect(g.perfect).toBe(false)
    expect(g.ops.filter((o) => o.type === 'miss')).toHaveLength(1)
    expect(g.ops.filter((o) => o.type === 'extra')).toHaveLength(1)
  })

  it('추가 글자도 감점한다', () => {
    const g = gradeTyping('보라 새것이 되었도다', '보라 정말 새것이 되었도다')
    expect(g.perfect).toBe(false)
    // 정답 9글자, 답안 11글자 → matched 9 / max 11
    expect(g.accuracy).toBeCloseTo(9 / 11, 5)
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
