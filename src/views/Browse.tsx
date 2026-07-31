import { useEffect, useState } from 'react'

import { getAllCards, getAllLearning } from '../app'
import {
  collectionOf,
  COLLECTIONS,
  sectionsOf,
  topicsOf,
  type VerseEntry,
  VERSES,
  versesOfTopic,
} from '../data/verses'
import type { StoredCard } from '../domain/card'
import { required } from '../domain/invariant'
import { isGraduated, type LearnProgress, stepOrdinal } from '../domain/ladder'
import { formatInterval } from '../domain/scheduler'

/** 첫 탭의 기본 선택 — 컬렉션 목록이 비면 데이터 무결성 오류다 */
const FIRST_COLLECTION_KEY = required(COLLECTIONS[0], '컬렉션 목록').key

export function Browse({ onLearn }: { onLearn: (verseId: string) => void }) {
  const [learning, setLearning] = useState<Map<string, LearnProgress>>(new Map())
  const [cards, setCards] = useState<Map<string, StoredCard[]>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [col, setCol] = useState(FIRST_COLLECTION_KEY)
  /** 로드 시각 스냅샷 — 0이면 아직 안 불러온 상태. 렌더 중 Date.now()를 부르지 않는다 */
  const [loadedAt, setLoadedAt] = useState(0)

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
      setLoadedAt(Date.now())
    })
  }, [])

  if (loadedAt === 0) return <p className="muted">불러오는 중…</p>

  const status = (v: VerseEntry): { label: string; cls: string } => {
    const l = learning.get(v.id)
    if (!l || l.step === 'intro') return { label: '미학습', cls: 'st-new' }
    if (!isGraduated(l)) {
      const { nth, total } = stepOrdinal(l.step)
      return { label: `학습 ${nth}/${total}`, cls: 'st-learning' }
    }
    const vc = cards.get(v.id) ?? []
    const minDue = vc.reduce<string | null>(
      (min, c) => (min === null || c.card.due < min ? c.card.due : min),
      null,
    )
    if (minDue && minDue <= new Date(loadedAt).toISOString())
      return { label: '복습 대기', cls: 'st-due' }
    return {
      label: minDue ? `${formatInterval(new Date(minDue).getTime() - loadedAt)} 후` : '암송 중',
      cls: 'st-done',
    }
  }

  const graduatedCount = (ck: string) =>
    VERSES.filter((v) => {
      const l = learning.get(v.id)
      return collectionOf(v).key === ck && l !== undefined && isGraduated(l)
    }).length

  return (
    <div>
      <div className="col-tabs">
        {COLLECTIONS.map((c) => {
          const total = VERSES.filter((v) => collectionOf(v).key === c.key).length
          return (
            <button
              key={c.key}
              className={`col-tab${col === c.key ? ' active' : ''}`}
              onClick={() => {
                setCol(c.key)
              }}
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
            const showGroup = t.group && (i === 0 || arr[i - 1]?.group !== t.group)
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
                        onClick={() => {
                          setOpen(open === v.id ? null : v.id)
                        }}
                      >
                        <span>{v.refAbbr}</span>
                        <span className={`status ${st.cls}`}>{st.label}</span>
                      </button>
                      {open === v.id && (
                        <div className="verse-detail">
                          <p className="verse">{v.text}</p>
                          <button
                            className="btn"
                            onClick={() => {
                              onLearn(v.id)
                            }}
                          >
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
