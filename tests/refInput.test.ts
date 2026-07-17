import { describe, expect, it } from 'vitest'
import { VERSE_BY_ID } from '../src/data/verses'
import { gradeRef, parseRef } from '../src/lib/refInput'

describe('parseRef', () => {
  it('정식 이름과 약칭을 모두 받는다', () => {
    expect(parseRef('고린도후서 5:17')).toEqual({ bookAbbr: '고후', chapter: 5, verses: [17] })
    expect(parseRef('고후5:17')).toEqual({ bookAbbr: '고후', chapter: 5, verses: [17] })
  })

  it('범위와 나열, 장/절 표기를 지원한다', () => {
    expect(parseRef('빌립보서 4:6-7')?.verses).toEqual([6, 7])
    expect(parseRef('빌 4:6,7')?.verses).toEqual([6, 7])
    expect(parseRef('고후 5장 17절')).toEqual({ bookAbbr: '고후', chapter: 5, verses: [17] })
  })

  it('모르는 책 이름은 null', () => {
    expect(parseRef('창세기 1:1')).toBeNull()
  })
})

describe('gradeRef', () => {
  it('A1a 고후 5:17 정답 판정', () => {
    const v = VERSE_BY_ID['A1a']
    expect(gradeRef(v, '고후 5:17')).toBe(true)
    expect(gradeRef(v, '고린도후서 5장 17절')).toBe(true)
    expect(gradeRef(v, '고후 5:16')).toBe(false)
    expect(gradeRef(v, '고전 5:17')).toBe(false)
  })

  it('복수 절 구절(A4b 빌 4:6,7)은 범위/나열 모두 정답', () => {
    const v = VERSE_BY_ID['A4b']
    expect(gradeRef(v, '빌 4:6-7')).toBe(true)
    expect(gradeRef(v, '빌립보서 4:6,7')).toBe(true)
    expect(gradeRef(v, '빌 4:6')).toBe(false)
  })

  it('비연속 절(C6b 시 119:9,11)은 나열만 정답', () => {
    const v = VERSE_BY_ID['C6b']
    expect(gradeRef(v, '시 119:9,11')).toBe(true)
    expect(gradeRef(v, '시편 119:9,11')).toBe(true)
    expect(gradeRef(v, '시 119:9-11')).toBe(false) // 9,10,11은 오답
  })
})
