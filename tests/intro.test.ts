import { describe, expect, it } from 'vitest'

import { gradeTyping, ratingFromAccuracy } from '../src/domain/grading'
import * as scheduler from '../src/domain/scheduler'
import { DEFAULT_RETENTION, forecastReviews, recallAfter } from '../src/domain/scheduler'
import {
  COPY,
  EXTRA,
  FORECAST,
  GRADED,
  MISSED,
  RATINGS,
  SUGGESTED,
  TEETH,
  TYPED,
  VERSE,
} from '../src/views/intro/script'

/**
 * 첫 실행 소개 장면(src/views/intro)의 숫자는 손으로 적지 않고 엔진에서 나온다 — 채점은 grading.ts,
 * 간격·기억률은 scheduler.ts의 흔들림 끈 예상치(forecastReviews). 아래 값은 정본 시안
 * (ivan-intro-motion-v1.html)이 [실제]로 적어 둔 값이다. 엔진(ts-fsrs 판, 가중치, 목표 기억률,
 * 채점 규칙, 간격 표기)이 바뀌면 이 테스트가 먼저 깨진다 — 그때는 장면의 문장이 여전히 참인지
 * 시안과 함께 다시 본다.
 */
describe('소개 장면 — 축자 객관 채점', () => {
  it('롬 6:23의 삯을 값으로 적으면 33글자 중 32글자가 맞아 97%, 제안 등급은 어려움이다', () => {
    expect(VERSE.ref).toBe('로마서 6:23')
    expect(TYPED).not.toBe(VERSE.text)
    expect(TYPED.replace('값', '삯')).toBe(VERSE.text)
    expect(GRADED.perfect).toBe(false)
    expect(Math.round(GRADED.accuracy * 100)).toBe(97)
    expect(ratingFromAccuracy(GRADED)).toBe(2)
    expect(SUGGESTED).toBe(2)
    // DiffView가 그리는 차례: 빠뜨린 글자 다음에 대신 적은 글자
    expect(MISSED).toEqual(['삯'])
    expect(EXTRA).toEqual(['값'])
  })

  it('그 뒤의 복습은 본문 그대로라 100%·좋음이다', () => {
    const perfect = gradeTyping(VERSE.text, VERSE.text)
    expect(perfect.perfect).toBe(true)
    expect(ratingFromAccuracy(perfect)).toBe(3)
    expect(RATINGS).toEqual([2, 3, 3, 3, 3, 3])
    expect(TEETH.map((t) => `${t.mark} ${t.score}`)).toEqual([
      '! 97%',
      '✓ 100%',
      '✓ 100%',
      '✓ 100%',
      '✓ 100%',
      '✓ 100%',
    ])
    expect(TEETH.map((t) => t.rating)).toEqual([
      '어려움',
      '좋음',
      '좋음',
      '좋음',
      '좋음',
      '좋음',
    ])
  })
})

describe('소개 장면 — FSRS 간격 반복 (흔들림 끈 예상치)', () => {
  it('학습을 갓 마친 카드의 등급 칸은 10분/8일/11일/19일이다', () => {
    expect(FORECAST.preview).toEqual({ 1: '10분', 2: '8일', 3: '11일', 4: '19일' })
  })

  it('어려움 뒤로 매번 기한에 좋음이면 8일·26일·2.5개월·7개월·1.3년·3.0년', () => {
    expect(FORECAST.reviews.map((r) => r.interval)).toEqual([
      '8일',
      '26일',
      '2.5개월',
      '7개월',
      '1.3년',
      '3.0년',
    ])
    // 복습한 날과 다음 기한 — 오늘(첫 복습)부터 센 날수
    expect(FORECAST.reviews.map((r) => r.day)).toEqual([0, 8, 34, 111, 315, 803])
    expect(FORECAST.reviews.map((r) => r.due)).toEqual([8, 34, 111, 315, 803, 1881])
    expect(FORECAST.reviews.map((r) => r.stability.toFixed(3))).toEqual([
      '7.517',
      '26.427',
      '77.493',
      '203.747',
      '488.296',
      '1077.943',
    ])
  })

  it('첫 복습 뒤로 다시 보지 않으면 마지막 기한(1881일)에 기억률 43%가 남는다', () => {
    expect(FORECAST.unreviewedRecall).toBeCloseTo(0.42779, 5)
    expect(Math.round(FORECAST.unreviewedRecall * 100)).toBe(43)
  })

  it('망각 곡선은 앱 스케줄러의 것 — 안정도만큼 지나면 목표 기억률(90%)로 내려온다', () => {
    expect(DEFAULT_RETENTION).toBe(0.9)
    for (const r of FORECAST.reviews) {
      expect(recallAfter(r.stability, r.stability)).toBeCloseTo(DEFAULT_RETENTION, 6)
      expect(recallAfter(0, r.stability)).toBe(1)
    }
    expect(recallAfter(1881, FORECAST.reviews[0]?.stability ?? 0)).toBeCloseTo(
      FORECAST.unreviewedRecall,
      6,
    )
  })

  it('흔들림이 없어 몇 번을 계산해도 같다', () => {
    expect(forecastReviews([2, 3, 3, 3, 3, 3])).toEqual(FORECAST)
  })
})

describe('소개 장면 — 숫자에 기대는 문구', () => {
  it('2장: 한 글자가 달라 97%, 어려움을 제안하고 8일 뒤에 다시 부른다', () => {
    expect(COPY.s2Note).toBe(
      '한 글자가 달라 정확도 97%. 그래서 ‘어려움’을 제안하고, 8일 뒤에 다시 부릅니다.',
    )
  })

  it('3장: 2년 남짓 여섯 번 복습하면 다음 복습은 3년 뒤', () => {
    expect(COPY.s3Note).toBe('2년 남짓 여섯 번 복습하면, 다음 복습은 3년 뒤입니다.')
    expect(COPY.s3Lede).toEqual([
      '기억할 확률이 90%로 내려오는 날 다시 부르고,',
      '맞힐수록 간격을 늘립니다.',
    ])
    expect(COPY.s3Foot).toBe('앱의 FSRS 기본값(목표 기억률 90%)으로 계산한 예상치입니다.')
    expect(COPY.ghost).toBe('복습하지 않으면 43%')
    expect([COPY.y100, COPY.yRetention]).toEqual(['100%', '90%'])
    expect(COPY.readoutN).toEqual(['1회', '2회', '3회', '4회', '5회', '6회'])
    expect(COPY.readoutNext).toEqual([
      '8일 뒤',
      '26일 뒤',
      '2.5개월 뒤',
      '7개월 뒤',
      '1.3년 뒤',
      '3.0년 뒤',
    ])
  })

  it('4장과 낭독기 요약: 495구절, 목표 기억률 90%', () => {
    expect(COPY.s4Course).toBe('네비게이토 암송 과정 495구절')
    expect(COPY.summary).toBe(
      'Ivan의 두 축. 축자 객관 채점: 글자 단위로 대조해 한 글자 차이까지 찾아내고, 그 결과로 등급을 제안합니다. ' +
        'FSRS 간격 반복: 기억할 확률이 90%로 내려오는 날 다시 부르고, 맞힐수록 간격을 늘립니다. ' +
        '채점 결과가 그대로 다음 복습 날짜가 됩니다.',
    )
  })
})

describe('소개 장면 — 하드 경계 1: 예상치는 글자·숫자뿐이다', () => {
  /** 얼린 배열·객체 안에 글자와 숫자만 있는가 — 카드(Date를 품은 객체)나 함수가 섞이면 실패 */
  function plainValues(v: unknown, path = 'forecast'): string[] {
    if (typeof v === 'string' || typeof v === 'number') return []
    if (typeof v !== 'object' || v === null) return [`${path}: ${typeof v}`]
    if (v instanceof Date) return [`${path}: Date`]
    const bad = Object.isFrozen(v) ? [] : [`${path}: 얼지 않음`]
    for (const [k, x] of Object.entries(v)) bad.push(...plainValues(x, `${path}.${k}`))
    return bad
  }

  it('forecastReviews는 얼린 글자·숫자만 돌려준다(카드 객체가 없다)', () => {
    expect(plainValues(FORECAST)).toEqual([])
    for (const r of FORECAST.reviews) {
      // 저장할 수 있는 카드의 필드가 결과에 실려 나오지 않는다
      for (const key of ['card', 'state', 'reps', 'lapses', 'last_review', 'difficulty']) {
        expect(r).not.toHaveProperty(key)
      }
    }
  })

  it('recallAfter는 숫자만 받고 숫자만 돌려준다', () => {
    expect(scheduler.recallAfter.length).toBe(2)
    expect(typeof recallAfter(8, 7.5)).toBe('number')
  })

  it('예상치 계산이 앱의 등급 적용 경로를 지나지 않는다(applyRating은 rateCard 한 곳에서만)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/domain/scheduler.ts', 'utf8')
    const body = src.slice(src.indexOf('export function forecastReviews'))
    expect(body).not.toContain('applyRating(')
    expect(body).not.toContain('serializeCard(')
    expect(body).not.toContain('RATED')
  })
})
