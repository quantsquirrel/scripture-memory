import { PROGRESS_ROWS } from '../app/queries'
import { collectionOf, crumbOf, topicOf, VERSE_BY_ID, VERSES } from '../data/verses'
import { STEP_TITLE, stepOrdinal } from '../domain/ladder'
import {
  NewVersePanel,
  type NextTarget,
  ProgressPanel,
  RECALIBRATE_DUE_THRESHOLD,
  RecalibrateBanner,
  type ResumeTarget,
  TodayReviewPanel,
} from './home/panels'
import { useHomeData } from './hooks'

/** 컨테이너: 데이터를 훅에서 받아 프레젠테이션 컴포넌트가 쓸 모양으로만 다듬는다 */
export function Home({
  onReview,
  onLearn,
  onBrowse,
  onRecalibrate,
}: {
  onReview: () => void
  onLearn: (verseId: string) => void
  onBrowse: () => void
  onRecalibrate: () => void
}) {
  const data = useHomeData()
  if (!data) return <p className="muted loading">불러오는 중…</p>

  const { graduatedIds, inProgress, goal } = data
  const inProgressVerse = inProgress ? VERSE_BY_ID[inProgress.verseId] : undefined
  // 이어 하는 구절은 본문을 싣지 않는다 — 타이핑 검증을 앞둔 구절의 정답이 홈에 비치면 안 된다
  const resume: ResumeTarget | null =
    inProgress && inProgressVerse
      ? {
          id: inProgressVerse.id,
          label: `${inProgressVerse.refAbbr} (단계 ${stepOrdinal(inProgress.step).nth}/${stepOrdinal(inProgress.step).total})`,
          ref: inProgressVerse.ref,
          stepTitle: STEP_TITLE[inProgress.step],
          ...stepOrdinal(inProgress.step),
        }
      : null

  // 아직 배우지 않은 다음 구절은 말씀 첫머리까지 비춘다 — 학습 1단계가 어차피 본문부터 연다
  const nextNew = data.nextNewId ? VERSE_BY_ID[data.nextNewId] : undefined
  const next: NextTarget | null = nextNew
    ? {
        id: nextNew.id,
        label: `${nextNew.refAbbr} (${collectionOf(nextNew).short})`,
        ref: nextNew.ref,
        crumb: [...crumbOf(nextNew), topicOf(nextNew).title],
        text: nextNew.text,
      }
    : null

  const learnEnd = new Date(
    new Date(`${goal.goalDate}T12:00:00`).getTime() - goal.bufferDays * 86400_000,
  )

  return (
    <div className="home">
      {data.due >= RECALIBRATE_DUE_THRESHOLD && <RecalibrateBanner onOpen={onRecalibrate} />}
      <TodayReviewPanel
        due={data.due}
        dueVerses={data.dueVerses}
        overdue={data.overdue}
        upcoming={data.upcoming}
        todayReviews={data.todayReviews}
        nextDue={data.nextDue}
        now={data.now}
        onReview={onReview}
      />
      <NewVersePanel
        resume={resume}
        next={next}
        // 복습 시작 버튼이 떠 있지 않을 때만 새 구절 학습이 오늘의 주 행동이 된다
        lamp={data.due === 0 && data.upcoming === 0}
        onLearn={onLearn}
      />
      <ProgressPanel
        goal={goal}
        learnEndLabel={`${learnEnd.getMonth() + 1}/${learnEnd.getDate()}`}
        newThisWeek={data.newThisWeek}
        overall={{ done: graduatedIds.size, total: VERSES.length }}
        rows={PROGRESS_ROWS.map((row) => ({
          key: row.key,
          label: row.label,
          done: row.verseIds.filter((id) => graduatedIds.has(id)).length,
          total: row.verseIds.length,
        }))}
        onOpen={onBrowse}
      />
    </div>
  )
}
