import { describe, expect, it } from 'vitest'

import type { LearnProgress } from '../src/domain/ladder'
import { latestGraduatedId, pickNextVerse } from '../src/domain/nextVerse'

const IDS = ['a', 'b', 'c', 'd', 'e'] as const
const at = (
  verseId: string,
  step: LearnProgress['step'],
  updatedAt: string,
): LearnProgress => ({
  verseId,
  step,
  updatedAt,
})

describe('pickNextVerse', () => {
  it('기준이 없으면 처음부터 졸업하지 않은 첫 구절', () => {
    expect(pickNextVerse(IDS, new Set(['a']))).toBe('b')
  })

  it('기준 구절 바로 뒤에서부터 찾는다 — 앞쪽 빈 자리로 되돌아가지 않는다', () => {
    expect(pickNextVerse(IDS, new Set(['a', 'd']), 'd')).toBe('e')
  })

  it('뒤쪽이 다 찼으면 처음으로 돌아가 앞쪽 빈 자리를 채운다', () => {
    expect(pickNextVerse(IDS, new Set(['a', 'd', 'e']), 'e')).toBe('b')
  })

  it('기준 구절 자신은 졸업 전이라도 고르지 않는다', () => {
    expect(pickNextVerse(IDS, new Set(['a', 'b', 'd', 'e']), 'c')).toBeNull()
  })

  it('목록에 없는 기준은 처음부터 찾는다', () => {
    expect(pickNextVerse(IDS, new Set(['a']), 'zz')).toBe('b')
  })

  it('전부 졸업했으면 null', () => {
    expect(pickNextVerse(IDS, new Set(IDS), 'c')).toBeNull()
    expect(pickNextVerse([], new Set())).toBeNull()
  })
})

describe('latestGraduatedId', () => {
  it('가장 최근에 졸업한 구절을 고르고, 졸업이 아닌 기록은 무시한다', () => {
    const learning = [
      at('a', 'graduated', '2026-11-01T00:00:00.000Z'),
      at('d', 'graduated', '2026-11-03T00:00:00.000Z'),
      at('b', 'graduated', '2026-11-02T00:00:00.000Z'),
      // 강등·진행 중 기록이 더 최근이어도 기준을 옮기지 않는다
      at('c', 'typing', '2026-11-05T00:00:00.000Z'),
      at('e', 'intro', '2026-11-06T00:00:00.000Z'),
    ]
    expect(latestGraduatedId(IDS, learning)).toBe('d')
  })

  it('졸업 시각이 같으면 학습 순서상 뒤쪽', () => {
    const t = '2026-11-01T00:00:00.000Z'
    expect(latestGraduatedId(IDS, [at('d', 'graduated', t), at('b', 'graduated', t)])).toBe('d')
    expect(latestGraduatedId(IDS, [at('b', 'graduated', t), at('d', 'graduated', t)])).toBe('d')
  })

  it('목록에 없는 구절(다른 버전 백업)과 빈 기록은 기준이 되지 않는다', () => {
    expect(latestGraduatedId(IDS, [at('zz', 'graduated', '2026-11-09T00:00:00.000Z')])).toBe(
      undefined,
    )
    expect(latestGraduatedId(IDS, [])).toBeUndefined()
  })
})
