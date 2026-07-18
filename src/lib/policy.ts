import type { Direction, ReviewMode, StoredCard } from './types'

/**
 * 복습 모드 선택 정책.
 * - 말씀→장절 방향은 항상 장절 입력(객관 채점).
 * - 어린 카드(reps<3)는 첫글자 훈련으로 축자 회상을 강제.
 * - 이후 5회마다 한 번 타이핑 감사(word-perfect audit).
 * - 그 외에는 소리 내어 낭송 후 자가 채점.
 */
export function reviewMode(direction: Direction, reps: number): ReviewMode {
  if (direction === 'text') return 'refInput'
  if (reps < 3) return 'firstLetter'
  if ((reps + 1) % 5 === 0) return 'typing'
  return 'recite'
}

/**
 * 복습 큐 순서 정책.
 * due 순 고정 정렬은 학습한 순서를 그대로 재생해 순서 단서를 만들고,
 * 같은 구절의 3방향 카드를 연달아 노출해 직전 카드가 장절 답을 유출한다
 * (말씀→장절 객관 채점이 무의미해짐).
 * 구절 단위로 셔플한 뒤 라운드로빈으로 흩어, 순서를 무작위화하고
 * 같은 구절 카드 사이 간격을 최대로 벌린다 — 마지막에 한 구절만 남는 경우가
 * 아니면 같은 구절이 연달아 나오지 않는다.
 */
export function orderQueue(cards: StoredCard[], rand: () => number = Math.random): StoredCard[] {
  const byVerse = new Map<string, StoredCard[]>()
  for (const c of cards) {
    const g = byVerse.get(c.verseId)
    if (g) g.push(c)
    else byVerse.set(c.verseId, [c])
  }
  const groups = shuffle([...byVerse.values()], rand)
  for (const g of groups) shuffle(g, rand)
  const out: StoredCard[] = []
  while (out.length < cards.length) {
    for (const g of groups) {
      const c = g.shift()
      if (c) out.push(c)
    }
  }
  return out
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
