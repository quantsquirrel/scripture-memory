import { retrievabilityAt, State } from './fsrs'
import { type Direction, DIRECTIONS, type ReviewEntry, type StoredCard } from './types'

/** 로컬(Asia/Seoul) 달력일 키 — 하루 경계는 UTC가 아니라 사용자 시간대 기준 */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export interface TrueRetention {
  pass: number
  total: number
  rate: number | null
}

/**
 * Anki 정의의 true retention: 카드당 하루 첫 시도만 표본으로 세고,
 * Again(1)만 실패로 친다. 같은 날 재시도는 집계하지 않아 재도전으로
 * 통과율을 부풀릴 수 없다. 하루 단위 정답률은 노이즈가 커서 쓰지 않고
 * 며칠 창(호출자가 기간을 잘라 전달)으로만 계산한다.
 */
export function trueRetention(entries: ReviewEntry[]): TrueRetention {
  const first = new Map<string, ReviewEntry>()
  const sorted = [...entries].sort((a, b) => (a.ts < b.ts ? -1 : 1))
  for (const e of sorted) {
    const k = `${e.cardKey}@${dayKey(e.ts)}`
    if (!first.has(k)) first.set(k, e)
  }
  let pass = 0
  for (const e of first.values()) if (e.rating >= 2) pass++
  const total = first.size
  return { pass, total, rate: total === 0 ? null : pass / total }
}

export interface QueueProgress {
  /** 오늘 복습한 고유 카드 수 */
  done: number
  /** 현재 대기 중(due)인 카드 수 */
  remaining: number
  rate: number | null
}

/**
 * 오늘의 복습 큐 소화율. 하루 시작 시점의 due 수를 저장하지 않으므로
 * 분모는 '처리분 + 현재 대기분'으로 근사한다. 오늘 복습했지만 다시
 * due가 된 카드(학습 단계·Again)는 양쪽에 잡히며, 큐가 실제로 남아
 * 있는 것이므로 100%가 되지 않는 게 맞다.
 */
export function queueProgress(todayEntries: ReviewEntry[], dueNow: number): QueueProgress {
  const done = new Set(todayEntries.map((e) => e.cardKey)).size
  const denom = done + dueNow
  return { done, remaining: dueNow, rate: denom === 0 ? null : done / denom }
}

export interface DueForecast {
  /** counts[0] = 내일, counts[i] = 오늘부터 i+1일째에 due가 도래하는 카드 수 */
  counts: number[]
  tomorrow: number
  avgPerDay: number
}

/**
 * 향후 부하 예보 (Anki의 Future Due에 대응). 오늘 자정 이전 due
 * (오늘 큐·밀린 카드)는 오늘의 몫이므로 제외한다.
 */
export function dueForecast(
  cards: StoredCard[],
  days: number,
  now: Date = new Date(),
): DueForecast {
  const startOfTomorrow = new Date(now)
  startOfTomorrow.setHours(0, 0, 0, 0)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const base = startOfTomorrow.getTime()
  const counts = new Array<number>(days).fill(0)
  for (const c of cards) {
    const idx = Math.floor((new Date(c.card.due).getTime() - base) / 86400_000)
    if (idx >= 0 && idx < days) counts[idx] = (counts[idx] ?? 0) + 1
  }
  const sum = counts.reduce((a, b) => a + b, 0)
  return { counts, tomorrow: counts[0] ?? 0, avgPerDay: days === 0 ? 0 : sum / days }
}

export interface KnowledgeNow {
  /** 복습 궤도에 오른(New 제외) 카드 수 */
  graded: number
  /** 카드별 예측 기억률의 평균 (0~1). 표본 없으면 null */
  avgRetrievability: number | null
  /** 지금 전부 물어보면 맞힐 것으로 기대되는 카드 수 (기억률 합의 반올림) */
  estKnown: number
}

/**
 * FSRS 예측 기억률로 '지금 아는 양'을 추정한다 (Anki 24.11의
 * average retrievability 통계에 대응). 복습 성과(trueRetention)가 과거
 * 실측이라면 이것은 현재 상태의 모델 예측 — 복습을 쉬면 내려간다.
 */
export function knowledgeNow(cards: StoredCard[], now: Date = new Date()): KnowledgeNow {
  const graded = cards.filter((c) => c.card.state !== State.New)
  let sum = 0
  for (const c of graded) sum += retrievabilityAt(c.card, now)
  return {
    graded: graded.length,
    avgRetrievability: graded.length === 0 ? null : sum / graded.length,
    estKnown: Math.round(sum),
  }
}

export interface Maturity {
  /** 학습·재학습 단계 카드 */
  learning: number
  /** 복습 단계, 간격 21일 미만 */
  young: number
  /** 복습 단계, 간격 21일 이상 (Anki의 mature 기준) */
  mature: number
  total: number
}

/**
 * 카드 성숙도 구성. mature 비중이 커질수록 같은 지식을 더 적은
 * 복습으로 유지하고 있다는 뜻 — 수년 유지 목표의 진척 지표.
 */
export function maturity(cards: StoredCard[]): Maturity {
  let learning = 0
  let young = 0
  let mature = 0
  for (const c of cards) {
    if (c.card.state !== State.Review) learning++
    else if (c.card.scheduled_days >= 21) mature++
    else young++
  }
  return { learning, young, mature, total: cards.length }
}

/** 방향(주제→말씀/장절→말씀/말씀→장절)별 true retention */
export function directionRetention(entries: ReviewEntry[]): Record<Direction, TrueRetention> {
  const out = {} as Record<Direction, TrueRetention>
  for (const d of DIRECTIONS) out[d] = trueRetention(entries.filter((e) => e.direction === d))
  return out
}

export interface SelfGradeCalibration {
  recite: TrueRetention
  objective: TrueRetention
  /** 자가 채점 통과율 − 객관 채점 통과율 (%p). 어느 한쪽 표본이 없으면 null */
  gapPp: number | null
}

/**
 * 자가 채점 보정도: recite(자가 채점) 통과율과 객관 모드(typing/refInput/
 * firstLetter) 통과율의 간극. 간극이 크게 양수면 자가 채점이 후하다는 신호로,
 * 주기적 타이핑 감사(policy.ts)가 잡으려는 현상을 수치로 드러낸다.
 */
export function selfGradeCalibration(entries: ReviewEntry[]): SelfGradeCalibration {
  const recite = trueRetention(entries.filter((e) => e.mode === 'recite'))
  const objective = trueRetention(entries.filter((e) => e.mode !== 'recite'))
  const gapPp =
    recite.rate === null || objective.rate === null
      ? null
      : Math.round((recite.rate - objective.rate) * 100)
  return { recite, objective, gapPp }
}

export interface AccuracySummary {
  /** 평균 축자 정확도 (0~1). 표본 없으면 null */
  avg: number | null
  n: number
}

/** 축자 정확도: accuracy 증거가 남는 객관 모드 시도만 집계 */
export function objectiveAccuracy(entries: ReviewEntry[]): AccuracySummary {
  const withAcc = entries.filter((e) => e.accuracy !== null)
  const n = withAcc.length
  return { avg: n === 0 ? null : withAcc.reduce((a, e) => a + (e.accuracy ?? 0), 0) / n, n }
}

export interface ReviewHistory {
  /** counts[i] = (days−1−i)일 전 복습 횟수 — 마지막 원소가 오늘 */
  counts: number[]
  /** 하루도 빠짐없이 복습한 연속 일수. 오늘 아직 안 했으면 어제까지로 센다 */
  streak: number
  /** counts 범위(최근 days일)의 하루 평균 복습 횟수 */
  avgPerDay: number
}

/**
 * 꾸준함 지표. streak은 counts 창과 무관하게 전체 기록으로 계산하므로
 * 전체 리뷰를 전달해야 한다. 하루 경계는 로컬(Asia/Seoul) 기준.
 */
export function reviewHistory(
  entries: ReviewEntry[],
  days: number,
  now: Date = new Date(),
): ReviewHistory {
  const byDay = new Map<string, number>()
  for (const e of entries) {
    const k = dayKey(e.ts)
    byDay.set(k, (byDay.get(k) ?? 0) + 1)
  }
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const counts = new Array<number>(days).fill(0)
  for (let i = 0; i < days; i++) {
    const d = new Date(startOfToday)
    d.setDate(d.getDate() - (days - 1 - i))
    counts[i] = byDay.get(dayKey(d.toISOString())) ?? 0
  }
  let streak = 0
  const cursor = new Date(startOfToday)
  if ((byDay.get(dayKey(cursor.toISOString())) ?? 0) === 0) cursor.setDate(cursor.getDate() - 1)
  while ((byDay.get(dayKey(cursor.toISOString())) ?? 0) > 0) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  const sum = counts.reduce((a, b) => a + b, 0)
  return { counts, streak, avgPerDay: days === 0 ? 0 : sum / days }
}

/**
 * 하루 단위 순환 선택 (로컬 자정 기준) — 같은 날에는 새로고침해도 같은
 * 항목이 나오고, 날이 바뀌면 다음 항목으로 넘어간다. 무작위가 아니라서
 * items 순서가 유지되는 한 모든 항목이 공평하게 돌아온다.
 */
export function dailyPick<T>(items: T[], now: Date = new Date()): T | null {
  if (items.length === 0) return null
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const localDay = Math.floor(
    (midnight.getTime() - midnight.getTimezoneOffset() * 60_000) / 86400_000,
  )
  return items[localDay % items.length] ?? null
}

export interface WeakVerse {
  verseId: string
  /** 방향 카드들의 lapses 합계 */
  lapses: number
  /** lapses가 가장 많은 방향 */
  worstDirection: Direction
}

/**
 * 취약 구절(leech 후보): 외웠다가 다시 잊은 횟수(lapses)가 많은 순.
 * lapses 0인 구절은 제외 — '자주 넘어지는' 구절만 보여준다.
 */
export function weakVerses(cards: StoredCard[], limit: number): WeakVerse[] {
  const byVerse = new Map<string, StoredCard[]>()
  for (const c of cards) {
    const arr = byVerse.get(c.verseId) ?? []
    arr.push(c)
    byVerse.set(c.verseId, arr)
  }
  const out: WeakVerse[] = []
  for (const [verseId, vc] of byVerse) {
    const lapses = vc.reduce((a, c) => a + c.card.lapses, 0)
    if (lapses === 0) continue
    const worst = vc.reduce((a, c) => (c.card.lapses > a.card.lapses ? c : a))
    out.push({ verseId, lapses, worstDirection: worst.direction })
  }
  return out
    .sort((a, b) => b.lapses - a.lapses || (a.verseId < b.verseId ? -1 : 1))
    .slice(0, limit)
}
