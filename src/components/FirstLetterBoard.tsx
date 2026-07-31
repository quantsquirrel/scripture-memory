import { useMemo, useState } from 'react'

import { firstLetterWords } from '../domain/firstLetter'

/**
 * 어절 첫 글자만 보여주고, 탭하면 공개(엿보기 1회 카운트).
 *
 * 접근성: 화면에는 "보··"처럼 보이므로 스크린리더가 그대로 읽으면 뜻이 없다.
 * 각 버튼에 "3번째 어절, 첫 글자 보, 누르면 전체 어절이 보입니다" 형태의
 * aria-label을 주고, 보드 전체에는 어절 수와 조작법을 설명하는 텍스트 대안을 둔다.
 */
export function FirstLetterBoard({ text, onPeek }: { text: string; onPeek: () => void }) {
  const words = useMemo(() => firstLetterWords(text), [text])
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set())
  return (
    <div className="fl-board verse" role="group" aria-label="첫글자 복원 보드">
      <p className="sr-only">
        어절 {words.length}개의 첫 글자만 보입니다. 막히는 어절의 버튼을 누르면 그 어절 전체가
        공개되고 엿보기 횟수로 기록됩니다. 공개한 어절 {revealed.size}개.
      </p>
      {words.map((w, i) =>
        revealed.has(i) ? (
          <span key={i} className="fl-word fl-revealed">
            <span className="sr-only">{i + 1}번째 어절 공개됨: </span>
            {w.word}
          </span>
        ) : (
          <button
            key={i}
            type="button"
            className="fl-word"
            aria-label={`${i + 1}번째 어절, 첫 글자 ${w.hint}. 누르면 어절 전체가 공개됩니다`}
            onClick={() => {
              setRevealed((prev) => new Set(prev).add(i))
              onPeek()
            }}
          >
            <span aria-hidden="true">
              {w.hint}
              <span className="fl-dots">··</span>
            </span>
          </button>
        ),
      )}
    </div>
  )
}
