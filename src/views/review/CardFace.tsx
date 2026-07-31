import type { VerseEntry } from '../../data/verses'
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
    <div className="panel">
      <div className="mode-tag">{MODE_LABEL[mode]}</div>
      <Prompt sc={sc} verse={verse} />
      {mode === 'recite' && <ReciteMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'firstLetter' && <FirstLetterMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'typing' && <TypingMode sc={sc} verse={verse} onRate={onRate} />}
      {mode === 'refInput' && <RefInputMode sc={sc} verse={verse} onRate={onRate} />}
    </div>
  )
}
