import { useEffect, useState } from 'react'
import { BulletBar, ForecastBars, HistoryBars } from '../components/StatCharts'
import { VERSE_BY_ID } from '../data/verses'
import { dueCards, getAllCards, getAllLearning, getSetting, reviewsSince } from '../lib/db'
import { DEFAULT_RETENTION } from '../lib/fsrs'
import {
  computeGoal,
  computeReadiness,
  DEFAULT_GOAL_DATE,
  DEFAULT_REVIEW_BUFFER_DAYS,
  EXAM_RETENTION,
  examModeActive,
  type ExamReadiness,
  type GoalInfo,
} from '../lib/goal'
import {
  directionRetention,
  dueForecast,
  knowledgeNow,
  maturity,
  objectiveAccuracy,
  queueProgress,
  reviewHistory,
  selfGradeCalibration,
  trueRetention,
  weakVerses,
  type AccuracySummary,
  type DueForecast,
  type KnowledgeNow,
  type Maturity,
  type QueueProgress,
  type ReviewHistory,
  type SelfGradeCalibration,
  type TrueRetention,
  type WeakVerse,
} from '../lib/stats'
import { DIRECTION_LABEL, type Direction } from '../lib/types'

interface StatsData {
  knowledge: KnowledgeNow
  readiness: ExamReadiness
  mat: Maturity
  retention7: TrueRetention
  retention30: TrueRetention
  dirRetention: Record<Direction, TrueRetention>
  accuracy: AccuracySummary
  calibration: SelfGradeCalibration
  history: ReviewHistory
  queue: QueueProgress
  forecast: DueForecast
  overdue: number
  weak: WeakVerse[]
  goal: GoalInfo
  examActive: boolean
}

const pct = (r: number) => `${Math.round(r * 100)}%`

/** "YYYY-MM-DD" → "M/D" */
const formatMonthDay = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function calibrationVerdict(gapPp: number): string {
  if (gapPp >= 10) return '자가 채점이 후한 편입니다 — 타이핑 감사 결과를 믿으세요'
  if (gapPp <= -10) return '자가 채점이 박한 편입니다 — 스스로를 조금 더 믿어도 됩니다'
  return '자가 채점이 객관 채점과 잘 맞습니다'
}

export function Stats() {
  const [data, setData] = useState<StatsData | null>(null)

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    void Promise.all([
      getAllCards(),
      getAllLearning(),
      dueCards(),
      reviewsSince(new Date(0).toISOString()),
      getSetting<string>('goalDate'),
      getSetting<number>('goalBufferDays'),
      getSetting<boolean>('examMode'),
    ]).then(([cards, learning, due, allReviews, goalDate, buffer, examMode]) => {
      const gd = goalDate ?? DEFAULT_GOAL_DATE
      const weekAgo = new Date(midnight.getTime() - 7 * 86400_000).toISOString()
      const monthAgo = new Date(midnight.getTime() - 30 * 86400_000).toISOString()
      const month = allReviews.filter((r) => r.ts >= monthAgo)
      const week = month.filter((r) => r.ts >= weekAgo)
      const today = month.filter((r) => r.ts >= midnight.toISOString())
      setData({
        knowledge: knowledgeNow(cards, now),
        readiness: computeReadiness(cards, gd, now),
        mat: maturity(cards),
        retention7: trueRetention(week),
        retention30: trueRetention(month),
        dirRetention: directionRetention(month),
        accuracy: objectiveAccuracy(month),
        calibration: selfGradeCalibration(month),
        history: reviewHistory(allReviews, 7, now),
        queue: queueProgress(today, due.length),
        forecast: dueForecast(cards, 7, now),
        overdue: due.filter((c) => c.card.due < midnight.toISOString()).length,
        weak: weakVerses(cards, 5),
        goal: computeGoal(gd, learning, now, buffer ?? DEFAULT_REVIEW_BUFFER_DAYS),
        examActive: examModeActive(examMode ?? false, gd, now),
      })
    })
  }, [])

  if (!data) return <p className="muted">불러오는 중…</p>

  const retentionTarget = data.examActive ? EXAM_RETENTION : DEFAULT_RETENTION
  const { mat } = data
  const learnEnd = new Date(
    new Date(`${data.goal.goalDate}T12:00:00`).getTime() - data.goal.bufferDays * 86400_000,
  )
  const learnEndLabel = `${learnEnd.getMonth() + 1}/${learnEnd.getDate()}`

  return (
    <div>
      <section className="panel">
        <h2>지금 기억 상태</h2>
        {data.knowledge.avgRetrievability !== null ? (
          <>
            <p>
              지금 전부 물어보면{' '}
              <strong className="big-number">{data.knowledge.estKnown}</strong>
              <span className="muted">/{data.knowledge.graded}장</span> 정답 예상
            </p>
            <BulletBar rate={data.knowledge.avgRetrievability} target={retentionTarget} />
            <p className="muted small">
              평균 예측 기억률 {pct(data.knowledge.avgRetrievability)} (눈금 = 목표{' '}
              {pct(retentionTarget)}) — 복습 성과가 과거 실측이라면 이것은 현재 상태의 모델
              예측입니다
            </p>
          </>
        ) : (
          <p className="muted">아직 복습 궤도에 오른 카드가 없습니다.</p>
        )}
        <div className="progress">
          <div
            className="progress-fill"
            style={{ width: `${(data.readiness.ready / data.readiness.total) * 100}%` }}
          />
        </div>
        <p className="muted small">
          시험 준비 {data.readiness.ready}/{data.readiness.total} — 지금 복습을 멈춰도{' '}
          {formatMonthDay(data.goal.goalDate)}에 기억률 {pct(EXAM_RETENTION)} 이상으로
          예측되는 구절
        </p>
      </section>

      <section className="panel">
        <h2>카드 성숙도</h2>
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
              학습 중 {mat.learning} · 어린 카드 {mat.young} · 성숙 카드 {mat.mature} (간격
              21일 이상) — 성숙 비중이 커질수록 적은 복습으로 오래 기억하고 있다는 뜻
            </p>
          </>
        ) : (
          <p className="muted">아직 카드가 없습니다.</p>
        )}
      </section>

      <section className="panel">
        <h2>복습 성과</h2>
        {data.retention7.rate !== null && (
          <>
            <BulletBar rate={data.retention7.rate} target={retentionTarget} />
            <p className="muted small">
              지난 7일 기억률 {pct(data.retention7.rate)} (눈금 = 목표 {pct(retentionTarget)})
              · 카드별 하루 첫 시도 {data.retention7.total}회 기준
            </p>
          </>
        )}
        <div>
          <div className="stat-row">
            <span>지난 30일 기억률</span>
            <span className="stat-val">
              {data.retention30.rate !== null ? (
                <>
                  {pct(data.retention30.rate)}{' '}
                  <span className="muted small">({data.retention30.total}회)</span>
                </>
              ) : (
                <span className="muted">표본 없음</span>
              )}
            </span>
          </div>
          {(Object.keys(DIRECTION_LABEL) as Direction[]).map((d) => (
            <div className="stat-row" key={d}>
              <span className="muted">└ {DIRECTION_LABEL[d]}</span>
              <span className="stat-val">
                {data.dirRetention[d].rate !== null ? (
                  <>
                    {pct(data.dirRetention[d].rate!)}{' '}
                    <span className="muted small">({data.dirRetention[d].total}회)</span>
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
              {data.accuracy.avg !== null ? (
                <>
                  {pct(data.accuracy.avg)}{' '}
                  <span className="muted small">({data.accuracy.n}회)</span>
                </>
              ) : (
                <span className="muted">표본 없음</span>
              )}
            </span>
          </div>
        </div>
        <p className="muted small">
          기억률은 통과 여부(Again 제외), 축자 정확도는 틀린 낱말까지 반영한 일치율 — 방향별
          수치로 약한 물음 방식을 찾으세요
        </p>
      </section>

      <section className="panel">
        <h2>자가 채점 보정</h2>
        <div className="stat-row">
          <span>암송(자가 채점) 통과율</span>
          <span className="stat-val">
            {data.calibration.recite.rate !== null ? (
              <>
                {pct(data.calibration.recite.rate)}{' '}
                <span className="muted small">({data.calibration.recite.total}회)</span>
              </>
            ) : (
              <span className="muted">표본 없음</span>
            )}
          </span>
        </div>
        <div className="stat-row">
          <span>객관 모드 통과율</span>
          <span className="stat-val">
            {data.calibration.objective.rate !== null ? (
              <>
                {pct(data.calibration.objective.rate)}{' '}
                <span className="muted small">({data.calibration.objective.total}회)</span>
              </>
            ) : (
              <span className="muted">표본 없음</span>
            )}
          </span>
        </div>
        <p className="muted small">
          {data.calibration.gapPp !== null
            ? `간극 ${data.calibration.gapPp > 0 ? '+' : ''}${data.calibration.gapPp}%p — ${calibrationVerdict(data.calibration.gapPp)}`
            : '두 방식 모두 최근 30일 표본이 쌓이면 자가 채점의 관대함을 진단합니다'}
        </p>
      </section>

      <section className="panel">
        <h2>꾸준함</h2>
        <p>
          <strong className="big-number">{data.history.streak}</strong>일 연속 복습
          <span className="muted">
            {' '}
            · 최근 7일 하루 평균 {Math.round(data.history.avgPerDay)}회
          </span>
        </p>
        <HistoryBars counts={data.history.counts} />
        <p className="muted small">최근 7일 복습량 — 몰아서보다 매일 조금씩이 기억에 유리합니다</p>
      </section>

      <section className="panel">
        <h2>오늘과 앞으로의 부하</h2>
        {data.queue.rate !== null && (
          <>
            <BulletBar rate={data.queue.rate} />
            <p className="muted small">
              오늘 소화 {data.queue.done}/{data.queue.done + data.queue.remaining}장 (
              {pct(data.queue.rate)})
              {data.overdue > 0 && ` · 밀린 카드 ${data.overdue}장`}
            </p>
          </>
        )}
        <ForecastBars forecast={data.forecast} />
        <p className="muted small">
          향후 7일 예보 — 내일 {data.forecast.tomorrow}장 · 하루 평균{' '}
          {Math.round(data.forecast.avgPerDay)}장
        </p>
      </section>

      {!data.goal.past && data.goal.remaining > 0 && (
        <section className="panel">
          <h2>학습 페이스</h2>
          <p>
            최근 7일 하루 <strong>{data.goal.recentPace.toFixed(1)}</strong>구절 · 필요
            페이스 하루 {data.goal.requiredPace.toFixed(1)}구절
            <br />
            {data.goal.projectedDone && data.goal.aheadDays !== null ? (
              <span>
                이 페이스면 {formatMonthDay(data.goal.projectedDone)} 완료 —{' '}
                {data.goal.aheadDays > 0 &&
                  `마감(${learnEndLabel})보다 ${data.goal.aheadDays}일 여유`}
                {data.goal.aheadDays < 0 &&
                  `마감(${learnEndLabel})보다 ${-data.goal.aheadDays}일 부족`}
                {data.goal.aheadDays === 0 && `마감(${learnEndLabel})에 딱 맞음`}
              </span>
            ) : (
              <span className="muted">최근 7일 새 구절이 없어 페이스를 잴 수 없습니다</span>
            )}
          </p>
          {data.goal.requiredPace > 0 && (
            <BulletBar
              rate={data.goal.recentPace / (data.goal.requiredPace * 1.5)}
              target={1 / 1.5}
            />
          )}
          <p className="muted small">
            새 구절은 {learnEndLabel}까지 완료 목표 — 마지막 {data.goal.bufferDays}일은
            복습으로 굳히기 (눈금 = 필요 페이스)
          </p>
        </section>
      )}

      <section className="panel">
        <h2>취약 구절</h2>
        {data.weak.length > 0 ? (
          <>
            {data.weak.map((w) => (
              <div className="stat-row" key={w.verseId}>
                <span>{VERSE_BY_ID[w.verseId]?.refAbbr ?? w.verseId}</span>
                <span className="stat-val">
                  {w.lapses}회 넘어짐{' '}
                  <span className="muted small">(특히 {DIRECTION_LABEL[w.worstDirection]})</span>
                </span>
              </div>
            ))}
            <p className="muted small">
              외웠다가 다시 잊은 횟수가 많은 구절 — 목록에서 골라 다시 다져보세요
            </p>
          </>
        ) : (
          <p className="muted">다시 잊은 적 있는 구절이 아직 없습니다. 👍</p>
        )}
      </section>
    </div>
  )
}
