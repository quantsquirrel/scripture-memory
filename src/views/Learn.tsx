import { useEffect, useState } from 'react'

import { getAllLearning, runLadder } from '../app'
import {
  crumbOf,
  DUPLICATES,
  refKeyOf,
  topicOf,
  VERSE_BY_ID,
  type VerseEntry,
  VERSES,
} from '../data/verses'
import { gradeTyping, type TypingGrade } from '../domain/grading'
import { isGraduated, type LadderCommand, STEP_TITLE, stepOrdinal } from '../domain/ladder'
import { useLearnProgress } from './hooks'
import { FirstLetterStep, GraduatedStep, IntroStep, TypingStep } from './learn/steps'

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
  const { step, setStep } = useLearnProgress(verseId)
  const [peeks, setPeeks] = useState(0)
  const [flTry, setFlTry] = useState(0)
  const [flResult, setFlResult] = useState<number | null>(null)
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)
  const [dup, setDup] = useState<{ verseId: string; verse: VerseEntry | null } | null>(null)
  const [nextVerse, setNextVerse] = useState<VerseEntry | null>(null)

  // 같은 장절을 다른 컬렉션에서 이미 암송했는지 (첫글자 단계 건너뛰기 안내).
  // 결과에 구절 id를 함께 담아, 구절이 바뀌는 순간 이전 결과가 보이지 않게 한다.
  useEffect(() => {
    let alive = true
    const v = VERSE_BY_ID[verseId]
    const dups = v ? (DUPLICATES[refKeyOf(v)] ?? []).filter((id) => id !== verseId) : []
    // 중복이 없으면 상태를 세우지 않는다 — 아래 파생값이 그대로 null이 된다
    if (dups.length > 0) {
      void getAllLearning().then((ls) => {
        if (!alive) return
        const done = ls.find((l) => isGraduated(l) && dups.includes(l.verseId))
        setDup({ verseId, verse: done ? (VERSE_BY_ID[done.verseId] ?? null) : null })
      })
    }
    return () => {
      alive = false
    }
  }, [verseId])

  useEffect(() => {
    if (step !== 'graduated') return
    void getAllLearning().then((ls) => {
      const grad = new Set(ls.filter(isGraduated).map((l) => l.verseId))
      setNextVerse(VERSES.find((v) => !grad.has(v.id)) ?? null)
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
          <IntroStep
            verse={verse}
            duplicateOf={dup?.verseId === verseId ? dup.verse : null}
            onRecited={() => void send({ step: 'intro', event: 'recited' })}
            onSkipToTyping={() => void send({ step: 'intro', event: 'skipToTyping' })}
          />
        )}

        {step === 'firstLetter' && (
          <FirstLetterStep
            verse={verse}
            peeks={peeks}
            attemptKey={flTry}
            failedPeeks={flResult}
            onPeek={() => {
              setPeeks((p) => p + 1)
            }}
            onRetry={() => {
              setPeeks(0)
              setFlResult(null)
              setFlTry((t) => t + 1)
            }}
            onDone={() => void send({ step: 'firstLetter', event: 'attempted', peeks })}
          />
        )}

        {step === 'typing' && (
          <TypingStep
            verse={verse}
            attempt={attempt}
            grade={grade}
            onAttempt={setAttempt}
            onGrade={() => {
              setGrade(gradeTyping(verse.text, attempt))
            }}
            onRetry={() => {
              setAttempt('')
              setGrade(null)
            }}
            onGraduate={() => void send({ step: 'typing', event: 'graded', perfect: true })}
            onAccept={() => void send({ step: 'typing', event: 'accept' })}
          />
        )}

        {step === 'graduated' && (
          <GraduatedStep
            verse={verse}
            nextVerse={nextVerse}
            onExit={onExit}
            onReview={onReview}
            onLearn={onLearn}
          />
        )}
      </div>
    </div>
  )
}
