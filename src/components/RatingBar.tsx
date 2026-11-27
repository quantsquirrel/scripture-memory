import type { Rating, SerializedCard } from '../domain/card'
import { intervalPreview } from '../domain/scheduler'

export const RATING_LABELS: Record<Rating, string> = {
  1: '다시',
  2: '어려움',
  3: '좋음',
  4: '쉬움',
}

/** 등급 칸 넷 — 카드의 다음 복습 간격은 scheduler.ts의 intervalPreview가 낸다 */
export function RatingBar({
  card,
  suggested,
  onRate,
}: {
  card: SerializedCard
  suggested?: Rating
  onRate: (r: Rating) => void
}) {
  return (
    <RatingChoices intervals={intervalPreview(card)} suggested={suggested} onRate={onRate} />
  )
}

/**
 * 등급 칸 넷의 표시 — 간격 글자를 받는다. 카드 없이 간격만 그리는 자리(소개 장면)가 이것을 쓴다.
 * 저장할 수 있는 카드를 받지 않으므로 이 경로로는 어떤 카드의 상태도 바뀌지 않는다.
 */
export function RatingChoices({
  intervals,
  suggested,
  onRate,
}: {
  intervals: Readonly<Record<Rating, string>>
  suggested?: Rating | undefined
  onRate: (r: Rating) => void
}) {
  return (
    <div className="rating-bar">
      {([1, 2, 3, 4] as const).map((r) => (
        <button
          key={r}
          className={`rate rate-${r}${suggested === r ? ' suggested' : ''}`}
          onClick={() => {
            onRate(r)
          }}
        >
          <span className="rate-label">{RATING_LABELS[r]}</span>
          <span className="rate-interval">{intervals[r]}</span>
          {/* 금색 테두리만으로 알리지 않는다 — 채점 증거가 고른 칸이라는 글자 표지 */}
          {suggested === r && <span className="rate-suggest">제안</span>}
        </button>
      ))}
    </div>
  )
}
