/**
 * 소개 장면의 대본 — 화면에 서는 숫자와 그 숫자에 기대는 문구를 모두 엔진에서 만든다.
 *
 * 채점은 grading.ts(gradeTyping·ratingFromAccuracy), 간격과 기억률은 scheduler.ts의 흔들림 끈
 * 예상치(forecastReviews·recallAfter), 간격 글자는 formatInterval이다. 손으로 적은 숫자는 없다:
 * 엔진 값이 바뀌면 문구도 따라 바뀌고, tests/intro.test.ts가 시안의 문장과 어긋나는지 먼저 알린다.
 * 본문은 verses.json에서 꺼낸다(개역개정이 섞이지 않게 손으로 적지 않는다).
 */
import { scoreTone } from '../../components/DiffView'
import { RATING_LABELS } from '../../components/RatingBar'
import { VERSE_BY_ID, VERSES } from '../../data/verses'
import type { Rating } from '../../domain/card'
import { gradeTyping, ratingFromAccuracy, type TypingGrade } from '../../domain/grading'
import { required } from '../../domain/invariant'
import { DEFAULT_RETENTION, forecastReviews } from '../../domain/scheduler'

/** 장면의 구절 — 로마서 6:23 (5확신 B2a) */
export const VERSE = required(VERSE_BY_ID['B2a'], '소개 장면의 구절 B2a')

/** 흔한 실수 하나: 본문의 '삯'을 '값'으로 적는다 */
export const TYPED = VERSE.text.replace('삯', '값')

/** 오늘의 채점 — 한 글자가 다르다 */
export const GRADED: TypingGrade = gradeTyping(VERSE.text, TYPED)

/** 그 뒤의 복습은 매번 본문 그대로 적는다 */
const PERFECT: TypingGrade = gradeTyping(VERSE.text, VERSE.text)

/** 보여 줄 복습 횟수 — 오늘을 포함해 여섯 번 */
const REVIEWS = 6

/** 회차마다의 채점 */
export const GRADES: readonly TypingGrade[] = [
  GRADED,
  ...Array.from({ length: REVIEWS - 1 }, () => PERFECT),
]

/** 회차마다의 등급 — 채점 증거에서만 나온다 */
export const RATINGS: readonly Rating[] = GRADES.map(ratingFromAccuracy)

/** 오늘 제안하는 등급 */
export const SUGGESTED: Rating = required(RATINGS[0], '첫 등급')

export const FORECAST = forecastReviews(RATINGS)

/** 그래프의 이(齒) 하나 — 복습 한 번에서 다음 기한까지 */
export interface Tooth {
  /** 복습한 날(오늘 = 0) */
  start: number
  /** 그 복습 뒤의 안정도 */
  stability: number
  /** 다음 기한 */
  due: number
  /** 다음 복습까지의 간격 글자 */
  next: string
  score: string
  tone: 'good' | 'warn' | 'bad'
  /** 점수 앞의 표지 — DiffView의 결과 표지와 같다 */
  mark: '✓' | '!'
  rating: string
}

const pct = (x: number): string => `${String(Math.round(x * 100))}%`

export const TEETH: readonly Tooth[] = FORECAST.reviews.map((r, i) => {
  const g = required(GRADES[i], `${String(i + 1)}회 채점`)
  return {
    start: r.day,
    stability: r.stability,
    due: r.due,
    next: r.interval,
    score: pct(g.accuracy),
    tone: scoreTone(g),
    mark: g.perfect ? '✓' : '!',
    rating: RATING_LABELS[r.rating],
  }
})

/** 오늘 복습 뒤로 다시 보지 않으면 — 이 안정도로만 떨어진다 */
export const GHOST_STABILITY = required(TEETH[0], '첫 복습').stability

/** 틀린 자리: 빠뜨린 글자와 대신 적은 글자 (DiffView가 그리는 순서) */
export const MISSED = GRADED.ops.filter((o) => o.type === 'miss').map((o) => o.word)
export const EXTRA = GRADED.ops.filter((o) => o.type === 'extra').map((o) => o.word)

/** 한국어 수 관형사 — '한 글자', '여섯 번' */
const KO_COUNT = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
const koCount = (n: number): string => KO_COUNT[n] ?? String(n)

/** 목적격 조사 — 받침이 있으면 '을', 없으면 '를' */
const objectParticle = (word: string): string => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '을' : '를'
}

const YEAR = 365
const last = required(TEETH.at(-1), '마지막 복습')
const suggestedLabel = RATING_LABELS[SUGGESTED]
const retention = pct(DEFAULT_RETENTION)

export const COPY = {
  /** 낭독기가 읽는 두 축 요약 — 장면은 읽지 않고 이것 한 문단만 읽는다 */
  summary:
    `Ivan의 두 축. 축자 객관 채점: 글자 단위로 대조해 한 글자 차이까지 찾아내고, 그 결과로 등급을 제안합니다. ` +
    `FSRS 간격 반복: 기억할 확률이 ${retention}로 내려오는 날 다시 부르고, 맞힐수록 간격을 늘립니다. ` +
    `채점 결과가 그대로 다음 복습 날짜가 됩니다.`,
  s2Title: '축자 객관 채점',
  s2Lede: ['외웠다는 느낌이 아니라 글자로 확인합니다.', '한 글자만 달라도 찾아냅니다.'],
  s2Note:
    `${koCount(MISSED.length)} 글자가 달라 정확도 ${pct(GRADED.accuracy)}. ` +
    `그래서 ‘${suggestedLabel}’${objectParticle(suggestedLabel)} 제안하고, ` +
    `${FORECAST.preview[SUGGESTED]} 뒤에 다시 부릅니다.`,
  s3Title: 'FSRS 간격 반복',
  s3Lede: [
    `기억할 확률이 ${retention}로 내려오는 날 다시 부르고,`,
    '맞힐수록 간격을 늘립니다.',
  ],
  s3Note:
    `${String(Math.floor(last.start / YEAR))}년 남짓 ${koCount(TEETH.length)} 번 복습하면, ` +
    `다음 복습은 ${String(Math.round((last.due - last.start) / YEAR))}년 뒤입니다.`,
  s3Foot: `앱의 FSRS 기본값(목표 기억률 ${retention})으로 계산한 예상치입니다.`,
  y100: pct(1),
  yRetention: retention,
  x0: '오늘',
  ghost: `복습하지 않으면 ${pct(FORECAST.unreviewedRecall)}`,
  readoutHeads: ['회차', '채점', '등급', '다음 복습'],
  readoutN: TEETH.map((_, i) => `${String(i + 1)}회`),
  readoutNext: TEETH.map((t) => `${t.next} 뒤`),
  s4Title: '글자 그대로, 오래도록',
  s4Course: `네비게이토 암송 과정 ${String(VERSES.length)}구절`,
  axis1Name: '축자 객관 채점',
  axis1Desc: '한 글자 차이까지 채점해 등급을 제안합니다',
  axis2Name: 'FSRS 간격 반복',
  axis2Desc: '잊히기 전에 다시 부르고, 간격을 몇 년까지 늘립니다',
  link: '채점 결과가 그대로 다음 복습 날짜가 됩니다.',
  skip: '건너뛰기',
  start: '시작하기',
  label: 'Ivan 소개',
} as const

/** 그래프 눈금 — 시간축 표지(날수, 이름) */
export const TICKS: readonly (readonly [day: number, label: string])[] = [
  [7, '1주'],
  [30, '1개월'],
  [182, '6개월'],
  [365, '1년'],
  [730, '2년'],
  [1826, '5년'],
]

/** 그래프 바닥의 기억률 */
export const R_MIN = 0.35
