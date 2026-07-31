// 커버리지 공백을 메우는 테스트 — 뷰에서만 쓰이던 도메인 함수와, 예외·경계 분기.
import { describe, expect, it } from 'vitest'

import { firstLetterWords } from '../src/domain/firstLetter'
import { toChars, tokenize, wordBoundaries } from '../src/domain/grading'
import { required } from '../src/domain/invariant'
import { parseRef } from '../src/domain/ref'
import {
  assertRated,
  DEFAULT_RETENTION,
  formatInterval,
  getRequestRetention,
  intervalPreview,
  newCard,
  rateCard,
  retrievabilityAt,
  setRequestRetention,
  toState,
} from '../src/domain/scheduler'
import { dailyPick, dueForecast, reviewHistory } from '../src/domain/stats'

describe('firstLetterWords', () => {
  it('어절별 첫 글자만 힌트로 주고 원문 어절을 보존한다', () => {
    expect(firstLetterWords('보라 새것이 되었도다')).toEqual([
      { word: '보라', hint: '보' },
      { word: '새것이', hint: '새' },
      { word: '되었도다', hint: '되' },
    ])
  })

  it('구두점은 어절에 붙은 채 유지되고 힌트는 첫 글자다', () => {
    expect(firstLetterWords('보라, 새것이!')).toEqual([
      { word: '보라,', hint: '보' },
      { word: '새것이!', hint: '새' },
    ])
  })

  it('연속 공백과 앞뒤 공백은 빈 어절을 만들지 않는다', () => {
    expect(firstLetterWords('  가  나  ')).toEqual([
      { word: '가', hint: '가' },
      { word: '나', hint: '나' },
    ])
  })

  it('빈 문자열은 빈 목록', () => {
    expect(firstLetterWords('')).toEqual([])
    expect(firstLetterWords('   ')).toEqual([])
  })
})

describe('wordBoundaries — diff 표시의 띄어쓰기 복원', () => {
  it('어절 경계 뒤의 정답 글자 인덱스를 표시한다', () => {
    // '보라 새것이' → 글자: 보(0) 라(1) 새(2) 것(3) 이(4), 경계는 라(1) 뒤
    expect([...wordBoundaries('보라 새것이')]).toEqual([1])
  })

  it('구두점은 무시하고 공백만 경계로 센다', () => {
    expect([...wordBoundaries('보라, 새것이')]).toEqual([1])
    expect([...wordBoundaries('보라,새것이')]).toEqual([])
  })

  it('경계 인덱스는 toChars 인덱스와 정렬된다', () => {
    const text = '그런즉 누구든지 그리스도'
    const chars = toChars(text)
    for (const i of wordBoundaries(text)) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(chars.length)
    }
    expect(wordBoundaries(text).size).toBe(tokenize(text).length - 1)
  })

  it('연속 공백은 경계를 겹쳐 세지 않는다', () => {
    expect([...wordBoundaries('보라   새것이')]).toEqual([1])
  })

  it('끝의 공백은 마지막 글자에도 경계를 남긴다 (표시상 무해, 정본 데이터엔 없음)', () => {
    // diff 표시에서 마지막 글자 뒤에 공백 하나가 더 붙을 뿐이고, verses.json의
    // 495구절 모두 앞뒤 공백이 없어 실제 채점 경로에서는 발생하지 않는다.
    expect([...wordBoundaries('보라 새것이 ')]).toEqual([1, 4])
    expect([...wordBoundaries('보라 새것이')]).toEqual([1])
  })
})

describe('required — 무결성 실패 경로', () => {
  it('undefined·null이면 설명과 함께 던진다', () => {
    expect(() => {
      required(undefined, '카드')
    }).toThrow('카드')
    expect(() => required(null, '구절')).toThrow('구절')
    expect(() => {
      required(undefined)
    }).toThrow('값')
  })

  it('0·빈 문자열·false는 통과시킨다 (falsy와 없음을 구분한다)', () => {
    expect(required(0)).toBe(0)
    expect(required('')).toBe('')
    expect(required(false)).toBe(false)
  })
})

describe('스케줄러 보조 함수', () => {
  it('formatInterval이 분·시간·일·개월·년 구간을 모두 표기한다', () => {
    expect(formatInterval(0)).toBe('1분')
    expect(formatInterval(30 * 60_000)).toBe('30분')
    expect(formatInterval(3 * 3600_000)).toBe('3시간')
    expect(formatInterval(47 * 3600_000)).toBe('47시간')
    expect(formatInterval(5 * 86400_000)).toBe('5일')
    expect(formatInterval(29 * 86400_000)).toBe('29일')
    expect(formatInterval(60 * 86400_000)).toBe('2.0개월')
    expect(formatInterval(180 * 86400_000)).toBe('6개월')
    expect(formatInterval(400 * 86400_000)).toBe('1.1년')
  })

  it('intervalPreview는 네 등급 모두 라벨을 주고 다시=가장 짧다', () => {
    const card = newCard(new Date('2026-07-31T00:00:00Z'))
    const p = intervalPreview(card, new Date('2026-07-31T00:00:00Z'))
    expect(Object.keys(p).sort()).toEqual(['1', '2', '3', '4'])
    for (const label of Object.values(p)) expect(label).toMatch(/분|시간|일|개월|년/)
  })

  it('retrievabilityAt은 0~1이고 시간이 지나면 감소한다', () => {
    const t0 = new Date('2026-07-31T00:00:00Z')
    const card = newCard(t0)
    const now = retrievabilityAt(card, t0)
    const later = retrievabilityAt(card, new Date(t0.getTime() + 60 * 86400_000))
    expect(now).toBeGreaterThanOrEqual(0)
    expect(now).toBeLessThanOrEqual(1)
    expect(later).toBeLessThanOrEqual(now)
  })

  it('setRequestRetention은 같은 값이면 아무 일도 하지 않는다', () => {
    const before = getRequestRetention()
    setRequestRetention(before)
    expect(getRequestRetention()).toBe(before)
    setRequestRetention(0.95)
    expect(getRequestRetention()).toBe(0.95)
    setRequestRetention(DEFAULT_RETENTION)
    expect(getRequestRetention()).toBe(DEFAULT_RETENTION)
  })

  it('toState는 알 수 없는 상태 숫자를 거부한다 (손상된 데이터 차단)', () => {
    expect(toState(0)).toBe(0)
    expect(toState(3)).toBe(3)
    expect(() => toState(7)).toThrow('알 수 없는 카드 상태')
    expect(() => toState(-1)).toThrow()
    expect(() => toState(1.5)).toThrow()
  })
})

describe('assertRated — 위조 커밋 차단의 마지막 방어선', () => {
  const stored = {
    key: 'v1:ref',
    verseId: 'v1',
    direction: 'ref' as const,
    card: newCard(new Date('2026-07-31T00:00:00Z')),
  }

  it('rateCard가 만든 결과는 통과한다', () => {
    const rated = rateCard(stored, { mode: 'typing', rating: 3, accuracy: 1, peeks: null })
    expect(() => {
      assertRated(rated)
    }).not.toThrow()
  })

  it('브랜드가 없거나 객체가 아니면 거부한다', () => {
    for (const bogus of [null, undefined, 'rated', 42, {}, { card: stored }]) {
      expect(() => {
        assertRated(bogus as never)
      }).toThrow(/rateCard/)
    }
  })

  it('구조가 손상되었거나 증거가 비면 거부한다', () => {
    const real = rateCard(stored, { mode: 'recite', rating: 3, accuracy: null, peeks: null })
    // card/entry가 객체가 아닌 경우
    expect(() => {
      assertRated({ ...real, card: 'nope' } as never)
    }).toThrow(/손상/)
    // 증거의 모드·등급이 빠진 경우
    expect(() => {
      assertRated({ ...real, entry: {} } as never)
    }).toThrow(/증거\(모드·등급\)/)
    // 증거의 시각이 날짜가 아닌 경우
    expect(() => {
      assertRated({ ...real, entry: { ...real.entry, ts: '언제인가' } })
    }).toThrow(/시각/)
  })
})

describe('장절 파서 거부 경로', () => {
  it('형식이 아예 다르면 null', () => {
    for (const bad of ['', '고후', '5:17', 'John 3:16', '고후 5', '고후 5:']) {
      expect(parseRef(bad), bad).toBeNull()
    }
  })

  it('절 목록이 숫자가 아니면 null', () => {
    expect(parseRef('고후 5:가')).toBeNull()
    expect(parseRef('고후 5:17a')).toBeNull()
  })

  it('범위 폭이 20을 넘으면 거부한다 (오타 방지)', () => {
    // 가드는 (끝 − 시작) > 20 이므로 1-21(21절)까지 허용, 1-22부터 거부
    expect(required(parseRef('시 119:1-21')).verses).toHaveLength(21)
    expect(parseRef('시 119:1-22')).toBeNull()
    expect(parseRef('시 119:5-1')).toBeNull() // 뒤집힌 범위
  })

  it('빈 절 항목은 건너뛰고 남은 절로 판정한다', () => {
    expect(required(parseRef('빌 4:6,,7')).verses).toEqual([6, 7])
    expect(parseRef('빌 4:,')).toBeNull()
  })
})

describe('통계 경계 분기', () => {
  it('dueForecast는 days=0이면 평균 0', () => {
    expect(dueForecast([], 0, new Date('2026-07-31T12:00:00+09:00'))).toEqual({
      counts: [],
      tomorrow: 0,
      avgPerDay: 0,
    })
  })

  it('reviewHistory는 days=0이면 평균 0이고 창이 비어 있다', () => {
    const h = reviewHistory([], 0, new Date('2026-07-31T12:00:00+09:00'))
    expect(h.counts).toEqual([])
    expect(h.avgPerDay).toBe(0)
    expect(h.streak).toBe(0)
  })

  it('dailyPick은 항목이 하나면 매일 같은 것을 준다', () => {
    const items = ['only']
    expect(dailyPick(items, new Date('2026-07-31T00:10:00+09:00'))).toBe('only')
    expect(dailyPick(items, new Date('2026-08-05T23:50:00+09:00'))).toBe('only')
  })
})
