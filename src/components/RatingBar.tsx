import { intervalPreview } from '../lib/fsrs'
import type { SerializedCard } from '../lib/types'

const LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: '다시',
  2: '어려움',
  3: '좋음',
  4: '쉬움',
}

export function RatingBar({
  card,
  suggested,
  onRate,
}: {
  card: SerializedCard
  suggested?: 1 | 2 | 3 | 4
  onRate: (r: 1 | 2 | 3 | 4) => void
}) {
  const preview = intervalPreview(card)
  return (
    <div className="rating-bar">
      {([1, 2, 3, 4] as const).map((r) => (
        <button
          key={r}
          className={`rate rate-${r}${suggested === r ? ' suggested' : ''}`}
          onClick={() => onRate(r)}
        >
          <span className="rate-label">{LABELS[r]}</span>
          <span className="rate-interval">{preview[r]}</span>
        </button>
      ))}
    </div>
  )
}
