import { useEffect, useState } from 'react'
import { seriesOf, topicOf, VERSE_BY_ID } from '../data/verses'
import { FirstLetterBoard } from '../components/FirstLetterBoard'
import { DiffView } from '../components/DiffView'
import { gradeTyping, type TypingGrade } from '../lib/diff'
import { getLearning, graduateVerse, putLearning } from '../lib/db'

const STEP_TITLES = ['본문 익히기', '첫글자 복원', '타이핑 검증', '졸업']

export function Learn({
  verseId,
  onExit,
  onReview,
}: {
  verseId: string
  onExit: () => void
  onReview: () => void
}) {
  const verse = VERSE_BY_ID[verseId]
  const [step, setStep] = useState<number | null>(null)
  const [peeks, setPeeks] = useState(0)
  const [flTry, setFlTry] = useState(0)
  const [flResult, setFlResult] = useState<number | null>(null)
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)

  useEffect(() => {
    void getLearning(verseId).then((p) => setStep(p ? Math.min(p.step, 2) : 0))
  }, [verseId])

  if (!verse) return <p className="muted">구절을 찾을 수 없습니다.</p>
  if (step === null) return <p className="muted">불러오는 중…</p>

  const advance = async (next: number) => {
    if (next >= 3) {
      await graduateVerse(verseId)
    } else {
      await putLearning({ verseId, step: next, updatedAt: new Date().toISOString() })
    }
    setStep(next)
  }

  return (
    <div>
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          ← 나가기
        </button>
        <span className="muted">
          {step + 1}/4 · {STEP_TITLES[step]}
        </span>
      </div>

      <div className="panel">
        <span className="chip">
          {seriesOf(verse).key}. {seriesOf(verse).title} — {topicOf(verse)}
        </span>

        {step === 0 && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            <p className="verse">{verse.text}</p>
            <div className="callout">
              <strong>낭송 규칙 (TMS)</strong> — 소리 내어 3회:
              <br />
              주제 → <em>장절</em> → 말씀 → <em>장절</em>
              <br />
              <span className="muted small">
                "{topicOf(verse)}, {verse.refAbbr}, …말씀…, {verse.refAbbr}"
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => void advance(1)}>
              낭송했어요 — 다음
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            <FirstLetterBoard
              key={flTry}
              text={verse.text}
              onPeek={() => setPeeks((p) => p + 1)}
            />
            <p className="muted small">
              첫 글자만 보고 낭송하세요. 막힌 어절만 탭 · 엿보기 {peeks}회
            </p>
            {flResult !== null && flResult > 2 && (
              <div className="diff-score bad">
                엿보기 {flResult}회 — 본문을 다시 읽고 재도전하세요 (2회 이하 통과)
              </div>
            )}
            <div className="btn-row">
              <button
                className="btn"
                onClick={() => {
                  setPeeks(0)
                  setFlResult(null)
                  setFlTry((t) => t + 1)
                }}
              >
                다시 시도
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (peeks <= 2) void advance(2)
                  else setFlResult(peeks)
                }}
              >
                낭송 완료
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            {grade && <DiffView grade={grade} />}
            {grade?.perfect ? (
              <button className="btn btn-primary" onClick={() => void advance(3)}>
                졸업 — 복습 큐에 추가
              </button>
            ) : (
              <>
                <textarea
                  className="typing-input"
                  value={attempt}
                  onChange={(e) => setAttempt(e.target.value)}
                  placeholder="기억만으로 말씀 전체를 입력하세요"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  rows={6}
                />
                <button
                  className="btn btn-primary"
                  disabled={attempt.trim() === ''}
                  onClick={() => setGrade(gradeTyping(verse.text, attempt))}
                >
                  채점 (word-perfect 통과)
                </button>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <div className="center">
            <h2>🎉 {verse.refAbbr} 졸업!</h2>
            <p className="muted">
              3방향 복습 카드(주제→말씀, 장절→말씀, 말씀→장절)가 생성되어
              <br />
              FSRS 스케줄에 편입되었습니다.
            </p>
            <div className="btn-row">
              <button className="btn" onClick={onExit}>
                홈으로
              </button>
              <button className="btn btn-primary" onClick={onReview}>
                바로 복습
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
