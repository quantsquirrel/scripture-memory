import { HistoryBars } from '../../components/StatCharts'
import type { ReviewHistory } from '../../domain/stats'

export const pct = (r: number): string => `${Math.round(r * 100)}%`

export interface Meditation {
  text: string
  refAbbr: string
  topicTitle: string
}

export interface WeakEntry {
  verseId: string
  refAbbr: string
  topicTitle: string
  snippet: string
  lapses: number
}

export interface FieldRow {
  key: string
  label: string
  done: number
  depth: number | null
}

export function EngravedPanel({
  engraved,
  total,
  avgRetrievability,
  epigraph,
}: {
  engraved: number
  total: number
  avgRetrievability: number | null
  epigraph: string | null
}) {
  return (
    <section className="panel">
      <h2>마음에 새긴 말씀</h2>
      {epigraph !== null && (
        <div className="callout">
          {epigraph}
          <span className="muted small"> — 시 119:11</span>
        </div>
      )}
      <p>
        <strong className="big-number">{engraved}</strong>
        <span className="muted">/{total}구절</span>이 마음에 새겨져 있습니다
        {avgRetrievability !== null && (
          <span className="muted"> · 지금도 {pct(avgRetrievability)}쯤 생생하게</span>
        )}
      </p>
      <p className="muted small">
        암송은 시험을 위해서가 아니라, 필요한 순간에 말씀이 먼저 떠오르게 하기 위한 훈련입니다.
      </p>
    </section>
  )
}

export function MeditationPanel({
  meditation,
  engraved,
}: {
  meditation: Meditation | null
  engraved: number
}) {
  return (
    <section className="panel">
      <h2>오늘 다시 음미할 말씀</h2>
      {meditation ? (
        <>
          <p className="verse">{meditation.text}</p>
          <p className="answer-ref">
            {meditation.refAbbr}
            <span className="muted small"> · {meditation.topicTitle}</span>
          </p>
          <p className="muted small">
            이미 새긴 {engraved}구절 중 오늘의 하나 — 외우기 위해서가 아니라 곱씹기 위해, 소리
            내어 한 번 읽어보세요. 내일은 다음 구절이 찾아옵니다.
          </p>
        </>
      ) : (
        <p className="muted">첫 구절을 새기면, 여기서 매일 한 구절씩 다시 만나게 됩니다.</p>
      )}
    </section>
  )
}

export function WeakVersesPanel({ entries }: { entries: readonly WeakEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="panel">
      <h2>다시 붙들 말씀</h2>
      {entries.map((w) => (
        <div key={w.verseId} className="weak-item">
          <div className="weak-head">
            <span>
              {w.refAbbr} <span className="muted small">{w.topicTitle}</span>
            </span>
            <span className="muted small">{w.lapses}번 다시 붙듦</span>
          </div>
          <p className="weak-snippet muted small">{w.snippet}</p>
        </div>
      ))}
      <p className="muted small">
        자주 놓치는 말씀은 어쩌면 지금 내게 가장 필요한 말씀입니다 — 복습에서 다시 만나면 뜻을
        한 번 더 새겨보세요.
      </p>
    </section>
  )
}

export function HeartFieldPanel({ rows }: { rows: readonly FieldRow[] }) {
  return (
    <section className="panel">
      <h2>마음 밭</h2>
      {rows.map((row) => (
        <div key={row.key} className="col-row col-row-static">
          <span className="col-label">{row.label}</span>
          <span className="progress col-bar">
            <span className="progress-fill" style={{ width: `${(row.depth ?? 0) * 100}%` }} />
          </span>
          <span className="muted small">
            {row.done > 0 && row.depth !== null ? `${row.done}구절 · ${pct(row.depth)}` : '—'}
          </span>
        </div>
      ))}
      <p className="muted small">
        영역별로 말씀이 얼마나 깊이 새겨져 있는지 (막대 = 새긴 구절의 평균 기억 생생함) — 비어
        있는 밭이 다음에 심을 자리입니다.
      </p>
    </section>
  )
}

export function StreakPanel({ history }: { history: ReviewHistory }) {
  return (
    <section className="panel">
      <h2>동행</h2>
      <p>
        <strong className="big-number">{history.streak}</strong>일째 매일 말씀과 동행
        <span className="muted"> · 최근 7일 하루 평균 {Math.round(history.avgPerDay)}회</span>
      </p>
      <HistoryBars counts={history.counts} />
      <p className="muted small">
        몰아서 외우는 것보다 매일 조금씩 만나는 것이 마음에 새기는 길입니다.
      </p>
    </section>
  )
}
