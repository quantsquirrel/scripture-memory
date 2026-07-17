import { useEffect, useState } from 'react'
import { SERIES, TOPIC_TITLES, VERSES, type VerseEntry } from '../data/verses'
import { getAllCards, getAllLearning } from '../lib/db'
import { formatInterval } from '../lib/fsrs'
import type { LearnProgress, StoredCard } from '../lib/types'

export function Browse({ onLearn }: { onLearn: (verseId: string) => void }) {
  const [learning, setLearning] = useState<Map<string, LearnProgress>>(new Map())
  const [cards, setCards] = useState<Map<string, StoredCard[]>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
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

  return (
    <div>
      {SERIES.map((s) => (
        <section key={s.key} className="panel">
          <h2>
            {s.key}. {s.title} <span className="muted small">{s.subtitle}</span>
          </h2>
          {VERSES.filter((v) => v.topicKey[0] === s.key).map((v, i, arr) => {
            const st = status(v)
            const showTopic = i === 0 || arr[i - 1].topicKey !== v.topicKey
            return (
              <div key={v.id}>
                {showTopic && <h3 className="topic-title">{TOPIC_TITLES[v.topicKey]}</h3>}
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
                      {st.cls === 'st-new' ? '학습 시작' : st.cls === 'st-learning' ? '학습 이어가기' : '다시 훈련'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
