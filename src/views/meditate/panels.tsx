import { useState } from 'react'

import { BOOK_BY_ABBR, BOOKS } from '../../data/canon'
import type { VerseEntry } from '../../data/verses'
import type { QtPosition } from '../../domain/qt'

/** 사슬 한 줄: [오늘 읽은 절, …거쳐온 참조, 묵상 구절] */
export interface Chain {
  nodes: readonly string[]
}

export function TodayReadingPanel({
  planDay,
  planLabel,
  qt,
  qtEstimated,
  onSaveQt,
}: {
  planDay: number | null
  planLabel: string | null
  qt: QtPosition | null
  qtEstimated: boolean
  onSaveQt: (position: QtPosition) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="panel">
      <h2>오늘 읽은 말씀</h2>
      <dl className="reading-list">
        <div className="reading-row">
          <dt>통독</dt>
          <dd>
            {planLabel ?? <span className="muted">계획 기간 밖입니다</span>}
            {planDay !== null && <span className="muted small"> · {planDay}일차 / 365</span>}
          </dd>
        </div>
        <div className="reading-row">
          <dt>QT</dt>
          <dd>
            {qt ? (
              <>
                {qt.book} {qt.chapter}
                {qtEstimated && <span className="muted small"> · 하루씩 밀어 놓은 값</span>}
              </>
            ) : (
              <span className="muted">아직 적어두지 않았습니다</span>
            )}
            <button
              type="button"
              className="btn-ghost qt-edit"
              onClick={() => {
                setEditing((v) => !v)
              }}
              aria-expanded={editing}
            >
              {editing ? '닫기' : qt ? '고치기' : '적기'}
            </button>
          </dd>
        </div>
      </dl>
      {editing && (
        <QtEditor
          current={qt}
          onSave={(position) => {
            onSaveQt(position)
            setEditing(false)
          }}
        />
      )}
    </section>
  )
}

function QtEditor({
  current,
  onSave,
}: {
  current: QtPosition | null
  onSave: (position: QtPosition) => void
}) {
  const [book, setBook] = useState(current?.book ?? '창')
  const [chapter, setChapter] = useState(current?.chapter ?? 1)
  const chapters = BOOK_BY_ABBR.get(book)?.chapters ?? 1
  const safeChapter = Math.min(chapter, chapters)
  return (
    <form
      className="qt-editor"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ book, chapter: safeChapter })
      }}
    >
      <label>
        <span className="muted small">책</span>
        <select
          value={book}
          onChange={(e) => {
            setBook(e.target.value)
          }}
        >
          {BOOKS.map((b) => (
            <option key={b.abbr} value={b.abbr}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="muted small">장</span>
        <select
          value={safeChapter}
          onChange={(e) => {
            setChapter(Number(e.target.value))
          }}
        >
          {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary qt-save">
        저장
      </button>
    </form>
  )
}

export function MeditationVersePanel({
  verse,
  topicTitle,
  collection,
}: {
  verse: VerseEntry
  topicTitle: string
  collection: string
}) {
  return (
    <section className="panel meditation-panel">
      <h2>오늘 마음에 두실 말씀</h2>
      <blockquote className="meditation-verse">{verse.text}</blockquote>
      <p className="meditation-ref">{verse.ref}</p>
      <p className="muted small meditation-source">
        {topicTitle} · {collection}
      </p>
      <p className="muted small">
        외우기 위해서가 아니라 곱씹기 위해, 소리 내어 한 번 읽어보세요.
      </p>
    </section>
  )
}

/**
 * 참조 사슬.
 *
 * 본문을 함께 싣지 못하는 것은 한계가 아니라 관주(貫珠)의 방식이다 — 종이
 * 성경의 관주도 장절만 가리키고, 펼쳐 보는 일은 읽는 사람의 몫으로 남긴다.
 * 앱이 가진 본문은 검증된 암송 495구절뿐이라(하드 경계: 본문 정본), 가진
 * 것만 보여주고 나머지는 정직하게 장절로 남긴다.
 */
export function ChainPanel({
  chains,
  destination,
  textOf,
}: {
  chains: readonly Chain[]
  /** 도착점(묵상 구절)의 장절 — 사슬마다 되풀이하지 않고 아래에 한 번만 적는다 */
  destination: string
  textOf: (ref: string) => string | null
}) {
  if (chains.length === 0) return null
  return (
    <section className="panel">
      <h2>여기에 이르기까지</h2>
      <p className="muted small">
        오늘 읽은 본문의 이 자리들이 그 말씀을 가리킵니다 — 성경이 스스로 서로를 비추며 이어
        놓은 길입니다.
      </p>
      <ol className="chain-list">
        {chains.map((chain) => {
          // 마지막 노드는 늘 같은 도착점이라 줄마다 되풀이하지 않는다
          const steps = chain.nodes.slice(0, -1)
          return (
            <li
              key={chain.nodes.join('>')}
              className="chain"
              // 화살표는 aria-hidden이라 읽히지 않는다 — 관계를 문장으로 알려준다
              aria-label={`${steps.join(', 이어서 ')} 에서 ${destination}`}
            >
              <span className="chain-line">
                {steps.map((node, i) => (
                  <span key={`${node}-${String(i)}`}>
                    {i > 0 && (
                      <span className="chain-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    <span className={i === 0 ? 'chain-node chain-seed' : 'chain-node'}>
                      {node}
                    </span>
                  </span>
                ))}
              </span>
              {steps.map((node) => {
                const text = textOf(node)
                return text === null ? null : (
                  <span key={`t-${node}`} className="chain-text muted small">
                    {text}
                  </span>
                )
              })}
            </li>
          )
        })}
      </ol>
      <p className="chain-dest">
        <span className="chain-arrow" aria-hidden="true">
          ↓
        </span>{' '}
        {destination}
      </p>
    </section>
  )
}

export interface AlternateRow {
  verseId: string
  refAbbr: string
  topicTitle: string
  snippet: string
}

export function AlternatesPanel({ rows }: { rows: readonly AlternateRow[] }) {
  if (rows.length === 0) return null
  return (
    <details className="tech-details">
      <summary>함께 떠오른 말씀</summary>
      {rows.map((r) => (
        <div key={r.verseId} className="weak-item">
          <div className="weak-head">
            <span>
              {r.refAbbr} <span className="muted small">{r.topicTitle}</span>
            </span>
          </div>
          <p className="weak-snippet muted small">{r.snippet}</p>
        </div>
      ))}
      <p className="muted small">
        오늘 본문이 함께 불러낸 말씀들입니다 — 위의 한 구절이 마음에 닿지 않으면 여기서
        찾아보세요.
      </p>
    </details>
  )
}
