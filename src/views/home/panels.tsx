import { Chevron } from '../../components/Chevron'
import { fillStyle } from '../../components/fill'
import type { GoalInfo } from '../../domain/goal'
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
  onReview,
}: {
  due: number
  dueVerses: number
  overdue: number
  upcoming: number
  todayReviews: number
  nextDue: string | null
  now: number
  onReview: () => void
}) {
  const untilNext = nextDue === null ? null : formatInterval(new Date(nextDue).getTime() - now)
  return (
    <section className="panel today">
      <div className="today-head">
        <h2>오늘의 복습</h2>
        <time className="today-date" dateTime={dateAttr(now)}>
          {todayLabel(now)}
        </time>
      </div>
      {due > 0 ? (
        <>
          <p className="today-figure">
            <strong className="big-number">{dueVerses}</strong>
            <span className="today-unit">구절</span>
          </p>
          <p className="today-line">카드 {due}장이 기다리고 있습니다</p>
          {(overdue > 0 || todayReviews > 0) && (
            <ul className="today-meta">
              {overdue > 0 && <li>밀린 카드 {overdue}장</li>}
              {todayReviews > 0 && <li>오늘 {todayReviews}회 복습</li>}
            </ul>
          )}
          <button className="btn btn-primary" onClick={onReview}>
            복습 시작
          </button>
        </>
      ) : upcoming > 0 ? (
        <>
          <p className="today-line">
            다시 도전할 카드 <strong>{upcoming}</strong>장이 잠시 후 돌아옵니다
            {untilNext !== null && ` (${untilNext} 후)`}
          </p>
          {todayReviews > 0 && (
            <ul className="today-meta">
              <li>오늘 {todayReviews}회 복습</li>
            </ul>
          )}
          <button className="btn btn-primary" onClick={onReview}>
            지금 이어서 복습
          </button>
        </>
      ) : (
        <>
          <p className="today-rest">
            {todayReviews > 0 ? `오늘 ${todayReviews}회 복습 완료! ` : ''}
            대기 중인 카드가 없습니다.
          </p>
          {untilNext !== null && (
            <p className="muted small today-rest">다음 복습: {untilNext} 후</p>
          )}
        </>
      )}
    </section>
  )
}

/** "10월 29일 목요일" — 하루치 복습이라는 것을 날짜로 먼저 알린다 */
function todayLabel(now: number): string {
  return new Date(now).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

/** <time datetime>용 현지 날짜 "2026-10-29" */
function dateAttr(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 이만큼 밀리면 카드를 한 장씩 넘기기보다 구절 단위 개정이 덜 지친다 */
export const RECALIBRATE_DUE_THRESHOLD = 30

export function RecalibrateBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="notice-row" onClick={onOpen}>
      <span>
        오랫동안 쉬셨나요? <strong>말씀 상태 개정 모드</strong>로 부담 없이 복귀해 보세요
      </span>
      <Chevron dir="right" />
    </button>
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
  lamp,
  onLearn,
}: {
  goal: GoalInfo
  learnEndLabel: string
  newThisWeek: number
  resume: LearnTarget | null
  next: LearnTarget | null
  /** 이 패널이 오늘의 주 행동을 맡는가 — 복습할 카드가 남았으면 그쪽이 등불이다 */
  lamp: boolean
  onLearn: (verseId: string) => void
}) {
  // 등불은 하나: 이어 할 구절이 있으면 그것이, 없으면 다음 구절이 켜진다
  const lit: 'resume' | 'next' | null = lamp ? (resume ? 'resume' : 'next') : null
  return (
    <section className="panel">
      <h2>새 구절 학습</h2>
      {/* 목표일 페이싱 — D-day 한 줄과 숫자 묶음. 지표는 물러서 있다(원칙 3) */}
      {!goal.past && goal.remaining > 0 && (
        <div className="goal">
          <p className="goal-line">
            <strong className="goal-dday">D-{goal.daysLeft}</strong>
            <span className="muted">
              {goal.goalDate.slice(5).replace('-', '/')}까지 {goal.scopeLabel} 완결
            </span>
          </p>
          <dl className="figures">
            <div>
              <dt>남은</dt>
              <dd>{goal.remaining}구절</dd>
            </div>
            <div>
              <dt>하루 필요</dt>
              <dd>{goal.requiredPace.toFixed(1)}구절</dd>
            </div>
            {goal.todayNew > 0 && (
              <div>
                <dt>오늘</dt>
                <dd>{goal.todayNew}구절</dd>
              </div>
            )}
          </dl>
        </div>
      )}
      {!goal.past && goal.remaining === 0 && (
        <p className="muted small">
          목표 범위({goal.scopeLabel}까지)를 모두 외웠습니다. 설정에서 다음 목표를 정할 수
          있습니다.
        </p>
      )}
      {resume && (
        <button
          className={lit === 'resume' ? 'btn btn-primary' : 'btn'}
          onClick={() => {
            onLearn(resume.id)
          }}
        >
          이어서: {resume.label}
        </button>
      )}
      {next ? (
        <button
          className={lit === 'next' ? 'btn btn-primary' : 'btn'}
          onClick={() => {
            onLearn(next.id)
          }}
        >
          다음 구절: {next.label}
        </button>
      ) : (
        !resume && <p>모든 구절을 학습했습니다! 이제 유지 복습만 하면 됩니다.</p>
      )}
      <p className="muted small panel-note">
        이번 주 새 구절 {newThisWeek}개
        <br />
        {goal.past
          ? '기한 없이 새기는 시기, 마음에 오래 남는 속도로'
          : `새 구절은 ${learnEndLabel}까지, 마지막 ${goal.bufferDays}일은 복습으로 굳히기`}
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

/** 진행률 — 읽는 기록이라 카드에 담지 않고 바닥에 헤어라인 표로 둔다 */
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
    <section className="ground">
      <div className="ground-head">
        <h2>진행률</h2>
        <button className="btn-ghost" onClick={onOpen}>
          목록에서 구절 보기
        </button>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="전체 암송 진행률"
        aria-valuemin={0}
        aria-valuemax={overall.total}
        aria-valuenow={overall.done}
      >
        <div className="progress-fill" style={fillStyle(overall.done, overall.total)} />
      </div>
      <p className="muted small progress-summary">
        전체 {overall.done}/{overall.total} 구절 암송 중
      </p>
      {/* 과정별 막대는 먹빛 — 금색은 전체 막대 하나와 주 행동에만 */}
      <ul className="col-list">
        {rows.map((row) => (
          <li
            key={row.key}
            className={row.done === row.total ? 'col-row is-complete' : 'col-row'}
          >
            <span className="col-label">{row.label}</span>
            <span className="progress progress-ink" aria-hidden="true">
              <span className="progress-fill" style={fillStyle(row.done, row.total)} />
            </span>
            <span className="col-count">
              {row.done}/{row.total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
