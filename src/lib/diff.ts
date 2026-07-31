/** 글자(음절) 단위 diff 채점. 구두점과 띄어쓰기는 비교에서 제외한다. */

import { required } from './invariant'

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
  // LCS 길이 DP. 행 배열을 중첩하면 noUncheckedIndexedAccess 아래에서 접근마다
  // undefined 검사가 붙으므로, (n+1)×(m+1)을 평탄한 배열 하나로 잡는다.
  // 전 구간을 0으로 채우므로 `?? 0`은 실제로는 발동하지 않는 총합 기본값이다.
  const width = m + 1
  const dp = new Array<number>((n + 1) * width).fill(0)
  const lcs = (i: number, j: number): number => dp[i * width + j] ?? 0
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        target[i] === attempt[j] ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1))
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const t = required(target[i], `정답 ${String(i)}번째 글자`)
    const a = required(attempt[j], `답안 ${String(j)}번째 글자`)
    if (t === a) {
      ops.push({ type: 'ok', word: t, ti: i })
      i++
      j++
    } else if (lcs(i + 1, j) >= lcs(i, j + 1)) {
      ops.push({ type: 'miss', word: t, ti: i })
      i++
    } else {
      ops.push({ type: 'extra', word: a })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'miss', word: required(target[i], `정답 ${String(i)}번째 글자`), ti: i })
    i++
  }
  while (j < m) {
    ops.push({ type: 'extra', word: required(attempt[j], `답안 ${String(j)}번째 글자`) })
    j++
  }
  return { matched: lcs(0, 0), ops }
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
