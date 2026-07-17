import { useMemo, useState } from 'react'
import { firstLetterWords } from '../lib/firstLetter'

/** 어절 첫 글자만 보여주고, 탭하면 공개(엿보기 1회 카운트). */
export function FirstLetterBoard({
  text,
  onPeek,
}: {
  text: string
  onPeek: () => void
}) {
  const words = useMemo(() => firstLetterWords(text), [text])
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set())
  return (
    <div className="fl-board verse">
      {words.map((w, i) =>
        revealed.has(i) ? (
          <span key={i} className="fl-word fl-revealed">
            {w.word}
          </span>
        ) : (
          <button
            key={i}
            type="button"
            className="fl-word"
            onClick={() => {
              setRevealed((prev) => new Set(prev).add(i))
              onPeek()
            }}
          >
            {w.hint}
            <span className="fl-dots">··</span>
          </button>
        ),
      )}
    </div>
  )
}
