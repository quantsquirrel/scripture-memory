import { DEFAULT_GOAL_DATE, EXAM_RETENTION, examModeActive } from '../domain/goal'
import { DEFAULT_RETENTION, setRequestRetention } from '../domain/scheduler'
import type { Store } from '../ports/repositories'

/**
 * 시험 모드 설정을 스케줄러 목표 기억률에 반영한다.
 * 시험일(목표일)이 지나면 설정이 켜져 있어도 기본 체계로 자동 복귀한다.
 */
export async function applySchedulerSettings(
  store: Store,
  now: Date = new Date(),
): Promise<void> {
  const [examMode, goalDate] = await Promise.all([
    store.settings.examMode(),
    store.settings.goalDate(),
  ])
  const active = examModeActive(examMode ?? false, goalDate ?? DEFAULT_GOAL_DATE, now)
  setRequestRetention(active ? EXAM_RETENTION : DEFAULT_RETENTION)
}
