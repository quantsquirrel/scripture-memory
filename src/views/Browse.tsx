import { useState } from 'react'

import {
  collectionOf,
  COLLECTIONS,
  sectionsOf,
  topicsOf,
  VERSES,
  versesOfTopic,
} from '../data/verses'
import { required } from '../domain/invariant'
import { isGraduated, type LearnProgress, stepOrdinal } from '../domain/ladder'
import { formatInterval } from '../domain/scheduler'
import {
  CollectionTabs,
  type SectionGroup,
  SectionPanel,
  type VerseStatus,
} from './browse/panels'
import { useBrowseData } from './hooks'

/** 첫 탭의 기본 선택 — 컬렉션 목록이 비면 데이터 무결성 오류다 */
const FIRST_COLLECTION_KEY = required(COLLECTIONS[0], '컬렉션 목록').key

function statusOf(
  progress: LearnProgress | undefined,
  dues: readonly string[],
  now: number,
): VerseStatus {
  if (!progress || progress.step === 'intro') return { label: '미학습', cls: 'st-new' }
  if (!isGraduated(progress)) {
    const { nth, total } = stepOrdinal(progress.step)
    return { label: `학습 ${nth}/${total}`, cls: 'st-learning' }
  }
  const minDue = dues.reduce<string | null>(
    (min, d) => (min === null || d < min ? d : min),
    null,
  )
  if (minDue === null) return { label: '암송 중', cls: 'st-done' }
  if (minDue <= new Date(now).toISOString()) return { label: '복습 대기', cls: 'st-due' }
  return { label: `${formatInterval(new Date(minDue).getTime() - now)} 후`, cls: 'st-done' }
}

export function Browse({ onLearn }: { onLearn: (verseId: string) => void }) {
  const data = useBrowseData()
  const [open, setOpen] = useState<string | null>(null)
  const [collection, setCollection] = useState(FIRST_COLLECTION_KEY)

  if (!data) return <p className="muted">불러오는 중…</p>

  const graduatedCount = (collectionKey: string): number =>
    VERSES.filter((v) => {
      const l = data.learning.get(v.id)
      return collectionOf(v).key === collectionKey && l !== undefined && isGraduated(l)
    }).length

  const groups: SectionGroup[] = sectionsOf(collection).map((section) => ({
    key: section.key,
    title: section.title,
    subtitle: section.subtitle,
    topics: topicsOf(section.key).map((topic, i, arr) => ({
      key: topic.key,
      title: topic.title,
      group: topic.group && (i === 0 || arr[i - 1]?.group !== topic.group) ? topic.group : null,
      verses: versesOfTopic(topic.key).map((verse) => ({
        id: verse.id,
        refAbbr: verse.refAbbr,
        text: verse.text,
        status: statusOf(
          data.learning.get(verse.id),
          (data.cardsByVerse.get(verse.id) ?? []).map((c) => c.card.due),
          data.now,
        ),
      })),
    })),
  }))

  return (
    <div>
      <CollectionTabs
        collections={COLLECTIONS.map((c) => ({
          key: c.key,
          short: c.short,
          done: graduatedCount(c.key),
          total: VERSES.filter((v) => collectionOf(v).key === c.key).length,
        }))}
        selected={collection}
        onSelect={setCollection}
      />
      {groups.map((group) => (
        <SectionPanel
          key={group.key}
          group={group}
          openVerseId={open}
          onToggle={(id) => {
            setOpen(open === id ? null : id)
          }}
          onLearn={onLearn}
        />
      ))}
    </div>
  )
}
