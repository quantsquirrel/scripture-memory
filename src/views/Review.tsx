import { useCallback, useState } from 'react'

import { nextDueAt, submitReview } from '../app'
import { VERSE_BY_ID } from '../data/verses'
import type { Rating, ReviewMode, StoredCard } from '../domain/card'
import { required } from '../domain/invariant'
import { reviewMode } from '../domain/policy'
import { formatInterval } from '../domain/scheduler'
import { useDueCards } from './hooks'
import { CardFace } from './review/CardFace'

export function Review({ onExit }: { onExit: () => void }) {
  const { queue, refill } = useDueCards()
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(0)
  // 다음 복습까지 남은 시간은 '읽은 순간' 기준 라벨로 굳혀 둔다 (렌더는 순수하게)
  const [nextDueLabel, setNextDueLabel] = useState<string | null>(null)

  const current: StoredCard | null = queue && idx < queue.length ? (queue[idx] ?? null) : null

  const rate = useCallback(
    async (r: Rating, mode: ReviewMode, accuracy: number | null, peeks: number | null) => {
      if (!current) return
      await submitReview(current, { mode, rating: r, accuracy, peeks })
      setDone((d) => d + 1)
      if (queue && idx + 1 < queue.length) {
        setIdx(idx + 1)
        return
      }
      // 큐를 소진했다 — 다시 채워 보고 비어 있으면 세션을 마친다
      const more = await refill()
      setIdx(0)
      if (more.length === 0) {
        const at = await nextDueAt()
        setNextDueLabel(
          at === null ? null : formatInterval(new Date(at).getTime() - Date.now()),
        )
      }
    },
    [current, queue, idx, refill],
  )

  if (queue === null) return <p className="muted">불러오는 중…</p>

  if (!current) {
    return (
      <div className="panel center">
        <h2>{done > 0 ? '복습 완료!' : '복습할 카드가 없습니다'}</h2>
        {done > 0 && <p>이번 세션에서 {done}회 복습했습니다.</p>}
        {nextDueLabel !== null && <p className="muted">다음 복습: {nextDueLabel} 후</p>}
        {queue.length === 0 && done === 0 && (
          <p className="muted">새 구절을 학습하면 카드가 생성됩니다.</p>
        )}
        <button className="btn btn-primary" onClick={onExit}>
          홈으로
        </button>
      </div>
    )
  }

  // useDueCards가 본문 없는 카드를 걸러낸 뒤이므로 반드시 존재한다
  const verse = required(VERSE_BY_ID[current.verseId], `구절 ${current.verseId}`)

  return (
    <div>
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          ← 종료
        </button>
        <span className="muted">남은 카드 {queue.length - idx}</span>
      </div>
      <CardFace
        key={`${current.key}:${current.card.reps}`}
        sc={current}
        verse={verse}
        mode={reviewMode(current.direction, current.card.reps)}
        onRate={(r, m, accuracy, peeks) => {
          void rate(r, m, accuracy, peeks)
        }}
      />
    </div>
  )
}
