import { useRef } from 'react'
import { flushSync } from 'react-dom'

import { DiffView } from '../../components/DiffView'
import { FirstLetterBoard } from '../../components/FirstLetterBoard'
import { LampMark } from '../../components/LampMark'
import { collectionOf, topicOf, type VerseEntry } from '../../data/verses'
import type { TypingGrade } from '../../domain/grading'
import { MAX_PEEKS_TO_PASS } from '../../domain/ladder'
import type { FirstLetterAttempt } from './attempt'

/** 1단계: 본문 익히기 — 낭송 규칙 안내 + 중복 구절 건너뛰기 */
export function IntroStep({
  verse,
  duplicateOf,
  onRecited,
  onSkipToTyping,
}: {
  verse: VerseEntry
  duplicateOf: VerseEntry | null
  onRecited: () => void
  onSkipToTyping: () => void
}) {
  return (
    <>
      <h2 className="prompt-main">{verse.ref}</h2>
      <p className="verse">{verse.text}</p>
      {/* 낭송의 틀 — 장절로 열고 장절로 닫는다(아래 낭송 규칙의 차례 그대로) */}
      <p className="answer-ref answer-ref-end">{verse.ref}</p>
      <div className="callout">
        <p>
          <strong>낭송 규칙 (TMS)</strong> 소리 내어 3회
        </p>
        <p>
          주제 → <em>장절</em> → 말씀 → <em>장절</em>
        </p>
        <p className="muted small">
          “{topicOf(verse).title}, {verse.refAbbr}, …말씀…, {verse.refAbbr}”
        </p>
      </div>
      {duplicateOf && (
        <div className="callout">
          <p>
            이미 <strong>{duplicateOf.refAbbr}</strong> ({collectionOf(duplicateOf).short},{' '}
            {topicOf(duplicateOf).title})로 암송한 구절입니다.
          </p>
          <button className="btn" onClick={onSkipToTyping}>
            타이핑 검증으로 건너뛰기
          </button>
        </div>
      )}
      <div className="stage-foot">
        <button className="btn btn-primary" onClick={onRecited}>
          낭송했어요, 다음으로
        </button>
      </div>
    </>
  )
}

/**
 * 2단계: 첫글자 복원 — 엿보기 횟수가 통과 판정의 증거다.
 *
 * 1단계를 지나면 본문 전체를 볼 길이 '본문 다시 보기' 하나뿐이다. 펼치면 같은 카드
 * 안에서 1단계와 같은 낭송의 틀(장절 → 말씀 → 장절)이 서고, 다시 가리면 그 시도는
 * 무효라 엿보기 0회의 새 보드로 시작한다. 사다리 단계는 그대로 firstLetter다.
 */
export function FirstLetterStep({
  verse,
  attempt,
  onPeek,
  onReread,
  onRestart,
  onDone,
}: {
  verse: VerseEntry
  attempt: FirstLetterAttempt
  onPeek: () => void
  onReread: () => void
  onRestart: () => void
  onDone: () => void
}) {
  // 누른 버튼이 화면에서 사라지므로, 포커스를 맞은편 버튼으로 옮겨 키보드 자리를 잃지 않게 한다
  const rereadRef = useRef<HTMLButtonElement>(null)
  const coverRef = useRef<HTMLButtonElement>(null)

  if (attempt.reading) {
    return (
      <>
        <h2 className="prompt-main">{verse.ref}</h2>
        <p className="verse">{verse.text}</p>
        <p className="answer-ref answer-ref-end">{verse.ref}</p>
        <div className="stage-foot">
          <p className="muted small">다시 가리면 엿보기 0회부터 새로 셉니다.</p>
          <button
            ref={coverRef}
            className="btn btn-primary"
            onClick={() => {
              flushSync(onRestart)
              rereadRef.current?.focus()
            }}
          >
            본문 가리고 다시 도전
          </button>
        </div>
      </>
    )
  }

  const failedPeeks = attempt.failedPeeks
  return (
    <>
      <h2 className="prompt-main">{verse.ref}</h2>
      <FirstLetterBoard key={attempt.board} text={verse.text} onPeek={onPeek} />
      <p className="muted small fl-hint">
        <span>첫 글자만 보고 낭송하세요. 막힌 어절만 탭</span>
        <span className="fl-peeks">엿보기 {attempt.peeks}회</span>
      </p>
      {/* 실패 안내는 '낭송 완료'를 누른 자리에서 들려야 한다 — 알림 영역은 늘 서 있고 내용만 바뀐다 */}
      <div role="status">
        {failedPeeks !== null && (
          <div className="diff-score bad">
            엿보기 {failedPeeks}회. 본문을 다시 읽고 재도전하세요 ({MAX_PEEKS_TO_PASS}회 이하
            통과)
          </div>
        )}
      </div>
      <div className="stage-foot">
        <div className="btn-row">
          <button
            ref={rereadRef}
            className="btn"
            onClick={() => {
              flushSync(onReread)
              coverRef.current?.focus()
            }}
          >
            본문 다시 보기
          </button>
          <button className="btn" onClick={onRestart}>
            다시 시도
          </button>
        </div>
        <button className="btn btn-primary" onClick={onDone}>
          낭송 완료
        </button>
      </div>
    </>
  )
}

/** 3단계: 타이핑 검증 — word-perfect만 졸업 */
export function TypingStep({
  verse,
  attempt,
  grade,
  onAttempt,
  onGrade,
  onRetry,
  onGraduate,
  onAccept,
}: {
  verse: VerseEntry
  attempt: string
  grade: TypingGrade | null
  onAttempt: (v: string) => void
  onGrade: () => void
  onRetry: () => void
  onGraduate: () => void
  onAccept: () => void
}) {
  return (
    <>
      <h2 className="prompt-main">{verse.ref}</h2>
      {grade ? (
        <>
          <DiffView grade={grade} target={verse.text} />
          {grade.perfect ? (
            <div className="stage-foot">
              <button className="btn btn-primary" onClick={onGraduate}>
                졸업하고 복습 큐에 추가
              </button>
            </div>
          ) : (
            <div className="stage-foot">
              <p className="muted small">
                틀린 곳을 확인했으면 정답을 가리고 기억만으로 다시 도전하세요.
              </p>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={onRetry}>
                  다시 도전 <span className="btn-sub">정답 가리고 재입력</span>
                </button>
                <button className="btn" onClick={onAccept}>
                  그냥 넘어가기
                </button>
              </div>
              <p className="muted small">
                오타처럼 의식하지 못한 실수였다면 넘어가도 됩니다. 그대로 졸업합니다.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="muted small" htmlFor="learn-typing">
            기억만으로 말씀 전체를 입력하세요
          </label>
          <div className="typing-field">
            <textarea
              id="learn-typing"
              className="typing-input"
              value={attempt}
              onChange={(e) => {
                onAttempt(e.target.value)
              }}
              onKeyDown={(e) => {
                // 한글 IME 조합 확정 Enter는 제출로 치지 않는다 (isComposing)
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                e.preventDefault()
                if (attempt.trim() !== '') onGrade()
              }}
              placeholder="기억만으로 말씀 전체를 입력하세요"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              rows={6}
            />
            {/*
              음성 전사 앱(Monologue)이 페이지 맥락으로 읽어가는 정답 사본.
              화면에는 보이지 않지만 접근성 트리에는 남는다 — aria-hidden을 붙이면
              트리에서 빠져 전사 앱이 읽지 못하므로 붙이지 않는다.
            */}
            <p className="stt-context">{verse.text}</p>
          </div>
          <button
            className="btn btn-primary"
            disabled={attempt.trim() === ''}
            onClick={onGrade}
          >
            채점 (word-perfect 통과)
          </button>
        </>
      )}
    </>
  )
}

/** 4단계: 졸업 — 등불 하나를 켜고, 다음 걸음을 아래에 둔다 */
export function GraduatedStep({
  verse,
  nextVerse,
  onExit,
  onReview,
  onLearn,
}: {
  verse: VerseEntry
  nextVerse: VerseEntry | null
  onExit: () => void
  onReview: () => void
  onLearn: (verseId: string) => void
}) {
  return (
    <>
      <div className="finale">
        <LampMark />
        <h2>{verse.refAbbr} 졸업!</h2>
        <p className="muted">
          3방향 복습 카드(주제→말씀, 장절→말씀, 말씀→장절)가 생성되어 FSRS 스케줄에
          편입되었습니다.
        </p>
      </div>
      <div className="stage-foot">
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
    </>
  )
}
