import { useEffect, useReducer, useState } from 'react'

import { getAllLearning, runLadder } from '../app'
import { Chevron } from '../components/Chevron'
import { Crumb } from '../components/Crumb'
import { StageCard } from '../components/StageCard'
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
import { nextAfterGraduation } from '../domain/nextVerse'
import { useLearnProgress } from './hooks'
import { nextAttempt, RESUMED_ATTEMPT } from './learn/attempt'
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
  const [fl, flDispatch] = useReducer(nextAttempt, RESUMED_ATTEMPT)
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)
  const [dup, setDup] = useState<{ verseId: string; verse: VerseEntry | null } | null>(null)
  // 졸업 뒤 다음 걸음. 어느 구절의 졸업에서 고른 것인지 함께 담아, 이어서 고른 구절을
  // 졸업한 직후 이전 결과(그 구절 자신)가 잠깐 보이지 않게 한다.
  const [next, setNext] = useState<{ from: string; verse: VerseEntry; resume: boolean } | null>(
    null,
  )

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
      // 방금 졸업한 구절 바로 뒤에서부터 — 목록에서 골라 시작한 과정을 그대로 이어 간다.
      // 진행 중인(강등한) 구절이 남았으면 그것을 이어 하고, 없을 때만 새 구절로.
      const after = nextAfterGraduation(
        VERSES.map((v) => v.id),
        ls,
        verseId,
      )
      const verse = after ? VERSE_BY_ID[after.verseId] : undefined
      setNext(after && verse ? { from: verseId, verse, resume: after.kind === 'resume' } : null)
    })
  }, [step, verseId])

  // 없는 구절 id(오래된 링크) — 복습의 빈 화면과 같은 작은 카드로 비어 있음과 돌아갈 길을 알린다
  if (!verse) {
    return (
      <section className="panel empty-state">
        <h2>구절을 찾을 수 없습니다.</h2>
        <button className="btn btn-primary" onClick={onExit}>
          홈으로
        </button>
      </section>
    )
  }
  if (step === null) return <p className="muted loading">불러오는 중…</p>

  /**
   * 사다리에 명령을 보낸다. 다음 단계와 졸업(3방향 카드 생성) 판단은 전부
   * domain/ladder.ts의 advance()가 하고, 여기서는 결과를 화면에 반영만 한다.
   */
  const send = async (cmd: LadderCommand) => {
    const outcome = await runLadder(verseId, cmd)
    if (outcome.kind === 'stay') {
      if (outcome.reason === 'peeksExceeded') flDispatch({ type: 'failed', peeks: fl.peeks })
    } else {
      setStep(outcome.step)
    }
  }

  const { nth, total } = stepOrdinal(step)

  return (
    <div className="stage">
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          <Chevron dir="left" />
          나가기
        </button>
        {/* 사다리 네 단 — 글자 안내가 옆에 있으므로 막대는 장식이다 */}
        <ol className="ladder" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={i + 1 < nth ? 'is-done' : i + 1 === nth ? 'is-current' : undefined}
            />
          ))}
        </ol>
        <span className="review-count">
          {STEP_TITLE[step]}{' '}
          <span className="step-of">
            {nth}/{total}
          </span>
        </span>
      </div>

      {/* 단계가 바뀌면 카드를 새로 놓는다 — 같은 자리에서 내용만 바뀌면 넘어간 줄 모른다 */}
      <StageCard key={step}>
        {/* 카드 머리줄 — 이 구절이 놓인 자리(과정 › 단원 › 주제) */}
        <p className="card-head">
          <Crumb parts={[...crumbOf(verse), topicOf(verse).title]} />
        </p>

        {step === 'intro' && (
          <IntroStep
            verse={verse}
            duplicateOf={dup?.verseId === verseId ? dup.verse : null}
            onRecited={() => {
              // 방금 1단계에서 본문을 읽었으니 2단계는 보드부터
              flDispatch({ type: 'restart' })
              void send({ step: 'intro', event: 'recited' })
            }}
            onSkipToTyping={() => void send({ step: 'intro', event: 'skipToTyping' })}
          />
        )}

        {step === 'firstLetter' && (
          <FirstLetterStep
            verse={verse}
            attempt={fl}
            onPeek={() => {
              flDispatch({ type: 'peek' })
            }}
            onReread={() => {
              flDispatch({ type: 'reread' })
            }}
            onRestart={() => {
              flDispatch({ type: 'restart' })
            }}
            onDone={() =>
              void send({ step: 'firstLetter', event: 'attempted', peeks: fl.peeks })
            }
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
            nextVerse={next?.from === verseId ? next.verse : null}
            resume={next?.resume ?? false}
            onExit={onExit}
            onReview={onReview}
            onLearn={onLearn}
          />
        )}
      </StageCard>
    </div>
  )
}
