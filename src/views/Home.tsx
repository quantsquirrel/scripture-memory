import { useEffect, useState } from 'react'
import { SERIES, VERSE_BY_ID, VERSES } from '../data/verses'
import { dueCards, getAllLearning, nextDueAt, reviewsSince } from '../lib/db'
import { formatInterval } from '../lib/fsrs'
import type { LearnProgress } from '../lib/types'

interface HomeData {
  due: number
  todayReviews: number
  learning: LearnProgress[]
  nextDue: string | null
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
    ]).then(([due, today, learning, next]) =>
      setData({ due: due.length, todayReviews: today.length, learning, nextDue: next }),
    )
  }, [])

  if (!data) return <p className="muted">불러오는 중…</p>

  const graduated = new Set(data.learning.filter((l) => l.step >= 3).map((l) => l.verseId))
  const inProgress = data.learning.find((l) => l.step > 0 && l.step < 3)
  const nextNew = VERSES.find((v) => !graduated.has(v.id) && v.id !== inProgress?.verseId)
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const newThisWeek = data.learning.filter((l) => l.step >= 3 && l.updatedAt >= weekAgo).length

  return (
    <div>
      <section className="panel">
        <h2>오늘의 복습</h2>
        {data.due > 0 ? (
          <>
            <p>
              <strong className="big-number">{data.due}</strong>장이 기다리고 있습니다
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
        {inProgress && (
          <button className="btn" onClick={() => onLearn(inProgress.verseId)}>
            이어서: {VERSE_BY_ID[inProgress.verseId].refAbbr} (단계 {inProgress.step + 1}/4)
          </button>
        )}
        {nextNew ? (
          <button className="btn" onClick={() => onLearn(nextNew.id)}>
            다음 구절: {nextNew.id} · {nextNew.refAbbr}
          </button>
        ) : (
          !inProgress && <p>60구절을 모두 학습했습니다! 🎉</p>
        )}
        <p className="muted small">
          이번 주 새 구절 {newThisWeek}/2 (TMS 권장: 주 2구절)
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
          {graduated.size}/{VERSES.length} 구절 암송 중
        </p>
        <div className="series-grid">
          {SERIES.map((s) => {
            const total = VERSES.filter((v) => v.topicKey[0] === s.key)
            const done = total.filter((v) => graduated.has(v.id))
            return (
              <button key={s.key} className="series-cell" onClick={onBrowse}>
                <span className="series-key">{s.key}</span>
                <span className="muted small">
                  {done.length}/{total.length}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
