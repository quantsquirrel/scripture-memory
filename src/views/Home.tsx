import { useEffect, useState } from 'react'
import { collectionOf, sectionOf, sectionsOf, VERSE_BY_ID, VERSES } from '../data/verses'
import { dueCards, getAllCards, getAllLearning, getSetting, nextDueAt, reviewsSince } from '../lib/db'
import { DEFAULT_RETENTION, formatInterval } from '../lib/fsrs'
import {
  computeGoal,
  computeReadiness,
  DEFAULT_GOAL_DATE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  EXAM_RETENTION,
  examModeActive,
  type ExamReadiness,
  type GoalInfo,
} from '../lib/goal'
import { BulletBar, ForecastBars } from '../components/StatCharts'
import {
  dueForecast,
  queueProgress,
  trueRetention,
  type DueForecast,
  type QueueProgress,
  type TrueRetention,
} from '../lib/stats'
import type { LearnProgress } from '../lib/types'

interface HomeData {
  due: number
  dueVerses: number
  overdue: number
  todayReviews: number
  learning: LearnProgress[]
  nextDue: string | null
  goal: GoalInfo
  readiness: ExamReadiness
  examActive: boolean
  queue: QueueProgress
  retention: TrueRetention
  forecast: DueForecast
}

/** "YYYY-MM-DD" → "M/D" */
const formatMonthDay = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function Home({
  onReview,
  onLearn,
  onBrowse,
}: {
  onReview: () => void
  onLearn: (verseId: string) => void
  onBrowse: () => void
}) {
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const retentionSince = new Date(midnight)
    retentionSince.setDate(retentionSince.getDate() - 7)
    void Promise.all([
      dueCards(),
      reviewsSince(retentionSince.toISOString()),
      getAllLearning(),
      getAllCards(),
      nextDueAt(),
      getSetting<string>('goalDate'),
      getSetting<number>('goalBufferDays'),
      getSetting<boolean>('examMode'),
    ]).then(([due, week, learning, cards, next, goalDate, buffer, examMode]) => {
      const gd = goalDate ?? DEFAULT_GOAL_DATE
      const today = week.filter((r) => r.ts >= midnight.toISOString())
      setData({
        due: due.length,
        dueVerses: new Set(due.map((c) => c.verseId)).size,
        overdue: due.filter((c) => c.card.due < midnight.toISOString()).length,
        todayReviews: today.length,
        learning,
        nextDue: next,
        goal: computeGoal(gd, learning, new Date(), buffer ?? DEFAULT_REVIEW_BUFFER_DAYS),
        readiness: computeReadiness(cards, gd),
        examActive: examModeActive(examMode ?? false, gd),
        queue: queueProgress(today, due.length),
        retention: trueRetention(week),
        forecast: dueForecast(cards, 7),
      })
    })
  }, [])

  if (!data) return <p className="muted">불러오는 중…</p>

  // 관측 기억률 눈금: 현재 스케줄러가 겨냥하는 목표 기억률과 정렬
  const retentionTarget = data.examActive ? EXAM_RETENTION : DEFAULT_RETENTION
  const graduated = new Set(data.learning.filter((l) => l.step >= 3).map((l) => l.verseId))
  const inProgress = data.learning.find((l) => l.step > 0 && l.step < 3)
  const nextNew = VERSES.find((v) => !graduated.has(v.id) && v.id !== inProgress?.verseId)
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const newThisWeek = data.learning.filter((l) => l.step >= 3 && l.updatedAt >= weekAgo).length
  const learnEnd = new Date(
    new Date(`${data.goal.goalDate}T12:00:00`).getTime() - data.goal.bufferDays * 86400_000,
  )
  const learnEndLabel = `${learnEnd.getMonth() + 1}/${learnEnd.getDate()}`

  // 진행률 행: 기초 3과정(5확신+8동행+60구절)은 한 묶음, DEP는 섹션별, 180구절은 통째
  const coreKeys = new Set(['AS', 'LV', 'TMS60'])
  const progressRows = [
    {
      key: 'core',
      label: '5확신·8동행·60구절',
      verses: VERSES.filter((v) => coreKeys.has(collectionOf(v).key)),
    },
    ...sectionsOf('DEP').map((s, i) => ({
      key: s.key,
      label: `${i + 1}. ${s.title}`,
      verses: VERSES.filter((v) => sectionOf(v).key === s.key),
    })),
    {
      key: 'TMS180',
      label: '180구절',
      verses: VERSES.filter((v) => collectionOf(v).key === 'TMS180'),
    },
  ]

  return (
    <div>
      <section className="panel">
        <h2>오늘의 복습</h2>
        {data.due > 0 ? (
          <>
            <p>
              <strong className="big-number">{data.dueVerses}</strong>구절 · 카드 {data.due}장이
              기다리고 있습니다
              {data.overdue > 0 && (
                <span className="muted"> · 밀린 카드 {data.overdue}장</span>
              )}
              {data.todayReviews > 0 && (
                <span className="muted"> · 오늘 {data.todayReviews}회 복습</span>
              )}
            </p>
            <button className="btn btn-primary" onClick={onReview}>
              복습 시작
            </button>
          </>
        ) : (
          <p className="muted">
            {data.todayReviews > 0 ? `오늘 ${data.todayReviews}회 복습 완료! ` : ''}
            대기 중인 카드가 없습니다.
            {data.nextDue &&
              ` 다음 복습: ${formatInterval(new Date(data.nextDue).getTime() - Date.now())} 후`}
          </p>
        )}
        {data.queue.rate !== null && (
          <>
            <BulletBar rate={data.queue.rate} />
            <p className="muted small">
              오늘 소화 {data.queue.done}/{data.queue.done + data.queue.remaining}장 (
              {Math.round(data.queue.rate * 100)}%)
            </p>
          </>
        )}
        <ForecastBars forecast={data.forecast} />
        <p className="muted small">
          향후 7일 예보 — 내일 {data.forecast.tomorrow}장 · 하루 평균{' '}
          {Math.round(data.forecast.avgPerDay)}장
        </p>
        {data.examActive && (
          <p className="muted small">
            시험 모드 — 목표 기억률 {Math.round(EXAM_RETENTION * 100)}% 기준으로 복습
            간격을 짧게 잡는 중
          </p>
        )}
      </section>

      <section className="panel">
        <h2>새 구절 학습</h2>
        {!data.goal.past && data.goal.remaining > 0 && (
          <>
            <p>
              <strong className="big-number">D-{data.goal.daysLeft}</strong>{' '}
              <span className="muted">
                {data.goal.goalDate.slice(5).replace('-', '/')}까지 DEP242 완결 · 남은{' '}
                {data.goal.remaining}구절
              </span>
              <br />
              최근 7일 하루 <strong>{data.goal.recentPace.toFixed(1)}</strong>구절 · 필요 페이스
              하루 {data.goal.requiredPace.toFixed(1)}구절
              {data.goal.todayNew > 0 && ` · 오늘 ${data.goal.todayNew}구절`}
              <br />
              {data.goal.projectedDone && data.goal.aheadDays !== null ? (
                <span>
                  이 페이스면 {formatMonthDay(data.goal.projectedDone)} 완료 —{' '}
                  {data.goal.aheadDays > 0 && `마감(${learnEndLabel})보다 ${data.goal.aheadDays}일 여유`}
                  {data.goal.aheadDays < 0 && `마감(${learnEndLabel})보다 ${-data.goal.aheadDays}일 부족`}
                  {data.goal.aheadDays === 0 && `마감(${learnEndLabel})에 딱 맞음`}
                </span>
              ) : (
                <span className="muted">최근 7일 새 구절이 없어 페이스를 잴 수 없습니다</span>
              )}
            </p>
            {data.goal.requiredPace > 0 && (
              <BulletBar
                rate={data.goal.recentPace / (data.goal.requiredPace * 1.5)}
                target={1 / 1.5}
              />
            )}
            <p className="muted small">
              새 구절은 {learnEndLabel}까지 완료 목표 — 마지막 {data.goal.bufferDays}일은
              복습으로 굳히기 (눈금 = 필요 페이스)
            </p>
          </>
        )}
        {data.goal.past && data.goal.remaining > 0 && (
          <p className="muted small">목표일이 지났습니다 — 설정에서 목표일을 조정하세요.</p>
        )}
        {inProgress && (
          <button className="btn" onClick={() => onLearn(inProgress.verseId)}>
            이어서: {VERSE_BY_ID[inProgress.verseId].refAbbr} (단계 {inProgress.step + 1}/4)
          </button>
        )}
        {nextNew ? (
          <button className="btn btn-primary" onClick={() => onLearn(nextNew.id)}>
            다음 구절: {collectionOf(nextNew).short} · {nextNew.refAbbr}
          </button>
        ) : (
          !inProgress && <p>모든 구절을 학습했습니다! 🎉 이제 유지 복습만 하면 됩니다.</p>
        )}
        <p className="muted small">
          이번 주 새 구절 {newThisWeek}개 · 순서: 5확신 → 8동행 → 60구절 → DEP242 → 180구절
        </p>
      </section>

      <section className="panel">
        <h2>진행률</h2>
        <div className="progress">
          <div
            className="progress-fill"
            style={{ width: `${(graduated.size / VERSES.length) * 100}%` }}
          />
        </div>
        <p className="muted small">
          전체 {graduated.size}/{VERSES.length} 구절 암송 중
        </p>
        <div className="progress">
          <div
            className="progress-fill"
            style={{ width: `${(data.readiness.ready / data.readiness.total) * 100}%` }}
          />
        </div>
        <p className="muted small">
          시험 준비 {data.readiness.ready}/{data.readiness.total} — 지금 복습을 멈춰도{' '}
          {data.goal.goalDate.slice(5).replace('-', '/')}에 기억률{' '}
          {Math.round(EXAM_RETENTION * 100)}% 이상으로 예측되는 구절
        </p>
        {data.retention.rate !== null && (
          <>
            <BulletBar rate={data.retention.rate} target={retentionTarget} />
            <p className="muted small">
              지난 7일 기억률 {Math.round(data.retention.rate * 100)}% (눈금 = 목표{' '}
              {Math.round(retentionTarget * 100)}%) · 카드별 하루 첫 시도 {data.retention.total}회
              기준
            </p>
          </>
        )}
        {progressRows.map((row) => {
          const done = row.verses.filter((v) => graduated.has(v.id))
          return (
            <button key={row.key} className="col-row" onClick={onBrowse}>
              <span className="col-label">{row.label}</span>
              <span className="progress col-bar">
                <span
                  className="progress-fill"
                  style={{ width: `${(done.length / row.verses.length) * 100}%` }}
                />
              </span>
              <span className="muted small">
                {done.length}/{row.verses.length}
              </span>
            </button>
          )
        })}
      </section>
    </div>
  )
}
