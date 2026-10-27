import { type SectionInfo, sectionOf, sectionsOf, VERSES } from '../data/verses'
import { cardKey, DIRECTIONS, type Rating, type StoredCard } from '../domain/card'
import { reviewMode } from '../domain/policy'
import type { Store } from '../ports/repositories'
import { submitReview } from './review'
import { bumpRevision } from './revision'

/**
 * 말씀 상태 개정 — 오래 쉰 뒤 밀린 카드를 구절 단위로 한 번에 정리한다.
 *
 * 카드 3장을 따로 넘기는 대신 구절 본문을 한 번 떠올려 보고 셋 중 하나로 판정한다.
 * - solid: 낭송 자가 채점 '좋음'
 * - shaky: 낭송 자가 채점 '다시' (재학습 단계로 돌아가 며칠 안에 다시 나온다)
 * - forgotten: 카드를 지우고 사다리 첫글자 단계로 강등
 *
 * 자가 채점은 정책이 그 회차를 recite로 정한 카드에만 매긴다. 말씀→장절 방향과
 * 첫글자·타이핑 감사 차례인 카드는 손대지 않고 복습 큐에 남겨 객관 채점을 받게
 * 한다 — 개정 모드가 감사 주기를 건너뛰는 통로가 되면 안 된다(하드 경계 2).
 */
export type RecalibrateVerdict = 'solid' | 'shaky' | 'forgotten'

const VERDICT_RATING: Record<Exclude<RecalibrateVerdict, 'forgotten'>, Rating> = {
  solid: 3,
  shaky: 1,
}

export interface RecalibrateResult {
  /** 자가 채점(recite)으로 등급을 매긴 카드 수 */
  rated: number
  /** 정책상 객관 채점 차례라 복습 큐에 남겨 둔 카드 수 */
  deferred: number
  /** 사다리로 강등했는가 */
  demoted: boolean
}

async function cardsOf(store: Store, verseId: string): Promise<StoredCard[]> {
  const found = await Promise.all(DIRECTIONS.map((d) => store.cards.get(cardKey(verseId, d))))
  return found.filter((c): c is StoredCard => c !== undefined)
}

export async function recalibrateVerse(
  store: Store,
  verseId: string,
  verdict: RecalibrateVerdict,
  now: Date = new Date(),
): Promise<RecalibrateResult> {
  const cards = await cardsOf(store, verseId)
  const result: RecalibrateResult = { rated: 0, deferred: 0, demoted: false }
  // 졸업 전 구절은 이미 사다리 위에 있다 — 강등하면 오히려 단계를 건너뛸 수 있다
  if (cards.length === 0) return result

  if (verdict === 'forgotten') {
    await store.demoteToLadder(verseId, 'firstLetter', now)
    result.demoted = true
  } else {
    for (const card of cards) {
      if (reviewMode(card.direction, card.card.reps) !== 'recite') {
        result.deferred++
        continue
      }
      await submitReview(
        store,
        card,
        { mode: 'recite', rating: VERDICT_RATING[verdict], accuracy: null, peeks: null },
        now,
      )
      result.rated++
    }
  }
  bumpRevision()
  return result
}

/** 개정 단위 — 네비게이토 커리큘럼의 섹션 하나 (5확신·8동행·60구절 A~E·DEP 1~8) */
export interface RecalibrateUnit {
  key: string
  label: string
  /** 카드가 있는(졸업한) 구절만, 학습 권장 순서대로 */
  verseIds: string[]
  /** 그중 지금 due인 카드 수 */
  due: number
}

const UNIT_COLLECTIONS = ['AS', 'LV', 'TMS60', 'DEP'] as const

function unitLabel(s: SectionInfo, i: number): string {
  if (s.collection === 'TMS60') return `60구절 ${s.key}. ${s.title}`
  if (s.collection === 'DEP') return `DEP ${i + 1}. ${s.title}`
  return s.title
}

export async function loadRecalibrateUnits(
  store: Store,
  now: Date = new Date(),
): Promise<RecalibrateUnit[]> {
  const cards = await store.cards.all()
  const withCards = new Set(cards.map((c) => c.verseId))
  const iso = now.toISOString()
  const dueByVerse = new Map<string, number>()
  for (const c of cards) {
    if (c.card.due <= iso) dueByVerse.set(c.verseId, (dueByVerse.get(c.verseId) ?? 0) + 1)
  }
  return UNIT_COLLECTIONS.flatMap((col) =>
    sectionsOf(col).map((s, i) => {
      const verseIds = VERSES.filter(
        (v) => sectionOf(v).key === s.key && withCards.has(v.id),
      ).map((v) => v.id)
      return {
        key: s.key,
        label: unitLabel(s, i),
        verseIds,
        due: verseIds.reduce((n, id) => n + (dueByVerse.get(id) ?? 0), 0),
      }
    }),
  )
}
