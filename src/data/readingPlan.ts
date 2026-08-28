import raw from './bible365.txt?raw'

/**
 * 365일 통독 계획 (2026-08-18 ~ 2027-08-17).
 *
 * 정본은 `bible365.txt` 한 파일뿐이다 — 생성물을 따로 두지 않으므로 둘이
 * 어긋날 여지가 없다. 형식은 탭 구분 `일차 / ISO 날짜 / 본문`이고, 본문은
 * 공백으로 구분된 `약칭+장` 또는 `약칭+시작-끝` 토큰이다.
 *   1<TAB>2026-08-18<TAB>창1-3
 *   352<TAB>2027-08-04<TAB>딛1-3 몬1
 *
 * 계획의 불변식(365일 연속, 66권 1189장 전수 1회)은 tests/readingPlan.test.ts가
 * 지킨다. 원본 표에서 빠져 있던 삼상 16-17장은 원 계획 문서가 이미 보충했고,
 * 민 32장이 52·53일차에 겹치는 것도 원 계획 그대로다 — "고치지" 말 것.
 */
export interface Portion {
  /** 개역한글 표준 약칭 (예: '창', '고전') */
  book: string
  /** 시작 장 (포함) */
  from: number
  /** 끝 장 (포함) */
  to: number
}

export interface PlanDay {
  /** 1..365 */
  n: number
  /** ISO 날짜 'YYYY-MM-DD' (KST 기준 달력 날짜) */
  date: string
  portions: Portion[]
}

const PORTION_RE = /^(\D+)(\d+)(?:-(\d+))?$/

function parseLine(line: string, lineNo: number): PlanDay {
  const [nRaw, date, body] = line.split('\t')
  if (nRaw === undefined || date === undefined || body === undefined)
    throw new Error(`통독 계획 ${lineNo}행: 탭 구분 3개 필드가 아님`)
  const portions = body.split(' ').map((token) => {
    const m = PORTION_RE.exec(token)
    if (!m) throw new Error(`통독 계획 ${lineNo}행: 본문 토큰 해석 불가 "${token}"`)
    const [, book, fromRaw, toRaw] = m
    if (book === undefined || fromRaw === undefined)
      throw new Error(`통독 계획 ${lineNo}행: 본문 토큰 해석 불가 "${token}"`)
    const from = parseInt(fromRaw, 10)
    return { book, from, to: toRaw === undefined ? from : parseInt(toRaw, 10) }
  })
  return { n: parseInt(nRaw, 10), date, portions }
}

export const PLAN: readonly PlanDay[] = raw
  .trim()
  .split('\n')
  .map((line, i) => parseLine(line, i + 1))

const PLAN_BY_DATE: ReadonlyMap<string, PlanDay> = new Map(PLAN.map((d) => [d.date, d]))

/** KST 달력 날짜 'YYYY-MM-DD'. 앱은 사용자 로컬 자정을 하루 경계로 쓴다. */
export function localDateKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 그 날짜의 통독 분량. 계획 기간(2026-08-18~2027-08-17) 밖이면 null. */
export function planFor(dateKey: string): PlanDay | null {
  return PLAN_BY_DATE.get(dateKey) ?? null
}

/** 사람이 읽는 표기: '창 4-7', '딛 1-3 · 몬 1' */
export function portionLabel(portions: readonly Portion[]): string {
  return portions
    .map((p) => (p.from === p.to ? `${p.book} ${p.from}` : `${p.book} ${p.from}-${p.to}`))
    .join(' · ')
}
