import type { Direction, ReviewEntry, ReviewMode, SerializedCard, StoredCard } from './card'
import { required } from './invariant'
import { State } from './scheduler'

/**
 * learn-ahead 창: 몇 분 안에 due가 오는 학습·재학습 단계 카드를 당겨
 * 재도전하는 시간 창. 복습 세션 말미와 홈 화면이 같은 창을 쓴다.
 */
export const LEARN_AHEAD_MS = 20 * 60_000

/**
 * 복습 방식 선택 정책. 난이도는 첫글자 힌트 < 낭송(자가 채점) < 타이핑 감사다.
 * - 말씀→장절 방향은 항상 장절 입력(객관 채점).
 * - 분 단위 단계(새 카드·학습·재학습)는 첫글자 훈련으로 축자 회상을 강제한다.
 *   간격을 두고 돌아온 복습(Review 상태)에는 첫글자 힌트를 쓰지 않는다.
 * - Review 상태는 5회마다 한 번 타이핑 감사(word-perfect audit), 그리고 감사 빚이
 *   있으면 갚을 때까지 매번 타이핑 감사.
 * - 그 외에는 소리 내어 낭송 후 자가 채점.
 *
 * history는 이 카드의 복습 기록이다. 기록은 낭송 차례를 타이핑 감사로 바꿀 수만
 * 있으므로, 빈 기록으로 낭송이 아니면 기록을 읽을 필요가 없다.
 */
export function reviewMode(
  direction: Direction,
  card: Pick<SerializedCard, 'state' | 'reps'>,
  history: readonly ReviewEntry[],
): ReviewMode {
  if (direction === 'text') return 'refInput'
  if (card.state !== State.Review) return 'firstLetter'
  // reps는 카드에 영속되는 값이고 백업 가져오기·Gist 병합으로 외부에서 들어올 수
  // 있다. 소수(예: 5.5)가 섞이면 `(reps + 1) % 5 === 0`이 영원히 거짓이 되어
  // 타이핑 감사가 한 번도 끼지 않는다 — 자가 채점이 무한정 이어지는 구멍이었다.
  // 정수로 내림해 주기를 계산하므로 어떤 실수 값에서도 5회 창이 성립한다.
  // 주기를 셀 수 없는 값은 객관 채점 쪽(감사)으로 닫는다: NaN·±Infinity, 그리고
  // 안전한 정수 범위 밖처럼 `count + 1 === count`가 되는 값(reps가 늘지 않아 주기가 멈춘다).
  const count = Math.floor(card.reps)
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(count + 1)) return 'typing'
  if ((count + 1) % 5 === 0 || hasAuditDebt(history)) return 'typing'
  return 'recite'
}

/**
 * 감사 빚: 마지막으로 통과한 타이핑 감사(typing·'다시' 아님) 뒤에 간격 복습
 * 방식(recite·typing)으로 '다시'를 받은 기록이 있다. 빚이 있는 카드는 타이핑
 * 감사를 통과할 때까지 간격 복습마다 타이핑 감사로 나온다.
 *
 * 분 단위 재도전(firstLetter)은 감사를 대신하지 않고, 거기서 받은 '다시'도 빚을
 * 만들지 않는다. 저장하지 않고 기록에서 파생하므로 저장·export 형식이 그대로다.
 * 순서는 ts가 가리키는 시각으로 본다 — 병합·가져오기를 거친 기록은 저장 순서가 시간
 * 순이라는 보장이 없고, 가져온 ts는 표기가 다를 수 있다(…00Z 대 …00.500Z, +09:00 오프셋).
 * 통과와 같은 시각의 '다시'는 빚으로 본다(객관 감사 쪽으로 닫는다 — 두 기기 기록이
 * 병합되면 같은 시각의 통과와 '다시'가 함께 남을 수 있다).
 */
export function hasAuditDebt(history: readonly ReviewEntry[]): boolean {
  let lastPass = Number.NEGATIVE_INFINITY
  for (const e of history) {
    const at = time(e.ts)
    if (e.mode === 'typing' && e.rating !== 1 && at > lastPass) lastPass = at
  }
  return history.some(
    (e) =>
      (e.mode === 'recite' || e.mode === 'typing') && e.rating === 1 && time(e.ts) >= lastPass,
  )
}

/**
 * 기록 시각. 읽을 수 없는 시각은 가장 오래된 것으로 친다(adapters/gist.ts와 같은 관례) —
 * 그런 통과는 빚을 갚지 못하고, 그런 '다시'는 통과 기록이 없으면 빚으로 남는다.
 * 가져온 번들은 decodeBundle이 막지만 병합의 로컬 행은 거치지 않는다.
 */
function time(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
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
export function orderQueue(
  cards: StoredCard[],
  rand: () => number = Math.random,
): StoredCard[] {
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
    const a = required(arr[i], `셔플 대상 ${String(i)}`)
    arr[i] = required(arr[j], `셔플 대상 ${String(j)}`)
    arr[j] = a
  }
  return arr
}
