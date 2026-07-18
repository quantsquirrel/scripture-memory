import { useCallback, useEffect, useState } from 'react'
import { crumbOf, topicOf, VERSE_BY_ID, type VerseEntry } from '../data/verses'
import { DiffView } from '../components/DiffView'
import { FirstLetterBoard } from '../components/FirstLetterBoard'
import { RatingBar } from '../components/RatingBar'
import { gradeTyping, ratingFromAccuracy, ratingFromPeeks, type TypingGrade } from '../lib/diff'
import { gradeRef } from '../lib/refInput'
import { formatInterval } from '../lib/fsrs'
import { dueCards, nextDueAt, submitReview, upcomingLearningCards } from '../lib/db'
import { orderQueue, reviewMode } from '../lib/policy'
import type { ReviewMode, StoredCard } from '../lib/types'

/** 큐를 비운 뒤, 몇 분 안에 due가 오는 학습 단계 카드를 당겨 재도전하는 창 */
const LEARN_AHEAD_MS = 20 * 60_000

export function Review({ onExit }: { onExit: () => void }) {
  const [queue, setQueue] = useState<StoredCard[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(0)
  const [nextDue, setNextDue] = useState<string | null>(null)

  useEffect(() => {
    void dueCards().then((cards) => setQueue(orderQueue(cards)))
  }, [])

  const current = queue && idx < queue.length ? queue[idx] : null

  const rate = useCallback(
    async (
      r: 1 | 2 | 3 | 4,
      mode: ReviewMode,
      accuracy: number | null,
      peeks: number | null,
    ) => {
      if (!current) return
      await submitReview(current, r, mode, { accuracy, peeks })
      setDone((d) => d + 1)
      if (queue && idx + 1 < queue.length) {
        setIdx(idx + 1)
      } else {
        let more = await dueCards()
        if (more.length === 0) more = await upcomingLearningCards(LEARN_AHEAD_MS)
        if (more.length > 0) {
          setQueue(orderQueue(more))
          setIdx(0)
        } else {
          setQueue([])
          setIdx(0)
          setNextDue(await nextDueAt())
        }
      }
    },
    [current, queue, idx],
  )

  if (queue === null) return <p className="muted">불러오는 중…</p>

  if (!current) {
    return (
      <div className="panel center">
        <h2>{done > 0 ? '복습 완료!' : '복습할 카드가 없습니다'}</h2>
        {done > 0 && <p>이번 세션에서 {done}회 복습했습니다.</p>}
        {nextDue && (
          <p className="muted">
            다음 복습: {formatInterval(new Date(nextDue).getTime() - Date.now())} 후
          </p>
        )}
        {queue.length === 0 && done === 0 && (
          <p className="muted">새 구절을 학습하면 카드가 생성됩니다.</p>
        )}
        <button className="btn btn-primary" onClick={onExit}>
          홈으로
        </button>
      </div>
    )
  }

  const verse = VERSE_BY_ID[current.verseId]
  const mode = reviewMode(current.direction, current.card.reps)
  const remaining = queue.length - idx

  return (
    <div>
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          ← 종료
        </button>
        <span className="muted">남은 카드 {remaining}</span>
      </div>
      <CardFace key={current.key + ':' + current.card.reps} sc={current} verse={verse} mode={mode} onRate={rate} />
    </div>
  )
}

function Prompt({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'topic') {
    return (
      <div className="prompt">
        <span className="chip">{crumbOf(verse).join(' · ')}</span>
        <h2 className="prompt-main">{topicOf(verse).title}</h2>
        <p className="muted">이 주제의 장절과 말씀을 낭송하세요</p>
      </div>
    )
  }
  if (sc.direction === 'ref') {
    return (
      <div className="prompt">
        <h2 className="prompt-main">{verse.ref}</h2>
        <p className="muted">말씀을 낭송하세요</p>
      </div>
    )
  }
  return (
    <div className="prompt">
      <p className="verse">{verse.text}</p>
      <p className="muted">이 말씀의 장절은?</p>
    </div>
  )
}

function Answer({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'text') {
    return (
      <div className="answer">
        <h3>{verse.ref}</h3>
        <p className="muted">
          {crumbOf(verse).join(' · ')} — {topicOf(verse).title}
        </p>
      </div>
    )
  }
  return (
    <div className="answer">
      <p className="answer-ref">{verse.ref}</p>
      <p className="verse">{verse.text}</p>
      <p className="answer-ref">{verse.ref}</p>
    </div>
  )
}

function CardFace({
  sc,
  verse,
  mode,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  mode: ReviewMode
  onRate: (r: 1 | 2 | 3 | 4, mode: ReviewMode, accuracy: number | null, peeks: number | null) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [peeks, setPeeks] = useState(0)
  const [attempt, setAttempt] = useState('')
  const [grade, setGrade] = useState<TypingGrade | null>(null)
  const [refOk, setRefOk] = useState<boolean | null>(null)

  const modeLabel: Record<ReviewMode, string> = {
    recite: '소리 내어 낭송',
    firstLetter: '첫글자 힌트',
    typing: '타이핑 감사',
    refInput: '장절 입력',
  }

  return (
    <div className="panel">
      <div className="mode-tag">{modeLabel[mode]}</div>
      <Prompt sc={sc} verse={verse} />

      {mode === 'recite' && !revealed && (
        <button className="btn btn-primary" onClick={() => setRevealed(true)}>
          정답 보기
        </button>
      )}
      {mode === 'recite' && revealed && (
        <>
          <Answer sc={sc} verse={verse} />
          <RatingBar card={sc.card} onRate={(r) => onRate(r, mode, null, null)} />
        </>
      )}

      {mode === 'firstLetter' && !revealed && (
        <>
          <FirstLetterBoard text={verse.text} onPeek={() => setPeeks((p) => p + 1)} />
          <p className="muted small">막히는 어절만 탭하세요 · 엿보기 {peeks}회</p>
          <button className="btn btn-primary" onClick={() => setRevealed(true)}>
            낭송 완료 — 확인
          </button>
        </>
      )}
      {mode === 'firstLetter' && revealed && (
        <>
          <Answer sc={sc} verse={verse} />
          <p className="muted small">엿보기 {peeks}회 → 제안 등급이 강조됩니다</p>
          <RatingBar
            card={sc.card}
            suggested={ratingFromPeeks(peeks)}
            onRate={(r) => onRate(r, mode, null, peeks)}
          />
        </>
      )}

      {mode === 'typing' && !grade && (
        <>
          <textarea
            className="typing-input"
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder="말씀을 입력하세요 (구두점 무시)"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={5}
          />
          <button
            className="btn btn-primary"
            disabled={attempt.trim() === ''}
            onClick={() => setGrade(gradeTyping(verse.text, attempt))}
          >
            채점
          </button>
        </>
      )}
      {mode === 'typing' && grade && (
        <>
          <DiffView grade={grade} target={verse.text} />
          <Answer sc={sc} verse={verse} />
          <RatingBar
            card={sc.card}
            suggested={ratingFromAccuracy(grade)}
            onRate={(r) => onRate(r, mode, grade.accuracy, null)}
          />
        </>
      )}

      {mode === 'refInput' && refOk === null && (
        <>
          <input
            className="ref-input"
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder="예: 고후 5:17 / 빌립보서 4:6-7"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            className="btn btn-primary"
            disabled={attempt.trim() === ''}
            onClick={() => setRefOk(gradeRef(verse, attempt))}
          >
            확인
          </button>
        </>
      )}
      {mode === 'refInput' && refOk !== null && (
        <>
          <div className={`diff-score ${refOk ? 'good' : 'bad'}`}>
            {refOk ? '정답!' : `오답 — 입력: ${attempt}`}
          </div>
          <Answer sc={sc} verse={verse} />
          <RatingBar
            card={sc.card}
            suggested={refOk ? 3 : 1}
            onRate={(r) => onRate(r, mode, refOk ? 1 : 0, null)}
          />
        </>
      )}
    </div>
  )
}
