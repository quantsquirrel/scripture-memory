import { useEffect, useState } from 'react'

import { rememberMeditation, setQtPosition } from '../app'
import { collectionOf, topicOf, VERSE_BY_ID, VERSES } from '../data/verses'
import type { QtPosition } from '../domain/qt'
import { useMeditation } from './hooks'
import {
  type AlternateRow,
  AlternatesPanel,
  type Chain,
  ChainPanel,
  MeditationVersePanel,
  TodayReadingPanel,
} from './meditate/panels'
import { Stats } from './Stats'

/**
 * 낱개 절 표기('삼하 11:2') → 암송 코퍼스의 본문.
 *
 * 참조 사슬의 중간 지점은 대부분 코퍼스 밖이라 본문이 없다. 있는 것만
 * 곁들이고 없는 것은 장절로 남긴다 — 검증되지 않은 본문을 지어 넣지 않는다.
 */
const TEXT_BY_VERSE: ReadonlyMap<string, string> = new Map(
  VERSES.flatMap((v) =>
    v.verses.map((n) => [`${v.bookAbbr} ${v.chapter}:${n}`, v.text] as const),
  ),
)

const REF_RE = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/

function corpusTextFor(ref: string): string | null {
  const m = REF_RE.exec(ref)
  if (!m?.[1] || !m[2] || !m[3]) return null
  const from = parseInt(m[3], 10)
  const to = m[4] === undefined ? from : parseInt(m[4], 10)
  for (let n = from; n <= to; n++) {
    const text = TEXT_BY_VERSE.get(`${m[1]} ${m[2]}:${n}`)
    if (text !== undefined) return text.length > 52 ? `${text.slice(0, 52)}…` : text
  }
  return null
}

export function Meditate() {
  const data = useMeditation()
  const pick = data?.result.pick ?? null
  const dateKey = data?.dateKey ?? null
  const pickedId = pick?.verseId ?? null

  // 오늘 보여준 구절을 남긴다 — 몇 달 안에 같은 말씀이 다시 오지 않게 하는
  // 용도뿐이라 리비전을 올리지 않는다(올리면 자기 자신을 다시 읽어 맴돈다).
  useEffect(() => {
    if (dateKey === null || pickedId === null) return
    void rememberMeditation(dateKey, pickedId)
  }, [dateKey, pickedId])

  if (!data) return <p className="muted">불러오는 중…</p>

  const verse = pickedId === null ? undefined : VERSE_BY_ID[pickedId]
  const chains: Chain[] = (pick?.chains ?? []).map((nodes) => ({ nodes }))
  const alternates: AlternateRow[] = data.result.alternates.flatMap((a) => {
    const v = VERSE_BY_ID[a.verseId]
    if (!v) return []
    return [
      {
        verseId: a.verseId,
        refAbbr: v.refAbbr,
        topicTitle: topicOf(v).title,
        snippet: v.text.length > 46 ? `${v.text.slice(0, 46)}…` : v.text,
      },
    ]
  })

  return (
    <div>
      <TodayReadingPanel
        planDay={data.planDay}
        planLabel={data.planLabel}
        qt={data.qt}
        qtEstimated={data.qtEstimated}
        onSaveQt={(position: QtPosition) => {
          void setQtPosition(position, data.dateKey)
        }}
      />

      {verse && pick ? (
        <>
          <MeditationVersePanel
            verse={verse}
            topicTitle={topicOf(verse).title}
            collection={collectionOf(verse).short}
          />
          <ChainPanel
            chains={chains}
            destination={verse.refAbbr}
            fromLabel={pick.from.label}
            textOf={corpusTextFor}
          />
          <AlternatesPanel rows={alternates} />
        </>
      ) : (
        <section className="panel">
          <h2>오늘 마음에 두실 말씀</h2>
          <p className="muted">
            {data.plan === null
              ? '통독 계획 기간(2026-08-18 ~ 2027-08-17) 밖의 날입니다. QT 본문을 적어두면 거기서 한 구절을 찾아 드립니다.'
              : '오늘 본문에서 이어지는 암송 구절을 찾지 못했습니다.'}
          </p>
        </section>
      )}

      <PastSteps />
    </div>
  )
}

/**
 * 지난 걸음(옛 돌아보기 지표) — 접어서 남겨 둔다.
 * 펼치기 전에는 불러오지 않는다: 묵상 화면이 통계 조회를 기다리지 않게 한다.
 */
function PastSteps() {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="tech-details"
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
      }}
    >
      <summary>지난 걸음 돌아보기</summary>
      {open && <Stats />}
    </details>
  )
}
