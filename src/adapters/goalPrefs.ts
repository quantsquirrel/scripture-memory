import { isGoalScope } from '../domain/goal'
import type { GoalPrefs } from '../ports/repositories'

/**
 * 암송 목표(목표일·복습 여유·범위)를 기기 사이로 옮기는 규칙.
 *
 * 목표는 settings 스토어에 키 하나씩 저장되고, 셋 중 무엇이든 바뀌면 goalUpdatedAt이
 * 함께 찍힌다. 기기 연동·Gist 동기화·백업은 이 셋을 한 덩어리(GoalPrefs)로 옮긴다 —
 * 필드별로 섞으면 한 기기의 목표일과 다른 기기의 범위가 짝지어진 목표가 생긴다.
 */
export const GOAL_KEYS = {
  date: 'goalDate',
  bufferDays: 'goalBufferDays',
  scope: 'goalScope',
  updatedAt: 'goalUpdatedAt',
} as const

/** 시각이 찍히기 전(이 기능 이전)에 정한 목표는 가장 오래된 것으로 친다 */
const LEGACY_STAMP = new Date(0).toISOString()

/** 'YYYY-MM-DD' — 목표일은 Date 파싱과 문자열 비교 양쪽에 쓰이므로 형식을 고정한다 */
export function isIsoDay(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 저장된 설정 행에서 목표를 읽는다. 한 번도 정하지 않았으면 undefined */
export function readGoalPrefs(get: (key: string) => unknown): GoalPrefs | undefined {
  const date = get(GOAL_KEYS.date)
  const bufferDays = get(GOAL_KEYS.bufferDays)
  const scope = get(GOAL_KEYS.scope)
  const stamp = get(GOAL_KEYS.updatedAt)
  const goal: GoalPrefs = {
    updatedAt:
      typeof stamp === 'string' && !Number.isNaN(Date.parse(stamp)) ? stamp : LEGACY_STAMP,
  }
  if (isIsoDay(date)) goal.date = date
  if (isFiniteNumber(bufferDays)) goal.bufferDays = bufferDays
  if (isGoalScope(scope)) goal.scope = scope
  const touched =
    goal.date !== undefined || goal.bufferDays !== undefined || goal.scope !== undefined
  return touched ? goal : undefined
}

/**
 * 목표를 설정 행으로 펼친다. 값이 없는 필드는 undefined — 저장소는 그 키를 지워
 * 받은 쪽 목표와 똑같아지게 한다(이전 목표일이 남아 새 범위와 섞이지 않게).
 */
export function goalPrefsRows(
  goal: GoalPrefs,
): [key: string, value: string | number | undefined][] {
  return [
    [GOAL_KEYS.date, goal.date],
    [GOAL_KEYS.bufferDays, goal.bufferDays],
    [GOAL_KEYS.scope, goal.scope],
    [GOAL_KEYS.updatedAt, goal.updatedAt],
  ]
}

/**
 * 나중에 바꾼 쪽이 이긴다. 시각이 같으면 b(받은 쪽 — 기기 연동의 상대 기기,
 * Gist의 원격)를 따른다: 둘 다 시각 없는 옛 목표라면 사용자가 코드를 입력해
 * 가져오려 한 쪽이 그 목표다.
 */
export function mergeGoalPrefs(
  a: GoalPrefs | undefined,
  b: GoalPrefs | undefined,
): GoalPrefs | undefined {
  if (!a) return b
  if (!b) return a
  return b.updatedAt >= a.updatedAt ? b : a
}

export const sameGoalPrefs = (a: GoalPrefs | undefined, b: GoalPrefs | undefined): boolean =>
  a?.date === b?.date &&
  a?.bufferDays === b?.bufferDays &&
  a?.scope === b?.scope &&
  a?.updatedAt === b?.updatedAt
