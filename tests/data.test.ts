import { describe, expect, it } from 'vitest'
import {
  collectionOf,
  COLLECTIONS,
  crumbOf,
  DUPLICATES,
  sectionOf,
  topicOf,
  VERSE_BY_ID,
  VERSES,
} from '../src/data/verses'

describe('verses.json v2 무결성', () => {
  it('컬렉션 4개가 학습 순서대로 정렬된다', () => {
    expect(COLLECTIONS.map((c) => c.key)).toEqual(['AS', 'LV', 'TMS60', 'DEP'])
  })

  it('총 313구절 (5+8+60+240)', () => {
    expect(VERSES).toHaveLength(313)
    const count = (k: string) => VERSES.filter((v) => collectionOf(v).key === k).length
    expect(count('AS')).toBe(5)
    expect(count('LV')).toBe(8)
    expect(count('TMS60')).toBe(60)
    expect(count('DEP')).toBe(240)
  })

  it('id는 유일하고 모든 구절이 계층에 연결된다', () => {
    expect(new Set(VERSES.map((v) => v.id)).size).toBe(VERSES.length)
    for (const v of VERSES) {
      expect(topicOf(v), v.id).toBeDefined()
      expect(sectionOf(v), v.id).toBeDefined()
      expect(collectionOf(v), v.id).toBeDefined()
      expect(v.text.length).toBeGreaterThan(9)
    }
  })

  it('기존 60구절 id와 본문이 보존된다 (사용자 데이터 호환)', () => {
    expect(VERSE_BY_ID['A1a'].text.startsWith('그런즉 누구든지')).toBe(true)
    expect(VERSE_BY_ID['E6b'].refAbbr).toBe('마 5:16')
  })

  it('VERSES 순서가 5확신 → 8동행 → 60구절 → DEP', () => {
    const orders = VERSES.map((v) => collectionOf(v).order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('컬렉션 간 중복 구절을 탐지한다 (60구절 ↔ DEP)', () => {
    const dupIds = Object.values(DUPLICATES).flat()
    expect(dupIds).toContain('B5b') // 계 3:20은 DEP 다리예화에도 있음
    expect(Object.keys(DUPLICATES).length).toBeGreaterThan(10)
  })

  it('crumbOf가 컬렉션·섹션·그룹 경로를 만든다', () => {
    expect(crumbOf(VERSE_BY_ID['A1a'])).toEqual(['60구절', '새로운 삶'])
    expect(crumbOf(VERSE_BY_ID['AS1a'])).toEqual(['5확신'])
    const depBridge = VERSES.find(
      (v) => collectionOf(v).key === 'DEP' && topicOf(v).group === '다리예화',
    )!
    expect(crumbOf(depBridge)).toEqual(['DEP 242', '증거', '다리예화'])
  })
})
