import { useState } from 'react'

import { BOOK_BY_ABBR, BOOKS } from '../../data/canon'
import type { VerseEntry } from '../../data/verses'
import type { QtPosition } from '../../domain/qt'
import type { Passage } from '../../domain/scripture'

/** 사슬 한 줄: [오늘 읽은 절, …거쳐온 참조, 묵상 구절] */
export interface Chain {
  nodes: readonly string[]
}

/**
 * 사슬에 곁들이는 본문의 길이.
 *
 * 사슬 세 줄 × 자리 두 곳이면 여섯 줄이 전부 본문으로 찬다. 여기서 눈이
 * 지치면 정작 위의 묵상 구절로 돌아가지 못한다 — 곁들임은 곁들임에 그쳐야
 * 하므로 한 줄 남짓에서 끊는다.
 */
const CHAIN_TEXT_MAX = 44

const clip = (text: string): string =>
  text.length > CHAIN_TEXT_MAX ? `${text.slice(0, CHAIN_TEXT_MAX)}…` : text

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
 * 종이 성경의 관주(貫珠)는 장절만 가리키고 펼쳐 보는 일을 읽는 사람의 몫으로
 * 남긴다. 여기서는 장절을 먼저 보이고 본문을 그 아래 곁들인다 — 관주의 순서를
 * 지키되 펼치는 수고는 덜어 준다.
 *
 * 본문은 정본 등급이 두 단이다. 495구절에 있는 자리는 사용자가 실제로 외운
 * 그 문장(그 띄어쓰기)이 나오고, 나머지는 개역한글 전문에서 온다. 우선순위는
 * `domain/scripture.ts`의 textOf에 있다.
 */
export function ChainPanel({
  chains,
  destination,
  fromLabel,
  textOf,
}: {
  chains: readonly Chain[]
  /** 도착점(묵상 구절)의 장절 — 사슬마다 되풀이하지 않고 아래에 한 번만 적는다 */
  destination: string
  /** 사슬이 시작된 본문 ('고전 15') — 통독과 QT 중 어느 쪽인지 밝힌다 */
  fromLabel: string
  textOf: (ref: string) => Passage | null
}) {
  if (chains.length === 0) return null
  return (
    <section className="panel">
      {/*
        제목이 목록의 방향과 같아야 한다. "여기에 이르기까지"는 바로 위 묵상
        구절을 "여기"로 읽게 만드는데, 정작 목록에 적힌 것은 오늘 읽은 자리들이다.
      */}
      <h2>이 말씀을 가리키는 자리</h2>
      <p className="muted small">
        오늘 읽은 <strong>{fromLabel}</strong>의 이 자리들에서 이어집니다 — 성경이 스스로 서로를
        비추며 놓아 둔 관주(貫珠)의 길입니다.
      </p>
      <ol className="chain-list">
        {chains.map((chain, order) => {
          // 마지막 노드는 늘 같은 도착점이라 줄마다 되풀이하지 않는다
          const steps = chain.nodes.slice(0, -1)
          return (
            <li
              key={chain.nodes.join('>')}
              // 세 줄이 동등해 보이면 아래 화살표가 어디서 출발했는지 모호해진다.
              // 가장 강하게 이끈 한 줄만 승격한다.
              className={order === 0 ? 'chain chain-primary' : 'chain'}
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
                    {/* 경유 지점은 오늘 읽은 자리가 아니므로 한 단계 낮춘다 */}
                    <span
                      className={i === 0 ? 'chain-node chain-seed' : 'chain-node chain-via'}
                    >
                      {node}
                    </span>
                  </span>
                ))}
              </span>
              {steps.map((node) => {
                const passage = textOf(node)
                if (passage === null) return null
                /*
                  이제 대개 모든 자리에 본문이 붙는다. 자리가 여럿이면 어느
                  본문이 어느 자리의 것인지 장절 없이는 알 수 없고, 펼친 범위가
                  물은 자리보다 넓으면(사 7:9 → 사 7:8-9) 그 사실도 밝혀야 한다.
                  둘 다 아니면 바로 위에 적힌 장절을 되풀이할 뿐이라 생략한다.
                */
                const needsRef = steps.length > 1 || passage.ref !== node
                return (
                  <span key={`t-${node}`} className="chain-text muted small">
                    {needsRef && <span className="chain-text-ref">{passage.ref}</span>}
                    {clip(passage.text)}
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
      <summary>함께 가리키는 말씀</summary>
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
        오늘 본문이 함께 가리키는 말씀들입니다 — 위의 한 구절이 마음에 닿지 않으면 여기서
        찾아보세요.
      </p>
    </details>
  )
}
