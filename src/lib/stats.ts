import type { ReviewEntry, StoredCard } from './types'

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
    if (idx >= 0 && idx < days) counts[idx]++
  }
  const sum = counts.reduce((a, b) => a + b, 0)
  return { counts, tomorrow: counts[0] ?? 0, avgPerDay: days === 0 ? 0 : sum / days }
}
