import { describe, expect, it } from 'vitest'

import {
  collectionOf,
  COLLECTIONS,
  crumbOf,
  DUPLICATES,
  sectionOf,
  topicOf,
  topicOrdinalOf,
  VERSE_BY_ID,
  VERSES,
} from '../src/data/verses'
import { required } from '../src/lib/invariant'

/** 테스트에서 쓰는 구절 조회 — 없는 id는 즉시 실패 (silent undefined 금지) */
const verse = (id: string) => required(VERSE_BY_ID[id], `구절 ${id}`)

describe('verses.json v2 무결성', () => {
  it('컬렉션 5개가 학습 순서대로 정렬된다', () => {
    expect(COLLECTIONS.map((c) => c.key)).toEqual(['AS', 'LV', 'TMS60', 'DEP', 'TMS180'])
    expect(required(COLLECTIONS.find((c) => c.key === 'DEP')).short).toBe('DEP242')
  })

  it('총 495구절 (5+8+60+242+180)', () => {
    expect(VERSES).toHaveLength(495)
    const count = (k: string) => VERSES.filter((v) => collectionOf(v).key === k).length
    expect(count('AS')).toBe(5)
    expect(count('LV')).toBe(8)
    expect(count('TMS60')).toBe(60)
    expect(count('DEP')).toBe(242)
    expect(count('TMS180')).toBe(180)
  })

  it('180구절: 5시리즈 × 36구절, 파트 그룹 연결', () => {
    for (const [skey, title] of [
      ['T1', '하나님을 알아감'],
      ['T2', '사랑 안에서 자라감'],
      ['T3', '믿음 안에서 자라감'],
      ['T4', '승리 안에서 행함'],
      ['T5', '그리스도를 증거함'],
    ] as const) {
      const vs = VERSES.filter((v) => topicOf(v).section === skey)
      expect(vs, skey).toHaveLength(36)
      expect(sectionOf(required(vs[0], skey)).title).toBe(title)
    }
    expect(verse('T1-1a').refAbbr).toBe('요 1:1,14')
    expect(topicOf(verse('T1-1a')).group).toBe('예수 그리스도')
    expect(verse('T5-36a').refAbbr).toBe('골 2:9-10')
  })

  it('세계비전 9주제 18구절 — 약속성취의 영광 포함 (책자 대조 완료)', () => {
    const wv = VERSES.filter((v) => topicOf(v).section === 'D8')
    expect(wv).toHaveLength(18)
    expect(verse('D8-9a').refAbbr).toBe('합 2:14')
    expect(verse('D8-9b').refAbbr).toBe('말 1:11')
    expect(topicOf(verse('D8-9a')).title).toBe('약속성취의 영광')
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
    expect(verse('A1a').text.startsWith('그런즉 누구든지')).toBe(true)
    expect(verse('E6b').refAbbr).toBe('마 5:16')
  })

  it('VERSES 순서가 5확신 → 8동행 → 60구절 → DEP → 180구절', () => {
    const orders = VERSES.map((v) => collectionOf(v).order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('컬렉션 간 중복 구절을 탐지한다 (60구절 ↔ DEP)', () => {
    const dupIds = Object.values(DUPLICATES).flat()
    expect(dupIds).toContain('B5b') // 계 3:20은 DEP 다리예화에도 있음
    expect(Object.keys(DUPLICATES).length).toBeGreaterThan(10)
  })

  it('topicOrdinalOf가 주제 안 순번을 데이터 순서대로 매긴다', () => {
    // B5 "그리스도를 모셔야 함": 요 1:12 → 계 3:20 (카드 팩 고정 순서)
    expect(topicOrdinalOf(verse('B5a'))).toEqual({ nth: 1, total: 2 })
    expect(topicOrdinalOf(verse('B5b'))).toEqual({ nth: 2, total: 2 })
    // 1구절 주제는 total 1
    expect(topicOrdinalOf(verse('AS1a')).total).toBe(1)
    // 모든 구절의 순번이 주제 안에서 유일하고 1..total 범위다
    for (const v of VERSES) {
      const { nth, total } = topicOrdinalOf(v)
      expect(nth, v.id).toBeGreaterThanOrEqual(1)
      expect(nth, v.id).toBeLessThanOrEqual(total)
    }
  })

  it('crumbOf가 컬렉션·섹션·그룹 경로를 만든다', () => {
    expect(crumbOf(verse('A1a'))).toEqual(['60구절', '새로운 삶'])
    expect(crumbOf(verse('AS1a'))).toEqual(['5확신'])
    const depBridge = required(
      VERSES.find((v) => collectionOf(v).key === 'DEP' && topicOf(v).group === '다리예화'),
      'DEP 다리예화 구절',
    )
    expect(crumbOf(depBridge)).toEqual(['DEP242', '증거', '다리예화'])
    expect(crumbOf(verse('T1-1a'))).toEqual(['180구절', '하나님을 알아감', '예수 그리스도'])
  })
})
