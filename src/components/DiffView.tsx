import { Fragment } from 'react'

import { type DiffOp, type TypingGrade, wordBoundaries } from '../domain/grading'

/**
 * 채점 결과를 색과 밑줄로 표시한다.
 *
 * 접근성: 색·취소선만으로 구분하면 시각에 의존하게 된다. 틀린 곳을 말로 요약한
 * 텍스트 대안을 함께 두고, 결과는 aria-live로 알린다. 색이 유일한 단서가 되지
 * 않도록 빠뜨림은 점선 밑줄, 틀림/추가는 취소선을 함께 쓴다(기존 유지).
 */
export function DiffView({ grade, target }: { grade: TypingGrade; target: string }) {
  const boundaries = wordBoundaries(target)
  const summary = describe(grade)
  return (
    <div className="diff-view">
      <div
        className={`diff-score ${grade.perfect ? 'good' : grade.accuracy >= 0.9 ? 'warn' : 'bad'}`}
        role="status"
      >
        {grade.perfect
          ? '완벽합니다! (word-perfect)'
          : `정확도 ${Math.round(grade.accuracy * 100)}%`}
      </div>
      <p className="sr-only">{summary}</p>
      <p className="diff-words verse" aria-hidden="true">
        {grade.ops.map((op, i) => (
          <Fragment key={i}>
            <span className={`diff-${op.type}`}>{op.word}</span>
            {op.ti !== undefined && boundaries.has(op.ti) ? ' ' : ''}
          </Fragment>
        ))}
      </p>
      {!grade.perfect && (
        <p className="diff-legend" aria-hidden="true">
          <span className="diff-miss">빠뜨림</span> ·{' '}
          <span className="diff-extra">틀림/추가</span>
        </p>
      )}
    </div>
  )
}

/** 색으로만 표현되던 차이를 문장으로 — 스크린리더가 읽을 텍스트 대안 */
function describe(grade: TypingGrade): string {
  if (grade.perfect) return '입력이 정답과 완전히 같습니다.'
  const missed = joinRuns(grade.ops.filter((o) => o.type === 'miss'))
  const extra = joinRuns(grade.ops.filter((o) => o.type === 'extra'))
  const parts = [`정확도 ${Math.round(grade.accuracy * 100)}퍼센트.`]
  if (missed) parts.push(`빠뜨린 글자: ${missed}.`)
  if (extra) parts.push(`틀리거나 더 넣은 글자: ${extra}.`)
  return parts.join(' ')
}

/** 연속한 글자를 붙여 읽기 쉽게 묶는다 (한 글자씩 나열하면 알아듣기 어렵다) */
function joinRuns(ops: DiffOp[]): string {
  const runs: string[] = []
  let current = ''
  let prevIndex: number | undefined
  for (const op of ops) {
    const contiguous = op.ti !== undefined && prevIndex !== undefined && op.ti === prevIndex + 1
    if (contiguous) current += op.word
    else {
      if (current) runs.push(current)
      current = op.word
    }
    prevIndex = op.ti
  }
  if (current) runs.push(current)
  return runs.join(', ')
}
