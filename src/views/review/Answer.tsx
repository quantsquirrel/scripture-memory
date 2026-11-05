import { Crumb } from '../../components/Crumb'
import { crumbOf, topicOf, topicOrdinalOf, type VerseEntry } from '../../data/verses'
import type { StoredCard } from '../../domain/card'

export function Prompt({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'topic') {
    const { nth, total } = topicOrdinalOf(verse)
    return (
      <div className="prompt">
        <h2 className="prompt-main">
          {topicOf(verse).title}
          {total > 1 && (
            <span className="prompt-ord">
              {nth}/{total}
            </span>
          )}
        </h2>
        <p className="prompt-ask">
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
        <p className="prompt-ask">이 장절의 제목과 말씀을 낭송하세요</p>
      </div>
    )
  }
  return (
    <div className="prompt">
      <p className="verse">{verse.text}</p>
      <p className="prompt-ask">이 말씀의 장절은?</p>
    </div>
  )
}

function ordinalKo(n: number): string {
  return ['첫째', '둘째', '셋째', '넷째'][n - 1] ?? `${n}번째`
}

/** 주제 이름과 그 경로 — 장절·본문을 묻는 카드에서 정답과 함께 열린다 */
function TopicLine({ verse }: { verse: VerseEntry }) {
  return (
    <p className="answer-topic">
      <span className="answer-title">{topicOf(verse).title}</span>
      <Crumb parts={crumbOf(verse)} />
    </p>
  )
}

/**
 * 정답 — 낭송의 틀. TMS 낭송 규칙(주제 → 장절 → 말씀 → 장절)의 차례대로 서고,
 * 닫는 장절은 오른쪽 끝에 놓인다. 말씀을 묻는 카드는 장절이 곧 답이라 장절이 제목이 된다.
 */
export function Answer({ sc, verse }: { sc: StoredCard; verse: VerseEntry }) {
  if (sc.direction === 'text') {
    return (
      <div className="answer">
        <h3 className="answer-head">{verse.ref}</h3>
        <TopicLine verse={verse} />
      </div>
    )
  }
  return (
    <div className="answer">
      {sc.direction === 'ref' && <TopicLine verse={verse} />}
      <p className="answer-ref">{verse.ref}</p>
      <p className="verse">{verse.text}</p>
      <p className="answer-ref answer-ref-end">{verse.ref}</p>
    </div>
  )
}
