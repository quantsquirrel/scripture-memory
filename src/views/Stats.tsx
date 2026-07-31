import { topicOf, VERSE_BY_ID, VERSES } from '../data/verses'
import { EXAM_RETENTION } from '../domain/goal'
import { DEFAULT_RETENTION } from '../domain/scheduler'
import { useStatsSummary } from './hooks'
import { TechDetails } from './stats/details'
import {
  EngravedPanel,
  HeartFieldPanel,
  type Meditation,
  MeditationPanel,
  StreakPanel,
  type WeakEntry,
  WeakVersesPanel,
} from './stats/reflect'

/** 시 119:11 후반절 — 정본 데이터(C6b)에서 잘라 쓴다. 없으면 표시 생략 */
const EPIGRAPH: string | null = (() => {
  const t = VERSE_BY_ID['C6b']?.text ?? ''
  const i = t.indexOf('내가 주께 범죄치')
  return i >= 0 ? t.slice(i) : null
})()

/** 컨테이너: 훅에서 받은 스냅샷을 프레젠테이션이 쓸 모양으로만 옮긴다 */
export function Stats() {
  const data = useStatsSummary()
  if (!data) return <p className="muted">불러오는 중…</p>

  const meditationVerse =
    data.meditationId === null ? undefined : VERSE_BY_ID[data.meditationId]
  const meditation: Meditation | null = meditationVerse
    ? {
        text: meditationVerse.text,
        refAbbr: meditationVerse.refAbbr,
        topicTitle: topicOf(meditationVerse).title,
      }
    : null

  // 본문이 없는 구절(다른 버전 백업에서 온 id)은 목록에서 뺀다
  const weakEntries: WeakEntry[] = data.weak.flatMap((w) => {
    const verse = VERSE_BY_ID[w.verseId]
    if (!verse) return []
    return [
      {
        verseId: w.verseId,
        refAbbr: verse.refAbbr,
        topicTitle: topicOf(verse).title,
        snippet: verse.text.length > 40 ? `${verse.text.slice(0, 40)}…` : verse.text,
        lapses: w.lapses,
      },
    ]
  })

  const learnEnd = new Date(
    new Date(`${data.goal.goalDate}T12:00:00`).getTime() - data.goal.bufferDays * 86400_000,
  )

  return (
    <div>
      <EngravedPanel
        engraved={data.graduatedIds.size}
        total={VERSES.length}
        avgRetrievability={data.knowledge.avgRetrievability}
        epigraph={EPIGRAPH}
      />
      <MeditationPanel meditation={meditation} engraved={data.graduatedIds.size} />
      <WeakVersesPanel entries={weakEntries} />
      <HeartFieldPanel rows={data.fields} />
      <StreakPanel history={data.history} />
      <TechDetails
        d={data}
        retentionTarget={data.examActive ? EXAM_RETENTION : DEFAULT_RETENTION}
        learnEndLabel={`${learnEnd.getMonth() + 1}/${learnEnd.getDate()}`}
      />
    </div>
  )
}
