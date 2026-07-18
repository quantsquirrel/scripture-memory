/** 글자(음절) 단위 diff 채점. 구두점과 띄어쓰기는 비교에서 제외한다. */

// word: 표시 단위(글자). ti: 정답 글자 인덱스(ok/miss만 존재, extra는 없음).
export type DiffOp = { type: 'ok' | 'miss' | 'extra'; word: string; ti?: number }

/** 어절 배열 (구두점 제거, 공백으로 분리) */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

/** 비교용 글자 배열 (구두점·띄어쓰기 모두 제거) */
export function toChars(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .split('')
}

/** 정답 글자 인덱스 중 뒤에 어절 경계(공백)가 오는 위치 — diff 표시에서 띄어쓰기 복원용 */
export function wordBoundaries(text: string): Set<number> {
  const clean = text.normalize('NFC').replace(/[^가-힣a-zA-Z0-9\s]/g, '')
  const set = new Set<number>()
  let idx = -1
  let prevChar = false
  for (const ch of clean) {
    if (/\s/.test(ch)) {
      if (prevChar) set.add(idx)
      prevChar = false
    } else {
      idx++
      prevChar = true
    }
  }
  return set
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
      ops.push({ type: 'ok', word: target[i], ti: i })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'miss', word: target[i], ti: i })
      i++
    } else {
      ops.push({ type: 'extra', word: attempt[j] })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'miss', word: target[i], ti: i })
    i++
  }
  while (j < m) ops.push({ type: 'extra', word: attempt[j++] })
  return { matched: dp[0][0], ops }
}

export interface TypingGrade {
  accuracy: number
  perfect: boolean
  ops: DiffOp[]
}

export function gradeTyping(targetText: string, attemptText: string): TypingGrade {
  const t = toChars(targetText)
  const a = toChars(attemptText)
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
