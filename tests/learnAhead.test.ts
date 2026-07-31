// 가드레일: 오답 재도전(learn-ahead)은 새 등급 경로가 아니다 — submitReview가 잡아둔
// 몇 분 뒤 스케줄을 같은 세션에서 보여줄 뿐이다. 며칠 간격의 복습(Review) 카드를
// 앞당겨 보여주면 안 된다(간격 반복 붕괴).
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { dueCards, resetAll, runLadder, submitReview, upcomingLearningCards } from '../src/app'
import { required } from '../src/domain/invariant'
import { State } from '../src/domain/scheduler'

const NOW = new Date('2026-07-18T10:00:00.000Z')
const MIN = 60_000

/**
 * 졸업은 사다리를 통과한 결과로만 일어난다 (domain/ladder.ts).
 * 테스트도 같은 경로를 쓴다 — 카드 생성만 따로 부르는 우회로는 없다.
 */
const graduate = (verseId: string, now = new Date()) =>
  runLadder(verseId, { step: 'typing', event: 'graded', perfect: true }, now)

describe('upcomingLearningCards (learn-ahead)', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('오답(1)으로 몇 분 뒤에 잡힌 새 카드는 20분 창에서 잡힌다', async () => {
    await graduate('v1', NOW)
    const sc = required((await dueCards(NOW))[0], '첫 due 카드')
    await submitReview(sc, { mode: 'refInput', rating: 1, accuracy: 0, peeks: null }, NOW)
    // due +1분 → 지금 기준 dueCards에는 없다
    expect((await dueCards(NOW)).map((c) => c.key)).not.toContain(sc.key)
    // learn-ahead 창에는 있다. 아직 New 상태인 나머지 카드는 dueCards 몫이라 안 잡힌다.
    const ahead = await upcomingLearningCards(20 * MIN, NOW)
    expect(ahead.map((c) => c.key)).toEqual([sc.key])
  })

  it('복습 상태에서 틀리면 재학습(+10분)으로 창에 잡히고, 성숙 복습 카드는 안 잡힌다', async () => {
    await graduate('v1', NOW)
    let sc = required((await dueCards(NOW))[0], '첫 due 카드')
    sc = await submitReview(sc, { mode: 'typing', rating: 3, accuracy: 1, peeks: null }, NOW)
    sc = await submitReview(
      sc,
      { mode: 'typing', rating: 3, accuracy: 1, peeks: null },
      new Date(sc.card.due),
    )
    expect(sc.card.state).toBe(State.Review)
    // 며칠 간격으로 잡힌 복습 카드는 learn-ahead 대상이 아니다
    const afterGraduation = await upcomingLearningCards(
      20 * MIN,
      new Date(required(sc.card.last_review, 'last_review')),
    )
    expect(afterGraduation).toEqual([])
    // 그 카드가 due에 도달했을 때 오답 → 재학습 +10분
    const lapseAt = new Date(sc.card.due)
    sc = await submitReview(
      sc,
      { mode: 'refInput', rating: 1, accuracy: 0, peeks: null },
      lapseAt,
    )
    expect(sc.card.state).toBe(State.Relearning)
    expect((await upcomingLearningCards(20 * MIN, lapseAt)).map((c) => c.key)).toContain(sc.key)
    // 창이 재학습 간격보다 짧으면 잡히지 않는다
    expect((await upcomingLearningCards(5 * MIN, lapseAt)).map((c) => c.key)).not.toContain(
      sc.key,
    )
  })
})
