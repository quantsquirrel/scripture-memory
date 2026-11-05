import { useCallback, useEffect, useState } from 'react'

import { store } from '../app'
import {
  type RecalibrateUnit,
  type RecalibrateVerdict,
  recalibrateVerse,
} from '../app/recalibrate'
import { Chevron } from '../components/Chevron'
import { fillStyle } from '../components/fill'
import { LampMark } from '../components/LampMark'
import { topicOf, VERSE_BY_ID } from '../data/verses'
import { required } from '../domain/invariant'
import { useRecalibrateUnits } from './hooks'

/** 판정 셋 — 신호등 이모지 대신 버튼의 상태색 테두리(ok/warn/bad)와 낱말이 판정을 가리킨다 */
const VERDICTS: readonly { verdict: RecalibrateVerdict; key: string; label: string }[] = [
  { verdict: 'solid', key: '1', label: '온전히 기억남' },
  { verdict: 'shaky', key: '2', label: '가물가물함' },
  { verdict: 'forgotten', key: '3', label: '다시 사다리 타기' },
]

interface Tally {
  solid: number
  shaky: number
  forgotten: number
  rated: number
  deferred: number
}

const EMPTY_TALLY: Tally = { solid: 0, shaky: 0, forgotten: 0, rated: 0, deferred: 0 }

/** 진단 세션 — 시작 시점의 구절 목록을 고정해 둔다(강등된 구절이 도중에 빠지지 않게) */
interface Session {
  unit: RecalibrateUnit
  idx: number
  tally: Tally
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function Recalibrate({ onExit }: { onExit: () => void }) {
  const units = useRecalibrateUnits()
  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)

  const start = (unit: RecalibrateUnit) => {
    setSession({ unit, idx: 0, tally: EMPTY_TALLY })
    setRevealed(false)
  }

  const verseId = session ? session.unit.verseIds[session.idx] : undefined

  const judge = useCallback(
    async (verdict: RecalibrateVerdict) => {
      if (!session || verseId === undefined || busy) return
      setBusy(true)
      try {
        const r = await recalibrateVerse(store, verseId, verdict)
        const t = session.tally
        setSession({
          ...session,
          idx: session.idx + 1,
          tally: {
            ...t,
            [verdict]: t[verdict] + 1,
            rated: t.rated + r.rated,
            deferred: t.deferred + r.deferred,
          },
        })
        setRevealed(false)
      } finally {
        setBusy(false)
      }
    },
    [session, verseId, busy],
  )

  useEffect(() => {
    if (verseId === undefined) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
      if (e.key === ' ' && !revealed) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      const hit = VERDICTS.find((v) => v.key === e.key)
      if (hit && revealed) {
        e.preventDefault()
        void judge(hit.verdict)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [verseId, revealed, judge])

  if (units === null) return <p className="muted loading">불러오는 중…</p>

  if (!session) return <UnitPicker units={units} onPick={start} onExit={onExit} />

  const { unit, idx, tally } = session
  const total = unit.verseIds.length

  if (verseId === undefined) {
    const at = units.findIndex((u) => u.key === unit.key)
    const next = units.slice(at + 1).find((u) => u.verseIds.length > 0)
    return (
      <div className="stage">
        <div className="panel stage-card">
          <div className="finale">
            <LampMark />
            <h2>{unit.label} 개정 완료</h2>
            {/* 판정 셋을 나란히 센다 — 칸 위의 상태색 선이 판정을 가리킨다 */}
            <dl className="recal-summary">
              <div className="tally-solid">
                <dt>정상화</dt>
                <dd>{tally.solid}구절</dd>
              </div>
              <div className="tally-shaky">
                <dt>단기 복습 큐</dt>
                <dd>{tally.shaky}구절</dd>
              </div>
              <div className="tally-forgotten">
                <dt>사다리 복귀</dt>
                <dd>{tally.forgotten}구절</dd>
              </div>
            </dl>
            {tally.deferred > 0 && (
              <p className="muted small">
                말씀→장절 카드와 감사 차례 카드 {tally.deferred}장은 자가 판정으로 넘기지 않고
                복습 큐에 남겨 두었습니다. 복습 탭에서 객관 채점으로 확인하세요.
              </p>
            )}
          </div>
          <div className="stage-foot">
            {next && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  start(next)
                }}
              >
                다음 파트 개정하기: {next.label}
              </button>
            )}
            <button className="btn" onClick={onExit}>
              홈으로 가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const verse = required(VERSE_BY_ID[verseId], `구절 ${verseId}`)

  return (
    <div className="stage">
      <div className="review-top">
        <button
          className="btn-ghost"
          onClick={() => {
            setSession(null)
          }}
        >
          <Chevron dir="left" />
          파트 선택
        </button>
        <span
          className="progress progress-ink progress-thin"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={idx}
          aria-label="개정 진행률"
        >
          <span className="progress-fill" style={fillStyle(idx, total)} />
        </span>
        <span className="review-count">
          {idx} / {total} 완료
        </span>
      </div>
      <div key={verseId} className="panel stage-card">
        {/* 카드 머리줄 — 왼쪽은 개정 중인 단위, 오른쪽은 그 안의 차례(TMS 카드 모서리의 번호처럼) */}
        <p className="card-head">
          <span>{unit.label}</span>
          <span className="card-code">
            {unit.key}-{idx + 1}
          </span>
        </p>
        <h2 className="prompt-main">{topicOf(verse).title}</h2>
        <p className="answer-ref">{verse.ref}</p>
        {revealed ? (
          <>
            <p className="verse">{verse.text}</p>
            <p className="answer-ref answer-ref-end">{verse.ref}</p>
          </>
        ) : (
          <p className="muted">말씀을 마음속으로 끝까지 떠올린 뒤 본문을 확인하세요.</p>
        )}
        <div className="stage-foot">
          {revealed ? (
            <div className="recal-verdicts" role="group" aria-label="암송 상태 판정">
              {VERDICTS.map((v) => (
                <button
                  key={v.verdict}
                  className={`btn recal-${v.verdict}`}
                  disabled={busy}
                  onClick={() => {
                    void judge(v.verdict)
                  }}
                >
                  <kbd className="key-hint">{v.key}</kbd> {v.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => {
                setRevealed(true)
              }}
            >
              본문 확인 <kbd className="key-hint">Space</kbd>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function UnitPicker({
  units,
  onPick,
  onExit,
}: {
  units: readonly RecalibrateUnit[]
  onPick: (unit: RecalibrateUnit) => void
  onExit: () => void
}) {
  return (
    <div>
      <div className="review-top">
        <button className="btn-ghost" onClick={onExit}>
          <Chevron dir="left" />홈
        </button>
      </div>
      <section className="panel">
        <h2 className="screen-dup">말씀 상태 개정</h2>
        <p className="muted small">
          밀린 카드를 한 장씩 넘기는 대신, 구절마다 본문을 한 번 떠올려 보고 셋 중 하나로
          판정합니다. ‘온전히 기억남’은 낭송 ‘좋음’, ‘가물가물함’은 낭송 ‘다시’로 기록되고,
          ‘다시 사다리 타기’는 카드를 지우고 첫글자 복원 단계부터 다시 오릅니다. 말씀→장절
          카드와 타이핑·첫글자 감사 차례인 카드는 자가 판정으로 넘기지 않고 복습 큐에 남겨
          둡니다.
        </p>
        <div className="recal-units">
          {units.map((u) => (
            <button
              key={u.key}
              className="recal-unit"
              disabled={u.verseIds.length === 0}
              onClick={() => {
                onPick(u)
              }}
            >
              <span className="recal-unit-name">{u.label}</span>
              <span className="muted small recal-unit-meta">
                {u.verseIds.length}구절{u.due > 0 && `, 밀린 카드 ${u.due}장`}
              </span>
              <Chevron dir="right" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
