import type { GoalInfo } from '../../domain/goal'
import { EXAM_RETENTION } from '../../domain/goal'
import { formatInterval } from '../../domain/scheduler'

/** 프레젠테이션: props만 받는 순수 함수 — 저장소도 시각도 직접 읽지 않는다 */
export function TodayReviewPanel({
  due,
  dueVerses,
  overdue,
  upcoming,
  todayReviews,
  nextDue,
  now,
  examActive,
  onReview,
}: {
  due: number
  dueVerses: number
  overdue: number
  upcoming: number
  todayReviews: number
  nextDue: string | null
  now: number
  examActive: boolean
  onReview: () => void
}) {
  const untilNext = nextDue === null ? null : formatInterval(new Date(nextDue).getTime() - now)
  return (
    <section className="panel">
      <h2>오늘의 복습</h2>
      {due > 0 ? (
        <>
          <p>
            <strong className="big-number">{dueVerses}</strong>구절 · 카드 {due}장이 기다리고
            있습니다
            {overdue > 0 && <span className="muted"> · 밀린 카드 {overdue}장</span>}
            {todayReviews > 0 && <span className="muted"> · 오늘 {todayReviews}회 복습</span>}
          </p>
          <button className="btn btn-primary" onClick={onReview}>
            복습 시작
          </button>
        </>
      ) : upcoming > 0 ? (
        <>
          <p>
            다시 도전할 카드 <strong>{upcoming}</strong>장이 잠시 후 돌아옵니다
            {untilNext !== null && ` (${untilNext} 후)`}
            {todayReviews > 0 && <span className="muted"> · 오늘 {todayReviews}회 복습</span>}
          </p>
          <button className="btn btn-primary" onClick={onReview}>
            지금 이어서 복습
          </button>
        </>
      ) : (
        <p className="muted">
          {todayReviews > 0 ? `오늘 ${todayReviews}회 복습 완료! ` : ''}
          대기 중인 카드가 없습니다.
          {untilNext !== null && ` 다음 복습: ${untilNext} 후`}
        </p>
      )}
      {examActive && (
        <p className="muted small">
          시험 모드 — 목표 기억률 {Math.round(EXAM_RETENTION * 100)}% 기준으로 복습 간격을 짧게
          잡는 중
        </p>
      )}
    </section>
  )
}

export interface LearnTarget {
  id: string
  label: string
}

export function NewVersePanel({
  goal,
  learnEndLabel,
  newThisWeek,
  resume,
  next,
  onLearn,
}: {
  goal: GoalInfo
  learnEndLabel: string
  newThisWeek: number
  resume: LearnTarget | null
  next: LearnTarget | null
  onLearn: (verseId: string) => void
}) {
  return (
    <section className="panel">
      <h2>새 구절 학습</h2>
      {!goal.past && goal.remaining > 0 && (
        <p>
          <strong className="big-number">D-{goal.daysLeft}</strong>{' '}
          <span className="muted">
            {goal.goalDate.slice(5).replace('-', '/')}까지 DEP242 완결 · 남은 {goal.remaining}
            구절 · 하루 {goal.requiredPace.toFixed(1)}구절 필요
            {goal.todayNew > 0 && ` · 오늘 ${goal.todayNew}구절`}
          </span>
        </p>
      )}
      {resume && (
        <button
          className="btn"
          onClick={() => {
            onLearn(resume.id)
          }}
        >
          이어서: {resume.label}
        </button>
      )}
      {next ? (
        <button
          className="btn btn-primary"
          onClick={() => {
            onLearn(next.id)
          }}
        >
          다음 구절: {next.label}
        </button>
      ) : (
        !resume && <p>모든 구절을 학습했습니다! 🎉 이제 유지 복습만 하면 됩니다.</p>
      )}
      <p className="muted small">
        {goal.past
          ? `이번 주 새 구절 ${newThisWeek}개 · 기한 없이 새기는 시기 — 마음에 오래 남는 속도로`
          : `이번 주 새 구절 ${newThisWeek}개 · 새 구절은 ${learnEndLabel}까지, 마지막 ${goal.bufferDays}일은 복습으로 굳히기`}
      </p>
    </section>
  )
}

export interface ProgressBarRow {
  key: string
  label: string
  done: number
  total: number
}

export function ProgressPanel({
  overall,
  rows,
  onOpen,
}: {
  overall: { done: number; total: number }
  rows: readonly ProgressBarRow[]
  onOpen: () => void
}) {
  return (
    <section className="panel">
      <h2>진행률</h2>
      <div className="progress">
        <div
          className="progress-fill"
          style={{ width: `${(overall.done / overall.total) * 100}%` }}
        />
      </div>
      <p className="muted small">
        전체 {overall.done}/{overall.total} 구절 암송 중 — 묵상·마음 밭·훈련 지표는 돌아보기
        탭에서
      </p>
      {rows.map((row) => (
        <button key={row.key} className="col-row" onClick={onOpen}>
          <span className="col-label">{row.label}</span>
          <span className="progress col-bar">
            <span
              className="progress-fill"
              style={{ width: `${(row.done / row.total) * 100}%` }}
            />
          </span>
          <span className="muted small">
            {row.done}/{row.total}
          </span>
        </button>
      ))}
    </section>
  )
}
