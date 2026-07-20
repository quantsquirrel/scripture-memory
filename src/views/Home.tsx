import { useEffect, useState } from 'react'
import { collectionOf, sectionOf, sectionsOf, VERSE_BY_ID, VERSES } from '../data/verses'
import { dueCards, getAllLearning, getSetting, nextDueAt, reviewsSince } from '../lib/db'
import { formatInterval } from '../lib/fsrs'
import { computeGoal, DEFAULT_GOAL_DATE, type GoalInfo } from '../lib/goal'
import type { LearnProgress } from '../lib/types'

interface HomeData {
  due: number
  dueVerses: number
  overdue: number
  todayReviews: number
  learning: LearnProgress[]
  nextDue: string | null
  goal: GoalInfo
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
    void Promise.all([
      dueCards(),
      reviewsSince(midnight.toISOString()),
      getAllLearning(),
      nextDueAt(),
      getSetting<string>('goalDate'),
    ]).then(([due, today, learning, next, goalDate]) =>
      setData({
        due: due.length,
        dueVerses: new Set(due.map((c) => c.verseId)).size,
        overdue: due.filter((c) => c.card.due < midnight.toISOString()).length,
        todayReviews: today.length,
        learning,
        nextDue: next,
        goal: computeGoal(goalDate ?? DEFAULT_GOAL_DATE, learning),
      }),
    )
  }, [])

  if (!data) return <p className="muted">불러오는 중…</p>

  const graduated = new Set(data.learning.filter((l) => l.step >= 3).map((l) => l.verseId))
  const inProgress = data.learning.find((l) => l.step > 0 && l.step < 3)
  const nextNew = VERSES.find((v) => !graduated.has(v.id) && v.id !== inProgress?.verseId)
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const newThisWeek = data.learning.filter((l) => l.step >= 3 && l.updatedAt >= weekAgo).length

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
      </section>

      <section className="panel">
        <h2>새 구절 학습</h2>
        {!data.goal.past && data.goal.remaining > 0 && (
          <p>
            <strong className="big-number">D-{data.goal.daysLeft}</strong>{' '}
            <span className="muted">
              {data.goal.goalDate.slice(5).replace('-', '/')}까지 DEP242 완결 · 남은{' '}
              {data.goal.remaining}구절
            </span>
            <br />
            오늘 목표{' '}
            <strong>
              {data.goal.todayNew}/{data.goal.dailyTarget}
            </strong>
            {data.goal.todayNew >= data.goal.dailyTarget && ' ✅ 달성!'}
          </p>
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
