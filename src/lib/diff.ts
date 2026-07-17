/** 어절 단위 diff 채점. 구두점은 비교에서 제외한다. */

export type DiffOp = { type: 'ok' | 'miss' | 'extra'; word: string }

export function tokenize(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

export function diffWords(
  target: string[],
  attempt: string[],
): { matched: number; ops: DiffOp[] } {
  const n = target.length
  const m = attempt.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        target[i] === attempt[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (target[i] === attempt[j]) {
      ops.push({ type: 'ok', word: target[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'miss', word: target[i] })
      i++
    } else {
      ops.push({ type: 'extra', word: attempt[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'miss', word: target[i++] })
  while (j < m) ops.push({ type: 'extra', word: attempt[j++] })
  return { matched: dp[0][0], ops }
}

export interface TypingGrade {
  accuracy: number
  perfect: boolean
  ops: DiffOp[]
}

export function gradeTyping(targetText: string, attemptText: string): TypingGrade {
  const t = tokenize(targetText)
  const a = tokenize(attemptText)
  const { matched, ops } = diffWords(t, a)
  const denom = Math.max(t.length, a.length)
  const accuracy = denom === 0 ? 0 : matched / denom
  return { accuracy, perfect: matched === t.length && a.length === t.length, ops }
}

/** 타이핑 정확도 → FSRS 등급 (Again=1, Hard=2, Good=3) */
export function ratingFromAccuracy(g: TypingGrade): 1 | 2 | 3 {
  if (g.perfect) return 3
  if (g.accuracy >= 0.9) return 2
  return 1
}

/** 첫글자 훈련의 엿보기 횟수 → FSRS 등급 */
export function ratingFromPeeks(peeks: number): 1 | 2 | 3 {
  if (peeks === 0) return 3
  if (peeks <= 2) return 2
  return 1
}
