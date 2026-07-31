import { crumbOf, topicOf, topicOrdinalOf, type VerseEntry } from '../../data/verses'
import type { StoredCard } from '../../domain/card'

export function Prompt({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'topic') {
    const { nth, total } = topicOrdinalOf(verse)
    return (
      <div className="prompt">
        <span className="chip">{crumbOf(verse).join(' · ')}</span>
        <h2 className="prompt-main">
          {topicOf(verse).title}
          {total > 1 && (
            <span className="prompt-ord">
              {nth}/{total}
            </span>
          )}
        </h2>
        <p className="muted">
          {total > 1
            ? `이 주제 ${total}구절 중 ${ordinalKo(nth)} 구절의 장절과 말씀을 낭송하세요`
            : '이 주제의 장절과 말씀을 낭송하세요'}
        </p>
      </div>
    )
  }
  if (sc.direction === 'ref') {
    return (
      <div className="prompt">
        <h2 className="prompt-main">{verse.ref}</h2>
        <p className="muted">이 장절의 제목과 말씀을 낭송하세요</p>
      </div>
    )
  }
  return (
    <div className="prompt">
      <p className="verse">{verse.text}</p>
      <p className="muted">이 말씀의 장절은?</p>
    </div>
  )
}

function ordinalKo(n: number): string {
  return ['첫째', '둘째', '셋째', '넷째'][n - 1] ?? `${n}번째`
}

export function Answer({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'text') {
    return (
      <div className="answer">
        <h3>{verse.ref}</h3>
        <p className="muted">
          {crumbOf(verse).join(' · ')} — {topicOf(verse).title}
        </p>
      </div>
    )
  }
  return (
    <div className="answer">
      {sc.direction === 'ref' && (
        <p className="muted">
          {crumbOf(verse).join(' · ')} — {topicOf(verse).title}
        </p>
      )}
      <p className="answer-ref">{verse.ref}</p>
      <p className="verse">{verse.text}</p>
      <p className="answer-ref">{verse.ref}</p>
    </div>
  )
}
