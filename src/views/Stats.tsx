import { useEffect, useState } from 'react'
import { BulletBar, ForecastBars, HistoryBars } from '../components/StatCharts'
import {
  collectionOf,
  sectionOf,
  sectionsOf,
  topicOf,
  VERSE_BY_ID,
  VERSES,
  type VerseEntry,
} from '../data/verses'
import {
  dueCards,
  getAllCards,
  getAllLearning,
  getExamMode,
  getGoalBufferDays,
  getGoalDate,
  reviewsSince,
} from '../lib/db'
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
  dailyPick,
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
import { DIRECTION_LABEL, type Direction, type StoredCard } from '../lib/types'

interface StatsData {
  cards: StoredCard[]
  graduatedIds: Set<string>
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

/** 시 119:11 후반절 — 정본 데이터(C6b)에서 잘라 쓴다. 없으면 표시 생략 */
const EPIGRAPH = (() => {
  const t = VERSE_BY_ID['C6b']?.text ?? ''
  const i = t.indexOf('내가 주께 범죄치')
  return i >= 0 ? t.slice(i) : null
})()

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
      getGoalDate(),
      getGoalBufferDays(),
      getExamMode(),
    ]).then(([cards, learning, due, allReviews, goalDate, buffer, examMode]) => {
      const gd = goalDate ?? DEFAULT_GOAL_DATE
      const weekAgo = new Date(midnight.getTime() - 7 * 86400_000).toISOString()
      const monthAgo = new Date(midnight.getTime() - 30 * 86400_000).toISOString()
      const month = allReviews.filter((r) => r.ts >= monthAgo)
      const week = month.filter((r) => r.ts >= weekAgo)
      const today = month.filter((r) => r.ts >= midnight.toISOString())
      setData({
        cards,
        graduatedIds: new Set(learning.filter((l) => l.step >= 3).map((l) => l.verseId)),
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

  // 오늘 다시 음미할 말씀: 이미 새긴 구절을 데이터 순서대로 하루 하나씩 순환
  const engraved = VERSES.filter((v) => data.graduatedIds.has(v.id))
  const meditation = dailyPick(engraved)

  // 마음 밭: 홈 진행률과 같은 묶음, 다만 '몇 구절'이 아니라 '얼마나 깊이'를 본다
  const coreKeys = new Set(['AS', 'LV', 'TMS60'])
  const fieldRows = [
    {
      key: 'core',
      label: '5확신·8동행·60구절',
      verses: VERSES.filter((v) => coreKeys.has(collectionOf(v).key)),
    },
    ...sectionsOf('DEP').map((s, i) => ({
      key: s.key,
      label: `${i + 1}. ${s.title}`,
      verses: VERSES.filter((v) => sectionOf(v).key === s.key),
    })),
    {
      key: 'TMS180',
      label: '180구절',
      verses: VERSES.filter((v) => collectionOf(v).key === 'TMS180'),
    },
  ].map((row) => {
    const ids = new Set(row.verses.map((v) => v.id))
    const depth = knowledgeNow(data.cards.filter((c) => ids.has(c.verseId))).avgRetrievability
    const done = row.verses.filter((v) => data.graduatedIds.has(v.id)).length
    return { ...row, depth, done }
  })

  const weakEntries = data.weak
    .map((w) => ({ ...w, verse: VERSE_BY_ID[w.verseId] as VerseEntry | undefined }))
    .filter((w) => w.verse)

  return (
    <div>
      <section className="panel">
        <h2>마음에 새긴 말씀</h2>
        {EPIGRAPH && (
          <div className="callout">
            {EPIGRAPH}
            <span className="muted small"> — 시 119:11</span>
          </div>
        )}
        <p>
          <strong className="big-number">{engraved.length}</strong>
          <span className="muted">/{VERSES.length}구절</span>이 마음에 새겨져 있습니다
          {data.knowledge.avgRetrievability !== null && (
            <span className="muted">
              {' '}
              · 지금도 {pct(data.knowledge.avgRetrievability)}쯤 생생하게
            </span>
          )}
        </p>
        <p className="muted small">
          암송은 시험을 위해서가 아니라, 필요한 순간에 말씀이 먼저 떠오르게 하기 위한
          훈련입니다.
        </p>
      </section>

      <section className="panel">
        <h2>오늘 다시 음미할 말씀</h2>
        {meditation ? (
          <>
            <p className="verse">{meditation.text}</p>
            <p className="answer-ref">
              {meditation.refAbbr}
              <span className="muted small"> · {topicOf(meditation).title}</span>
            </p>
            <p className="muted small">
              이미 새긴 {engraved.length}구절 중 오늘의 하나 — 외우기 위해서가 아니라 곱씹기
              위해, 소리 내어 한 번 읽어보세요. 내일은 다음 구절이 찾아옵니다.
            </p>
          </>
        ) : (
          <p className="muted">첫 구절을 새기면, 여기서 매일 한 구절씩 다시 만나게 됩니다.</p>
        )}
      </section>

      {weakEntries.length > 0 && (
        <section className="panel">
          <h2>다시 붙들 말씀</h2>
          {weakEntries.map((w) => (
            <div key={w.verseId} className="weak-item">
              <div className="weak-head">
                <span>
                  {w.verse!.refAbbr}{' '}
                  <span className="muted small">{topicOf(w.verse!).title}</span>
                </span>
                <span className="muted small">{w.lapses}번 다시 붙듦</span>
              </div>
              <p className="weak-snippet muted small">
                {w.verse!.text.length > 40 ? `${w.verse!.text.slice(0, 40)}…` : w.verse!.text}
              </p>
            </div>
          ))}
          <p className="muted small">
            자주 놓치는 말씀은 어쩌면 지금 내게 가장 필요한 말씀입니다 — 복습에서 다시 만나면
            뜻을 한 번 더 새겨보세요.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>마음 밭</h2>
        {fieldRows.map((row) => (
          <div key={row.key} className="col-row col-row-static">
            <span className="col-label">{row.label}</span>
            <span className="progress col-bar">
              <span className="progress-fill" style={{ width: `${(row.depth ?? 0) * 100}%` }} />
            </span>
            <span className="muted small">
              {row.done > 0 && row.depth !== null ? `${row.done}구절 · ${pct(row.depth)}` : '—'}
            </span>
          </div>
        ))}
        <p className="muted small">
          영역별로 말씀이 얼마나 깊이 새겨져 있는지 (막대 = 새긴 구절의 평균 기억 생생함) — 비어
          있는 밭이 다음에 심을 자리입니다.
        </p>
      </section>

      <section className="panel">
        <h2>동행</h2>
        <p>
          <strong className="big-number">{data.history.streak}</strong>일째 매일 말씀과 동행
          <span className="muted">
            {' '}
            · 최근 7일 하루 평균 {Math.round(data.history.avgPerDay)}회
          </span>
        </p>
        <HistoryBars counts={data.history.counts} />
        <p className="muted small">
          몰아서 외우는 것보다 매일 조금씩 만나는 것이 마음에 새기는 길입니다.
        </p>
      </section>

      <details className="tech-details">
        <summary>훈련 상세 지표 — 암기 훈련을 점검하고 싶을 때</summary>

        <h3>지금 기억 상태</h3>
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
              {pct(retentionTarget)})
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
          {formatMonthDay(data.goal.goalDate)}에 기억률 {pct(EXAM_RETENTION)} 이상으로 예측되는
          구절
        </p>

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

        <h3>복습 성과</h3>
        {data.retention7.rate !== null && (
          <>
            <BulletBar rate={data.retention7.rate} target={retentionTarget} />
            <p className="muted small">
              지난 7일 기억률 {pct(data.retention7.rate)} (눈금 = 목표 {pct(retentionTarget)}) ·
              카드별 하루 첫 시도 {data.retention7.total}회 기준
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

        <h3>자가 채점 보정</h3>
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

        <h3>오늘과 앞으로의 부하</h3>
        {data.queue.rate !== null && (
          <>
            <BulletBar rate={data.queue.rate} />
            <p className="muted small">
              오늘 소화 {data.queue.done}/{data.queue.done + data.queue.remaining}장 (
              {pct(data.queue.rate)}){data.overdue > 0 && ` · 밀린 카드 ${data.overdue}장`}
            </p>
          </>
        )}
        <ForecastBars forecast={data.forecast} />
        <p className="muted small">
          향후 7일 예보 — 내일 {data.forecast.tomorrow}장 · 하루 평균{' '}
          {Math.round(data.forecast.avgPerDay)}장
        </p>

        {!data.goal.past && data.goal.remaining > 0 && (
          <>
            <h3>학습 페이스</h3>
            <p>
              최근 7일 하루 <strong>{data.goal.recentPace.toFixed(1)}</strong>구절 · 필요 페이스
              하루 {data.goal.requiredPace.toFixed(1)}구절
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
          </>
        )}
      </details>
    </div>
  )
}
