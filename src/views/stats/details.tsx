import type { StatsData } from '../../app/queries'
import { BulletBar, ForecastBars } from '../../components/StatCharts'
import { type Direction, DIRECTION_LABEL } from '../../domain/card'
import { EXAM_RETENTION } from '../../domain/goal'
import { DEFAULT_RETENTION } from '../../domain/scheduler'
import { pct } from './reflect'

/** "YYYY-MM-DD" → "M/D" */
const formatMonthDay = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function calibrationVerdict(gapPp: number): string {
  if (gapPp >= 10) return '자가 채점이 후한 편입니다 — 타이핑 감사 결과를 믿으세요'
  if (gapPp <= -10) return '자가 채점이 박한 편입니다 — 스스로를 조금 더 믿어도 됩니다'
  return '자가 채점이 객관 채점과 잘 맞습니다'
}

function MemoryStateSection({ d }: { d: StatsData }) {
  return (
    <>
      <h3>지금 기억 상태</h3>
      {d.knowledge.avgRetrievability !== null ? (
        <>
          <p>
            지금 전부 물어보면 <strong className="big-number">{d.knowledge.estKnown}</strong>
            <span className="muted">/{d.knowledge.graded}장</span> 정답 예상
          </p>
          <BulletBar rate={d.knowledge.avgRetrievability} target={DEFAULT_RETENTION} />
          <p className="muted small">
            평균 예측 기억률 {pct(d.knowledge.avgRetrievability)} (눈금 = 목표{' '}
            {pct(DEFAULT_RETENTION)})
          </p>
        </>
      ) : (
        <p className="muted">아직 복습 궤도에 오른 카드가 없습니다.</p>
      )}
      {!d.goal.past && (
        <>
          <div className="progress">
            <div
              className="progress-fill"
              style={{ width: `${(d.readiness.ready / d.readiness.total) * 100}%` }}
            />
          </div>
          <p className="muted small">
            시험 준비 {d.readiness.ready}/{d.readiness.total} — 지금 복습을 멈춰도{' '}
            {formatMonthDay(d.goal.goalDate)}에 기억률 {pct(EXAM_RETENTION)} 이상으로 예측되는
            구절
          </p>
        </>
      )}
    </>
  )
}

function MaturitySection({ d }: { d: StatsData }) {
  const { mat } = d
  return (
    <>
      <h3>카드 성숙도</h3>
      {mat.total > 0 ? (
        <>
          <div className="stack-bar">
            <div
              className="stack-seg-learning"
              style={{ width: `${(mat.learning / mat.total) * 100}%` }}
            />
            <div
              className="stack-seg-young"
              style={{ width: `${(mat.young / mat.total) * 100}%` }}
            />
            <div
              className="stack-seg-mature"
              style={{ width: `${(mat.mature / mat.total) * 100}%` }}
            />
          </div>
          <p className="muted small">
            학습 중 {mat.learning} · 어린 카드 {mat.young} · 성숙 카드 {mat.mature} (간격 21일
            이상)
          </p>
        </>
      ) : (
        <p className="muted">아직 카드가 없습니다.</p>
      )}
    </>
  )
}

function RetentionSection({ d }: { d: StatsData }) {
  return (
    <>
      <h3>복습 성과</h3>
      {d.retention7.rate !== null && (
        <>
          <BulletBar rate={d.retention7.rate} target={DEFAULT_RETENTION} />
          <p className="muted small">
            지난 7일 기억률 {pct(d.retention7.rate)} (눈금 = 목표 {pct(DEFAULT_RETENTION)}) ·
            카드별 하루 첫 시도 {d.retention7.total}회 기준
          </p>
        </>
      )}
      <div>
        <div className="stat-row">
          <span>지난 30일 기억률</span>
          <span className="stat-val">
            {d.retention30.rate !== null ? (
              <>
                {pct(d.retention30.rate)}{' '}
                <span className="muted small">({d.retention30.total}회)</span>
              </>
            ) : (
              <span className="muted">표본 없음</span>
            )}
          </span>
        </div>
        {(Object.keys(DIRECTION_LABEL) as Direction[]).map((dir) => (
          <div className="stat-row" key={dir}>
            <span className="muted">└ {DIRECTION_LABEL[dir]}</span>
            <span className="stat-val">
              {d.dirRetention[dir].rate !== null ? (
                <>
                  {pct(d.dirRetention[dir].rate)}{' '}
                  <span className="muted small">({d.dirRetention[dir].total}회)</span>
                </>
              ) : (
                <span className="muted">표본 없음</span>
              )}
            </span>
          </div>
        ))}
        <div className="stat-row">
          <span>축자 정확도 (30일)</span>
          <span className="stat-val">
            {d.accuracy.avg !== null ? (
              <>
                {pct(d.accuracy.avg)} <span className="muted small">({d.accuracy.n}회)</span>
              </>
            ) : (
              <span className="muted">표본 없음</span>
            )}
          </span>
        </div>
      </div>
    </>
  )
}

function CalibrationSection({ d }: { d: StatsData }) {
  return (
    <>
      <h3>자가 채점 보정</h3>
      <div className="stat-row">
        <span>암송(자가 채점) 통과율</span>
        <span className="stat-val">
          {d.calibration.recite.rate !== null ? (
            <>
              {pct(d.calibration.recite.rate)}{' '}
              <span className="muted small">({d.calibration.recite.total}회)</span>
            </>
          ) : (
            <span className="muted">표본 없음</span>
          )}
        </span>
      </div>
      <div className="stat-row">
        <span>객관 모드 통과율</span>
        <span className="stat-val">
          {d.calibration.objective.rate !== null ? (
            <>
              {pct(d.calibration.objective.rate)}{' '}
              <span className="muted small">({d.calibration.objective.total}회)</span>
            </>
          ) : (
            <span className="muted">표본 없음</span>
          )}
        </span>
      </div>
      <p className="muted small">
        {d.calibration.gapPp !== null
          ? `간극 ${d.calibration.gapPp > 0 ? '+' : ''}${d.calibration.gapPp}%p — ${calibrationVerdict(d.calibration.gapPp)}`
          : '두 방식 모두 최근 30일 표본이 쌓이면 자가 채점의 관대함을 진단합니다'}
      </p>
    </>
  )
}

function LoadSection({ d }: { d: StatsData }) {
  return (
    <>
      <h3>오늘과 앞으로의 부하</h3>
      {d.queue.rate !== null && (
        <>
          <BulletBar rate={d.queue.rate} />
          <p className="muted small">
            오늘 소화 {d.queue.done}/{d.queue.done + d.queue.remaining}장 ({pct(d.queue.rate)})
            {d.overdue > 0 && ` · 밀린 카드 ${d.overdue}장`}
          </p>
        </>
      )}
      <ForecastBars forecast={d.forecast} />
      <p className="muted small">
        향후 7일 예보 — 내일 {d.forecast.tomorrow}장 · 하루 평균{' '}
        {Math.round(d.forecast.avgPerDay)}장
      </p>
    </>
  )
}

function PaceSection({ d, learnEndLabel }: { d: StatsData; learnEndLabel: string }) {
  // 목표일이 지났거나 남은 구절이 없으면 페이스를 보여주지 않는다
  if (d.goal.past || d.goal.remaining === 0) return null
  return (
    <>
      <h3>학습 페이스</h3>
      <p>
        최근 7일 하루 <strong>{d.goal.recentPace.toFixed(1)}</strong>구절 · 필요 페이스 하루{' '}
        {d.goal.requiredPace.toFixed(1)}구절
        <br />
        {d.goal.projectedDone && d.goal.aheadDays !== null ? (
          <span>
            이 페이스면 {formatMonthDay(d.goal.projectedDone)} 완료 —{' '}
            {d.goal.aheadDays > 0 && `마감(${learnEndLabel})보다 ${d.goal.aheadDays}일 여유`}
            {d.goal.aheadDays < 0 && `마감(${learnEndLabel})보다 ${-d.goal.aheadDays}일 부족`}
            {d.goal.aheadDays === 0 && `마감(${learnEndLabel})에 딱 맞음`}
          </span>
        ) : (
          <span className="muted">최근 7일 새 구절이 없어 페이스를 잴 수 없습니다</span>
        )}
      </p>
      {d.goal.requiredPace > 0 && (
        <BulletBar rate={d.goal.recentPace / (d.goal.requiredPace * 1.5)} target={1 / 1.5} />
      )}
      <p className="muted small">
        새 구절은 {learnEndLabel}까지 완료 목표 — 마지막 {d.goal.bufferDays}일은 복습으로 굳히기
        (눈금 = 필요 페이스)
      </p>
    </>
  )
}

/**
 * 훈련 상세 지표. 프레젠테이션 전용 — 저장소를 읽지 않고 스냅샷만 그린다.
 * 섹션별로 쪼개 각 컴포넌트를 짧게 유지한다.
 */
export function TechDetails({
  d,
  learnEndLabel,
}: {
  d: StatsData
  learnEndLabel: string
}) {
  return (
    <details className="tech-details">
      <summary>훈련 상세 지표 — 암기 훈련을 점검하고 싶을 때</summary>
      <MemoryStateSection d={d} />
      <MaturitySection d={d} />
      <RetentionSection d={d} />
      <CalibrationSection d={d} />
      <LoadSection d={d} />
      <PaceSection d={d} learnEndLabel={learnEndLabel} />
    </details>
  )
}
