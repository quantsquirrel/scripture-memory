import { DiffView } from '../../components/DiffView'
import { FirstLetterBoard } from '../../components/FirstLetterBoard'
import { collectionOf, topicOf, type VerseEntry } from '../../data/verses'
import type { TypingGrade } from '../../domain/grading'
import { MAX_PEEKS_TO_PASS } from '../../domain/ladder'

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
      <div className="callout">
        <strong>낭송 규칙 (TMS)</strong> — 소리 내어 3회:
        <br />
        주제 → <em>장절</em> → 말씀 → <em>장절</em>
        <br />
        <span className="muted small">
          "{topicOf(verse).title}, {verse.refAbbr}, …말씀…, {verse.refAbbr}"
        </span>
      </div>
      {duplicateOf && (
        <div className="callout">
          이미 <strong>{duplicateOf.refAbbr}</strong> ({collectionOf(duplicateOf).short} ·{' '}
          {topicOf(duplicateOf).title})로 암송한 구절입니다.
          <button className="btn" onClick={onSkipToTyping}>
            타이핑 검증으로 건너뛰기
          </button>
        </div>
      )}
      <button className="btn btn-primary" onClick={onRecited}>
        낭송했어요 — 다음
      </button>
    </>
  )
}

/** 2단계: 첫글자 복원 — 엿보기 횟수가 통과 판정의 증거다 */
export function FirstLetterStep({
  verse,
  peeks,
  attemptKey,
  failedPeeks,
  onPeek,
  onRetry,
  onDone,
}: {
  verse: VerseEntry
  peeks: number
  attemptKey: number
  failedPeeks: number | null
  onPeek: () => void
  onRetry: () => void
  onDone: () => void
}) {
  return (
    <>
      <h2 className="prompt-main">{verse.ref}</h2>
      <FirstLetterBoard key={attemptKey} text={verse.text} onPeek={onPeek} />
      <p className="muted small">
        첫 글자만 보고 낭송하세요. 막힌 어절만 탭 · 엿보기 {peeks}회
      </p>
      {failedPeeks !== null && (
        <div className="diff-score bad">
          엿보기 {failedPeeks}회 — 본문을 다시 읽고 재도전하세요 ({MAX_PEEKS_TO_PASS}회 이하
          통과)
        </div>
      )}
      <div className="btn-row">
        <button className="btn" onClick={onRetry}>
          다시 시도
        </button>
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
            <button className="btn btn-primary" onClick={onGraduate}>
              졸업 — 복습 큐에 추가
            </button>
          ) : (
            <>
              <p className="muted small">
                틀린 곳을 확인했으면 정답을 가리고 기억만으로 다시 도전하세요.
              </p>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={onRetry}>
                  다시 도전 (정답 가리고 재입력)
                </button>
                <button className="btn" onClick={onAccept}>
                  그냥 넘어가기
                </button>
              </div>
              <p className="muted small">
                오타처럼 의식하지 못한 실수였다면 넘어가도 됩니다 — 그대로 졸업합니다.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <label className="muted small" htmlFor="learn-typing">
            기억만으로 말씀 전체를 입력하세요
          </label>
          <textarea
            id="learn-typing"
            className="typing-input"
            value={attempt}
            onChange={(e) => {
              onAttempt(e.target.value)
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

/** 4단계: 졸업 */
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
  )
}
