import type { LearnProgress } from './ladder'
import { isGraduated } from './ladder'

/**
 * 다음에 배울 새 구절을 고른다.
 *
 * 이전에는 "학습 순서에서 졸업하지 않은 첫 구절"이었다. 그러면 5확신을 끝내고
 * 목록에서 DEP 첫 구절을 골라 졸업해도 '다음 구절'이 8동행 첫 구절로 되돌아간다.
 * 지금은 기준 구절(anchorId) 바로 뒤에서부터 학습 순서대로 찾고, 끝까지 없으면
 * 처음으로 돌아가 앞쪽의 빈 자리를 채운다.
 *
 * @param orderedIds 학습 권장 순서대로 정렬된 구절 id
 * @param done 이미 졸업했거나 다른 이유로 고르지 않을 구절 id
 * @param anchorId 기준 구절. 없거나 목록에 없으면 처음부터 찾는다.
 */
export function pickNextVerse(
  orderedIds: readonly string[],
  done: ReadonlySet<string>,
  anchorId?: string,
): string | null {
  const at = anchorId === undefined ? -1 : orderedIds.indexOf(anchorId)
  const n = orderedIds.length
  for (let k = 1; k <= n; k++) {
    // at이 -1이면 0번부터, 아니면 at+1부터 한 바퀴 돈다
    const id = orderedIds[(at + k + n) % n]
    if (id !== undefined && id !== anchorId && !done.has(id)) return id
  }
  return null
}

/**
 * 진도의 기준이 되는 구절 — 가장 최근에 졸업한 구절.
 * 졸업 시각이 같으면(백업 가져오기 등) 학습 순서상 뒤쪽을 고른다.
 * 강등(말씀 상태 개정)은 졸업이 아니므로 기준을 옮기지 않는다.
 */
export function latestGraduatedId(
  orderedIds: readonly string[],
  learning: readonly LearnProgress[],
): string | undefined {
  const order = new Map(orderedIds.map((id, i) => [id, i]))
  let best: LearnProgress | undefined
  for (const l of learning) {
    if (!isGraduated(l) || !order.has(l.verseId)) continue
    if (
      best === undefined ||
      l.updatedAt > best.updatedAt ||
      (l.updatedAt === best.updatedAt &&
        (order.get(l.verseId) ?? -1) > (order.get(best.verseId) ?? -1))
    ) {
      best = l
    }
  }
  return best?.verseId
}
