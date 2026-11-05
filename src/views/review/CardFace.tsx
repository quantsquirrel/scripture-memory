import { Crumb } from '../../components/Crumb'
import { crumbOf, type VerseEntry } from '../../data/verses'
import type { ReviewMode, StoredCard } from '../../domain/card'
import { Prompt } from './Answer'
import { FirstLetterMode, type RateFn, ReciteMode, RefInputMode, TypingMode } from './modes'

const MODE_LABEL: Record<ReviewMode, string> = {
  recite: '소리 내어 낭송',
  firstLetter: '첫글자 힌트',
  typing: '타이핑 감사',
  refInput: '장절 입력',
}

/**
 * 카드 한 장의 출제 면. 모드 선택은 domain/policy.ts가 이미 결정했고, 여기서는
 * 해당 모드의 컴포넌트를 고르기만 한다 — 각 모드가 자기 증거를 모아 onRate로 넘긴다.
 *
 * 머리줄 왼쪽은 모드, 오른쪽은 경로(과정 › 단원). 경로는 주제를 묻는 카드에만 미리
 * 보인다 — 장절·본문을 묻는 카드에서는 그것이 곧 힌트라서 정답과 함께 열린다.
 */
export function CardFace({
  sc,
  verse,
  mode,
  onRate,
}: {
  sc: StoredCard
  verse: VerseEntry
  mode: ReviewMode
  onRate: RateFn
}) {
  return (
    <div className="panel stage-card">
      <p className="card-head">
        <span className="mode-tag">{MODE_LABEL[mode]}</span>
        {sc.direction === 'topic' && <Crumb parts={crumbOf(verse)} />}
      </p>
      <Prompt sc={sc} verse={verse} />
      {mode === 'recite' && <ReciteMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'firstLetter' && <FirstLetterMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'typing' && <TypingMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'refInput' && <RefInputMode sc={sc} verse={verse} onRate={onRate} />}
    </div>
  )
}
