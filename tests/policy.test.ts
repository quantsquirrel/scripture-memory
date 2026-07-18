// 가드레일: 자가 채점(recite)은 주기적 객관 감사와 함께만 존재한다.
// 이 정책이 무너지면 자가 신고가 FSRS 데이터를 무한정 오염시킬 수 있다 — 앱의 창립 가치 위반.
import { describe, expect, it } from 'vitest'
import { reviewMode } from '../src/lib/policy'

describe('reviewMode 정책', () => {
  it('말씀→장절 방향은 언제나 장절 입력(객관 채점)', () => {
    for (const reps of [0, 1, 3, 10, 100]) {
      expect(reviewMode('text', reps)).toBe('refInput')
    }
  })

  it('어린 카드(reps<3)는 첫글자 훈련으로 축자 회상을 강제', () => {
    for (const reps of [0, 1, 2]) {
      expect(reviewMode('topic', reps)).toBe('firstLetter')
      expect(reviewMode('ref', reps)).toBe('firstLetter')
    }
  })

  it('성숙한 카드는 5회마다 타이핑 감사가 낀다', () => {
    expect(reviewMode('topic', 4)).toBe('typing')
    expect(reviewMode('topic', 9)).toBe('typing')
    expect(reviewMode('ref', 14)).toBe('typing')
  })

  it('불변식: 어떤 방향에서도 자가 채점만으로 5회 연속 진행할 수 없다', () => {
    for (const dir of ['topic', 'ref', 'text'] as const) {
      for (let start = 0; start <= 100; start++) {
        const window = [0, 1, 2, 3, 4].map((i) => reviewMode(dir, start + i))
        expect(
          window.some((m) => m !== 'recite'),
          `${dir} reps ${start}~${start + 4}가 전부 recite`,
        ).toBe(true)
      }
    }
  })
})
