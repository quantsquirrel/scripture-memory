import type { ReviewEvidence, StoredCard } from '../domain/card'
import {
  advance,
  type LadderCommand,
  type LadderOutcome,
  type LadderStep,
  resumeStep,
} from '../domain/ladder'
import { rateCard } from '../domain/scheduler'
import type { Store } from '../ports/repositories'

/**
 * 복습 결과 반영의 유일한 경로.
 *
 * 등급 적용은 domain의 rateCard()만 할 수 있고(내부 applyRating은 export되지 않음),
 * 그 결과인 RatedCard만 저장소가 커밋할 수 있다. rateCard는 ReviewEvidence를
 * 필수 인자로 받으므로 "증거 없이 등급만 적용"은 호출 자체가 불가능하다.
 * 커밋은 카드 갱신과 증거 기록을 한 트랜잭션으로 처리한다 — 하드 경계 1.
 */
export async function submitReview(
  store: Store,
  card: StoredCard,
  evidence: ReviewEvidence,
  now: Date = new Date(),
): Promise<StoredCard> {
  return store.cards.commitRating(rateCard(card, evidence, now))
}

/** 학습 사다리를 열 때의 시작 단계 (진행 기록 반영) */
export async function openLadder(store: Store, verseId: string): Promise<LadderStep> {
  return resumeStep((await store.learning.get(verseId))?.step)
}

/**
 * 사다리 명령 처리. 전이 판단은 도메인(advance)이 하고, 이 함수는 그 결과를
 * 저장소에 반영한다. 졸업 시 3방향 카드 생성은 advance()가 내놓은 directions로만
 * 일어나므로, 사다리를 통과하지 않고 카드가 생기는 경로가 없다.
 */
export async function runLadder(
  store: Store,
  verseId: string,
  cmd: LadderCommand,
  now: Date = new Date(),
): Promise<LadderOutcome> {
  const outcome = advance(cmd)
  switch (outcome.kind) {
    case 'stay':
      break
    case 'move':
      await store.learning.put(verseId, outcome.step, now)
      break
    case 'graduate':
      await store.graduate(verseId, outcome.directions, now)
      break
  }
  return outcome
}
