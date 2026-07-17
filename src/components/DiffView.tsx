import type { TypingGrade } from '../lib/diff'

export function DiffView({ grade }: { grade: TypingGrade }) {
  return (
    <div className="diff-view">
      <div className={`diff-score ${grade.perfect ? 'good' : grade.accuracy >= 0.9 ? 'warn' : 'bad'}`}>
        {grade.perfect ? '완벽합니다! (word-perfect)' : `정확도 ${Math.round(grade.accuracy * 100)}%`}
      </div>
      <p className="diff-words verse">
        {grade.ops.map((op, i) => (
          <span key={i} className={`diff-${op.type}`}>
            {op.word}{' '}
          </span>
        ))}
      </p>
      {!grade.perfect && (
        <p className="diff-legend">
          <span className="diff-miss">빠뜨림</span> · <span className="diff-extra">틀림/추가</span>
        </p>
      )}
    </div>
  )
}
