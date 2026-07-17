import { useEffect, useState } from 'react'
import {
  COLLECTIONS,
  collectionOf,
  sectionsOf,
  topicsOf,
  VERSES,
  versesOfTopic,
  type VerseEntry,
} from '../data/verses'
import { getAllCards, getAllLearning } from '../lib/db'
import { formatInterval } from '../lib/fsrs'
import type { LearnProgress, StoredCard } from '../lib/types'

export function Browse({ onLearn }: { onLearn: (verseId: string) => void }) {
  const [learning, setLearning] = useState<Map<string, LearnProgress>>(new Map())
  const [cards, setCards] = useState<Map<string, StoredCard[]>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [col, setCol] = useState(COLLECTIONS[0].key)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([getAllLearning(), getAllCards()]).then(([ls, cs]) => {
      setLearning(new Map(ls.map((l) => [l.verseId, l])))
      const m = new Map<string, StoredCard[]>()
      for (const c of cs) {
        const arr = m.get(c.verseId) ?? []
        arr.push(c)
        m.set(c.verseId, arr)
      }
      setCards(m)
      setLoaded(true)
    })
  }, [])

  if (!loaded) return <p className="muted">불러오는 중…</p>

  const status = (v: VerseEntry): { label: string; cls: string } => {
    const l = learning.get(v.id)
    if (!l || l.step === 0) return { label: '미학습', cls: 'st-new' }
    if (l.step < 3) return { label: `학습 ${l.step + 1}/4`, cls: 'st-learning' }
    const vc = cards.get(v.id) ?? []
    const minDue = vc.reduce<string | null>(
      (min, c) => (min === null || c.card.due < min ? c.card.due : min),
      null,
    )
    if (minDue && minDue <= new Date().toISOString()) return { label: '복습 대기', cls: 'st-due' }
    return {
      label: minDue ? `${formatInterval(new Date(minDue).getTime() - Date.now())} 후` : '암송 중',
      cls: 'st-done',
    }
  }

  const graduatedCount = (ck: string) =>
    VERSES.filter((v) => collectionOf(v).key === ck && (learning.get(v.id)?.step ?? 0) >= 3)
      .length

  return (
    <div>
      <div className="col-tabs">
        {COLLECTIONS.map((c) => {
          const total = VERSES.filter((v) => collectionOf(v).key === c.key).length
          return (
            <button
              key={c.key}
              className={`col-tab${col === c.key ? ' active' : ''}`}
              onClick={() => setCol(c.key)}
            >
              <span>{c.short}</span>
              <span className="muted small">
                {graduatedCount(c.key)}/{total}
              </span>
            </button>
          )
        })}
      </div>

      {sectionsOf(col).map((s) => (
        <section key={s.key} className="panel">
          <h2>
            {s.title} {s.subtitle && <span className="muted small">{s.subtitle}</span>}
          </h2>
          {topicsOf(s.key).map((t, i, arr) => {
            const showGroup = t.group && (i === 0 || arr[i - 1].group !== t.group)
            return (
              <div key={t.key}>
                {showGroup && <h3 className="group-title">{t.group}</h3>}
                <h3 className="topic-title">{t.title}</h3>
                {versesOfTopic(t.key).map((v) => {
                  const st = status(v)
                  return (
                    <div key={v.id}>
                      <button
                        className="verse-row"
                        onClick={() => setOpen(open === v.id ? null : v.id)}
                      >
                        <span>{v.refAbbr}</span>
                        <span className={`status ${st.cls}`}>{st.label}</span>
                      </button>
                      {open === v.id && (
                        <div className="verse-detail">
                          <p className="verse">{v.text}</p>
                          <button className="btn" onClick={() => onLearn(v.id)}>
                            {st.cls === 'st-new'
                              ? '학습 시작'
                              : st.cls === 'st-learning'
                                ? '학습 이어가기'
                                : '다시 훈련'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
