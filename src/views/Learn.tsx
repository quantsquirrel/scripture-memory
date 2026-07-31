import { useEffect, useState } from 'react'

import { getAllLearning, openLadder, runLadder } from '../app'
import { DiffView } from '../components/DiffView'
import { FirstLetterBoard } from '../components/FirstLetterBoard'
import {
  collectionOf,
  crumbOf,
  DUPLICATES,
  refKeyOf,
  topicOf,
  VERSE_BY_ID,
  type VerseEntry,
  VERSES,
} from '../data/verses'
import { gradeTyping, type TypingGrade } from '../domain/grading'
import {
  isGraduated,
  type LadderCommand,
  type LadderStep,
  STEP_TITLE,
  stepOrdinal,
} from '../domain/ladder'

export function Learn({
  verseId,
  onExit,
  onReview,
  onLearn,
}: {
  verseId: string
  onExit: () => void
  onReview: () => void
  onLearn: (verseId: string) => void
}) {
  const verse = VERSE_BY_ID[verseId]
  const [step, setStep] = useState<LadderStep | null>(null)
  const [peeks, setPeeks] = useState(0)
  const [flTry, setFlTry] = useState(0)
  const [flResult, setFlResult] = useState<number | null>(null)
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)
  const [dupDone, setDupDone] = useState<VerseEntry | null>(null)
  const [nextVerse, setNextVerse] = useState<VerseEntry | null>(null)

  useEffect(() => {
    void openLadder(verseId).then(setStep)
    const v = VERSE_BY_ID[verseId]
    if (!v) return
    const dups = (DUPLICATES[refKeyOf(v)] ?? []).filter((id) => id !== verseId)
    if (dups.length === 0) return
    void getAllLearning().then((ls) => {
      const done = ls.find((l) => isGraduated(l) && dups.includes(l.verseId))
      setDupDone(done ? (VERSE_BY_ID[done.verseId] ?? null) : null)
    })
  }, [verseId])

  useEffect(() => {
    if (step !== 'graduated') return
    void getAllLearning().then((ls) => {
      const grad = new Set(ls.filter(isGraduated).map((l) => l.verseId))
      const nxt = VERSES.find((v) => !grad.has(v.id))
      setNextVerse(nxt ?? null)
    })
  }, [step])

  if (!verse) return <p className="muted">구절을 찾을 수 없습니다.</p>
  if (step === null) return <p className="muted">불러오는 중…</p>

  /**
   * 사다리에 명령을 보낸다. 다음 단계와 졸업(3방향 카드 생성) 판단은 전부
   * domain/ladder.ts의 advance()가 하고, 여기서는 결과를 화면에 반영만 한다.
   */
  const send = async (cmd: LadderCommand) => {
    const outcome = await runLadder(verseId, cmd)
    if (outcome.kind === 'stay') {
      if (outcome.reason === 'peeksExceeded') setFlResult(peeks)
    } else {
      setStep(outcome.step)
    }
    return outcome
  }

  return (
    <div>
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          ← 나가기
        </button>
        <span className="muted">
          {stepOrdinal(step).nth}/{stepOrdinal(step).total} · {STEP_TITLE[step]}
        </span>
      </div>

      <div className="panel">
        <span className="chip">
          {crumbOf(verse).join(' · ')} — {topicOf(verse).title}
        </span>

        {step === 'intro' && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            <p className="verse">{verse.text}</p>
            <div className="callout">
              <strong>낭송 규칙 (TMS)</strong> — 소리 내어 3회:
              <br />
              주제 → <em>장절</em> → 말씀 → <em>장절</em>
              <br />
              <span className="muted small">
                "{topicOf(verse).title}, {verse.refAbbr}, …말씀…, {verse.refAbbr}"
              </span>
            </div>
            {dupDone && (
              <div className="callout">
                이미 <strong>{dupDone.refAbbr}</strong> ({collectionOf(dupDone).short} ·{' '}
                {topicOf(dupDone).title})로 암송한 구절입니다.
                <button
                  className="btn"
                  onClick={() => void send({ step: 'intro', event: 'skipToTyping' })}
                >
                  타이핑 검증으로 건너뛰기
                </button>
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={() => void send({ step: 'intro', event: 'recited' })}
            >
              낭송했어요 — 다음
            </button>
          </>
        )}

        {step === 'firstLetter' && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            <FirstLetterBoard
              key={flTry}
              text={verse.text}
              onPeek={() => {
                setPeeks((p) => p + 1)
              }}
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
                onClick={() => void send({ step: 'firstLetter', event: 'attempted', peeks })}
              >
                낭송 완료
              </button>
            </div>
          </>
        )}

        {step === 'typing' && (
          <>
            <h2 className="prompt-main">{verse.ref}</h2>
            {grade ? (
              <>
                <DiffView grade={grade} target={verse.text} />
                {grade.perfect ? (
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      void send({ step: 'typing', event: 'graded', perfect: true })
                    }
                  >
                    졸업 — 복습 큐에 추가
                  </button>
                ) : (
                  <>
                    <p className="muted small">
                      틀린 곳을 확인했으면 정답을 가리고 기억만으로 다시 도전하세요.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setAttempt('')
                        setGrade(null)
                      }}
                    >
                      다시 도전 (정답 가리고 재입력)
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <textarea
                  className="typing-input"
                  value={attempt}
                  onChange={(e) => {
                    setAttempt(e.target.value)
                  }}
                  placeholder="기억만으로 말씀 전체를 입력하세요"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  rows={6}
                />
                <button
                  className="btn btn-primary"
                  disabled={attempt.trim() === ''}
                  onClick={() => {
                    setGrade(gradeTyping(verse.text, attempt))
                  }}
                >
                  채점 (word-perfect 통과)
                </button>
              </>
            )}
          </>
        )}

        {step === 'graduated' && (
          <div className="center">
            <h2>🎉 {verse.refAbbr} 졸업!</h2>
            <p className="muted">
              3방향 복습 카드(주제→말씀, 장절→말씀, 말씀→장절)가 생성되어
              <br />
              FSRS 스케줄에 편입되었습니다.
            </p>
            {nextVerse && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  onLearn(nextVerse.id)
                }}
              >
                다음 구절: {nextVerse.refAbbr}
              </button>
            )}
            <div className="btn-row">
              <button className="btn" onClick={onExit}>
                홈으로
              </button>
              <button className="btn" onClick={onReview}>
                바로 복습
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
