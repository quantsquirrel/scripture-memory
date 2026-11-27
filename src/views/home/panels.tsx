import type { ReactNode } from 'react'

import { Chevron } from '../../components/Chevron'
import { Crumb } from '../../components/Crumb'
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
  const head = (
    <>
      <h2>오늘의 복습</h2>
      <time className="today-date" dateTime={dateAttr(now)}>
        {todayLabel(now)}
      </time>
    </>
  )
  // 누를 것이 없으면 카드가 아니다 — 손으로 다루는 것만 카드에 담고, 알림 두 줄은 바닥에 선다
  if (due === 0 && upcoming === 0) {
    return (
      <section className="ground today-rest">
        <div className="ground-head">{head}</div>
        <p>
          {todayReviews > 0 ? `오늘 ${todayReviews}회 복습 완료! ` : ''}
          대기 중인 카드가 없습니다.
        </p>
        {untilNext !== null && <p className="muted small">다음 복습: {untilNext} 후</p>}
      </section>
    )
  }
  return (
    <section className="panel today">
      <div className="today-head">{head}</div>
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
          <HomeAction>
            <button className="btn btn-primary" onClick={onReview}>
              복습 시작
            </button>
          </HomeAction>
        </>
      ) : (
        <>
          <p className="today-line">
            다시 도전할 카드 <strong>{upcoming}</strong>장이 잠시 후 돌아옵니다
            {/* 괄호 묶음은 한 덩어리로 넘어간다 — "(10분"과 "후)"가 갈라지지 않게 */}
            {untilNext !== null && <span className="nowrap"> ({untilNext} 후)</span>}
          </p>
          {todayReviews > 0 && (
            <ul className="today-meta">
              <li>오늘 {todayReviews}회 복습</li>
            </ul>
          )}
          <HomeAction>
            <button className="btn btn-primary" onClick={onReview}>
              지금 이어서 복습
            </button>
          </HomeAction>
        </>
      )}
    </section>
  )
}

/**
 * 오늘의 주 행동(금색 버튼 하나)을 감싸는 자리. PC에서는 카드 안 제자리에 서고,
 * 폰에서는 독 바로 위 쟁반으로 내려선다(home.css) — 무대의 주 행동과 같은 엄지 자리.
 * 문서 순서는 카드 안 그대로라 낭독기와 탭 순서는 "오늘 몇 구절 → 복습 시작"으로 읽힌다.
 * 켜지지 않은 보조 버튼은 감싸지 않는다.
 */
function HomeAction({ lit = true, children }: { lit?: boolean; children: ReactNode }) {
  return lit ? <div className="home-action">{children}</div> : children
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
  /** 줄이지 않은 장절 — 카드 안에서 구절의 이름으로 선다 */
  ref: string
}

/** 사다리를 타던 구절. 본문은 싣지 않는다(타이핑 검증을 앞둔 구절의 정답이라서) */
export interface ResumeTarget extends LearnTarget {
  stepTitle: string
  nth: number
  total: number
}

/** 아직 배우지 않은 다음 구절. 경로(과정 › 단원 › 주제)와 말씀을 함께 비춘다 */
export interface NextTarget extends LearnTarget {
  crumb: readonly string[]
  text: string
}

/**
 * 홈의 새 구절 카드 하단 보조 문구.
 * 정착 기간(bufferDays)이 0인 기본 상태에서는 FSRS 분산을 깨는 별도 마감을 두지 않는다.
 * 사용자가 시험 대비로 버퍼를 켠 경우에만 마감 전후를 구분해 알린다.
 */
export function paceNote(goal: GoalInfo, learnEndLabel: string): string | null {
  if (goal.past) return '기한 없이 새기는 시기, 마음에 오래 남는 속도로'
  if (goal.remaining === 0 || goal.bufferDays <= 0) return null
  if (goal.daysLeft <= goal.bufferDays) {
    return `새 구절 마감(${learnEndLabel})이 지나 마지막 ${goal.bufferDays}일 복습 정착 기간입니다`
  }
  return `새 구절은 ${learnEndLabel}까지, 마지막 ${goal.bufferDays}일은 복습으로 굳히기`
}

/**
 * 새 구절 — 손으로 다루는 카드. 다음에 새길 구절이 학습 1단계 카드와 같은 차례
 * (경로 → 장절 → 말씀)로 작게 서고, 그 아래 버튼이 그 구절로 들어간다.
 * 목표 페이싱 숫자는 읽는 기록이라 진행률 묶음(바닥)으로 내려갔다.
 */
export function NewVersePanel({
  resume,
  next,
  lamp,
  onLearn,
}: {
  resume: ResumeTarget | null
  next: NextTarget | null
  /** 이 패널이 오늘의 주 행동을 맡는가 — 복습할 카드가 남았으면 그쪽이 등불이다 */
  lamp: boolean
  onLearn: (verseId: string) => void
}) {
  // 누를 것이 없으면 카드가 아니다 — 오늘의 복습과 같은 규칙
  if (!resume && !next) {
    return (
      <section className="ground">
        <div className="ground-head">
          <h2>새 구절 학습</h2>
        </div>
        <p>모든 구절을 학습했습니다! 이제 유지 복습만 하면 됩니다.</p>
      </section>
    )
  }
  // 등불은 하나: 이어 할 구절이 있으면 그것이, 없으면 다음 구절이 켜진다
  const lit: 'resume' | 'next' | null = lamp ? (resume ? 'resume' : 'next') : null
  return (
    <section className="panel">
      <h2>새 구절 학습</h2>
      {resume && (
        <div className="learn-item">
          <div className="learn-item-head">
            <h3 className="learn-ref">{resume.ref}</h3>
            <span className="learn-step">
              {resume.stepTitle}{' '}
              <span className="step-of">
                {resume.nth}/{resume.total}
              </span>
            </span>
          </div>
          {/* 무대 윗줄과 같은 사다리 네 칸 — 글자 안내가 옆에 있어 막대는 장식이다 */}
          <ol className="ladder" aria-hidden="true">
            {Array.from({ length: resume.total }, (_, i) => (
              <li
                key={i}
                className={
                  i + 1 < resume.nth
                    ? 'is-done'
                    : i + 1 === resume.nth
                      ? 'is-current'
                      : undefined
                }
              />
            ))}
          </ol>
          <HomeAction lit={lit === 'resume'}>
            <button
              className={lit === 'resume' ? 'btn btn-primary' : 'btn'}
              onClick={() => {
                onLearn(resume.id)
              }}
            >
              이어서: {resume.label}
            </button>
          </HomeAction>
        </div>
      )}
      {next && (
        <div className="learn-item">
          {/* 학습 1단계 카드와 같은 차례 — 경로(카드 머리줄) → 장절 → 말씀 */}
          <p className="learn-crumb">
            <Crumb parts={next.crumb} />
          </p>
          <h3 className="learn-ref">{next.ref}</h3>
          <p className="verse learn-preview">{next.text}</p>
          <HomeAction lit={lit === 'next'}>
            <button
              className={lit === 'next' ? 'btn btn-primary' : 'btn'}
              onClick={() => {
                onLearn(next.id)
              }}
            >
              다음 구절: {next.label}
            </button>
          </HomeAction>
        </div>
      )}
    </section>
  )
}

export interface ProgressBarRow {
  key: string
  label: string
  done: number
  total: number
}

/**
 * 진행률 — 읽는 기록이라 카드에 담지 않고 바닥에 둔다. 목표일 페이싱(D-day 한 줄과
 * 숫자 묶음), 전체 막대, 과정별 표가 한 묶음이다. 지표는 물러서 있다(원칙 3).
 */
export function ProgressPanel({
  goal,
  learnEndLabel,
  newThisWeek,
  overall,
  rows,
  onOpen,
}: {
  goal: GoalInfo
  learnEndLabel: string
  newThisWeek: number
  overall: { done: number; total: number }
  rows: readonly ProgressBarRow[]
  onOpen: () => void
}) {
  const note = paceNote(goal, learnEndLabel)
  // 새 구절 마감이 지난 정착 기간에는 '하루 필요'가 뜻을 잃는다(남은 구절 ÷ 하루) — 화면에서만 감춘다
  const settling = goal.bufferDays > 0 && goal.daysLeft <= goal.bufferDays
  return (
    <section className="ground">
      <div className="ground-head">
        <h2>진행률</h2>
        <button className="btn-ghost" onClick={onOpen}>
          목록에서 구절 보기
        </button>
      </div>
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
            {!settling && (
              <div>
                <dt>하루 필요</dt>
                <dd>{goal.requiredPace.toFixed(1)}구절</dd>
              </div>
            )}
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
        <p className="muted small goal-done">
          목표 범위({goal.scopeLabel}까지)를 모두 외웠습니다. 설정에서 다음 목표를 정할 수
          있습니다.
        </p>
      )}
      <p className="muted small pace-note">
        이번 주 새 구절 {newThisWeek}개
        {note !== null && (
          <>
            <br />
            {note}
          </>
        )}
      </p>
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
            <span className="progress progress-ink progress-thin" aria-hidden="true">
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
