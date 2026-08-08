import { useState } from 'react'

import { DiffView } from '../../components/DiffView'
import { FirstLetterBoard } from '../../components/FirstLetterBoard'
import { RatingBar } from '../../components/RatingBar'
import type { VerseEntry } from '../../data/verses'
import type { Rating, ReviewMode, StoredCard } from '../../domain/card'
import {
  gradeTyping,
  ratingFromAccuracy,
  ratingFromPeeks,
  type TypingGrade,
} from '../../domain/grading'
import { gradeRef } from '../../domain/ref'
import { Answer } from './Answer'

/** 등급 확정 콜백 — 증거(accuracy/peeks)를 반드시 함께 넘긴다 */
export type RateFn = (
  r: Rating,
  mode: ReviewMode,
  accuracy: number | null,
  peeks: number | null,
) => void

/** 자가 채점: 정답을 보고 스스로 등급을 매긴다. 증거는 null이고, 그 예외가 허용되는
 *  근거는 policy.ts가 5회마다 끼워 넣는 타이핑 감사다. */
export function ReciteMode({
  sc,
  verse,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  onRate: RateFn
}) {
  const [revealed, setRevealed] = useState(false)
  if (!revealed) {
    return (
      <button
        className="btn btn-primary"
        onClick={() => {
          setRevealed(true)
        }}
      >
        정답 보기
      </button>
    )
  }
  return (
    <>
      <Answer sc={sc} verse={verse} />
      <RatingBar
        card={sc.card}
        onRate={(r) => {
          onRate(r, 'recite', null, null)
        }}
      />
    </>
  )
}

/** 첫글자 힌트: 엿보기 횟수가 등급 제안의 증거다 */
export function FirstLetterMode({
  sc,
  verse,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  onRate: RateFn
}) {
  const [revealed, setRevealed] = useState(false)
  const [peeks, setPeeks] = useState(0)
  if (!revealed) {
    return (
      <>
        <FirstLetterBoard
          text={verse.text}
          onPeek={() => {
            setPeeks((p) => p + 1)
          }}
        />
        <p className="muted small">막히는 어절만 탭하세요 · 엿보기 {peeks}회</p>
        <button
          className="btn btn-primary"
          onClick={() => {
            setRevealed(true)
          }}
        >
          낭송 완료 — 확인
        </button>
      </>
    )
  }
  return (
    <>
      <Answer sc={sc} verse={verse} />
      <p className="muted small">엿보기 {peeks}회 → 제안 등급이 강조됩니다</p>
      <RatingBar
        card={sc.card}
        suggested={ratingFromPeeks(peeks)}
        onRate={(r) => {
          onRate(r, 'firstLetter', null, peeks)
        }}
      />
    </>
  )
}

/** 타이핑 감사: 어절 LCS 정확도가 증거다 (word-perfect 검증) */
export function TypingMode({
  sc,
  verse,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  onRate: RateFn
}) {
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)
  if (!grade) {
    return (
      <>
        <label className="muted small" htmlFor="review-typing">
          말씀을 입력하세요 (구두점 무시)
        </label>
        <textarea
          id="review-typing"
          className="typing-input"
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value)
          }}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정 Enter는 제출로 치지 않는다 (isComposing)
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            if (attempt.trim() !== '') setGrade(gradeTyping(verse.text, attempt))
          }}
          placeholder="말씀을 입력하세요 (구두점 무시)"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          rows={5}
        />
        {/*
          음성 전사 앱(Monologue)이 페이지 맥락으로 읽어가는 정답 사본.
          화면에는 보이지 않지만 접근성 트리에는 남는다 — aria-hidden을 붙이면
          트리에서 빠져 전사 앱이 읽지 못하므로 붙이지 않는다.
        */}
        <p className="stt-context">{verse.text}</p>
        <button
          className="btn btn-primary"
          disabled={attempt.trim() === ''}
          onClick={() => {
            setGrade(gradeTyping(verse.text, attempt))
          }}
        >
          채점
        </button>
      </>
    )
  }
  return (
    <>
      <DiffView grade={grade} target={verse.text} />
      <Answer sc={sc} verse={verse} />
      <RatingBar
        card={sc.card}
        suggested={ratingFromAccuracy(grade)}
        onRate={(r) => {
          onRate(r, 'typing', grade.accuracy, null)
        }}
      />
    </>
  )
}

/** 장절 입력: 정오가 증거다 (말씀→장절 방향은 항상 이 모드) */
export function RefInputMode({
  sc,
  verse,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  onRate: RateFn
}) {
  const [attempt, setAttempt] = useState('')
  const [refOk, setRefOk] = useState<boolean | null>(null)
  if (refOk === null) {
    return (
      <>
        <label className="muted small" htmlFor="review-ref">
          장절을 입력하세요
        </label>
        <input
          id="review-ref"
          className="ref-input"
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value)
          }}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정 Enter는 제출로 치지 않는다 (isComposing)
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            e.preventDefault()
            if (attempt.trim() !== '') setRefOk(gradeRef(verse, attempt))
          }}
          placeholder="예: 고후 5:17 / 빌립보서 4:6-7"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="btn btn-primary"
          disabled={attempt.trim() === ''}
          onClick={() => {
            setRefOk(gradeRef(verse, attempt))
          }}
        >
          확인
        </button>
      </>
    )
  }
  return (
    <>
      <div className={`diff-score ${refOk ? 'good' : 'bad'}`}>
        {refOk ? '정답!' : `오답 — 입력: ${attempt}`}
      </div>
      <Answer sc={sc} verse={verse} />
      <RatingBar
        card={sc.card}
        suggested={refOk ? 3 : 1}
        onRate={(r) => {
          onRate(r, 'refInput', refOk ? 1 : 0, null)
        }}
      />
    </>
  )
}
