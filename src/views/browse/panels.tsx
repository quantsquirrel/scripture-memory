export interface VerseStatus {
  label: string
  cls: string
}

export interface VerseRow {
  id: string
  refAbbr: string
  text: string
  status: VerseStatus
}

export interface TopicGroup {
  key: string
  title: string
  /** 이 주제 앞에 표시할 그룹 제목 (같은 그룹이 이어지면 null) */
  group: string | null
  verses: readonly VerseRow[]
}

export interface SectionGroup {
  key: string
  title: string
  subtitle: string
  topics: readonly TopicGroup[]
}

export function CollectionTabs({
  collections,
  selected,
  onSelect,
}: {
  collections: readonly { key: string; short: string; done: number; total: number }[]
  selected: string
  onSelect: (key: string) => void
}) {
  return (
    <div className="col-tabs" role="tablist" aria-label="암송 과정">
      {collections.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={selected === c.key}
          className={`col-tab${selected === c.key ? ' active' : ''}`}
          onClick={() => {
            onSelect(c.key)
          }}
        >
          <span>{c.short}</span>
          <span className="muted small">
            {c.done}/{c.total}
          </span>
        </button>
      ))}
    </div>
  )
}

function actionLabel(cls: string): string {
  if (cls === 'st-new') return '학습 시작'
  return cls === 'st-learning' ? '학습 이어가기' : '다시 훈련'
}

export function SectionPanel({
  group,
  openVerseId,
  onToggle,
  onLearn,
}: {
  group: SectionGroup
  openVerseId: string | null
  onToggle: (verseId: string) => void
  onLearn: (verseId: string) => void
}) {
  return (
    <section className="panel">
      <h2>
        {group.title} {group.subtitle && <span className="muted small">{group.subtitle}</span>}
      </h2>
      {group.topics.map((topic) => (
        <div key={topic.key}>
          {topic.group !== null && <h3 className="group-title">{topic.group}</h3>}
          <h3 className="topic-title">{topic.title}</h3>
          {topic.verses.map((verse) => (
            <div key={verse.id}>
              <button
                type="button"
                className="verse-row"
                aria-expanded={openVerseId === verse.id}
                onClick={() => {
                  onToggle(verse.id)
                }}
              >
                <span>{verse.refAbbr}</span>
                <span className={`status ${verse.status.cls}`}>{verse.status.label}</span>
              </button>
              {openVerseId === verse.id && (
                <div className="verse-detail">
                  <p className="verse">{verse.text}</p>
                  <button
                    className="btn"
                    onClick={() => {
                      onLearn(verse.id)
                    }}
                  >
                    {actionLabel(verse.status.cls)}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
