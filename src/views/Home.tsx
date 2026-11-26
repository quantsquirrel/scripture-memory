import { PROGRESS_ROWS } from '../app/queries'
import { collectionOf, VERSE_BY_ID, VERSES } from '../data/verses'
import { type LadderStep, stepOrdinal } from '../domain/ladder'
import {
  type LearnTarget,
  NewVersePanel,
  ProgressPanel,
  RECALIBRATE_DUE_THRESHOLD,
  RecalibrateBanner,
  TodayReviewPanel,
} from './home/panels'
import { useHomeData } from './hooks'

/**
 * '이어서' 버튼 문구. 진행 중인 구절(강등 구절 포함)은 전부 '이어서'가 맡는다 —
 * 학습 순서상 첫 구절을 보이고, 나머지가 있으면 그 수를 붙인다.
 */
export function resumeLabel(
  refAbbr: string,
  step: LadderStep,
  othersInProgress: number,
): string {
  const { nth, total } = stepOrdinal(step)
  const others = othersInProgress > 0 ? ` · 외 ${othersInProgress}구절` : ''
  return `${refAbbr} (단계 ${nth}/${total})${others}`
}

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
  const resume: LearnTarget | null =
    inProgress && inProgressVerse
      ? {
          id: inProgressVerse.id,
          label: resumeLabel(
            inProgressVerse.refAbbr,
            inProgress.step,
            data.inProgressCount - 1,
          ),
        }
      : null

  const nextNew = data.nextNewId ? VERSE_BY_ID[data.nextNewId] : undefined
  const next: LearnTarget | null = nextNew
    ? { id: nextNew.id, label: `${nextNew.refAbbr} (${collectionOf(nextNew).short})` }
    : null

  const learnEnd = new Date(
    new Date(`${goal.goalDate}T12:00:00`).getTime() - goal.bufferDays * 86400_000,
  )

  return (
    <div>
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
        goal={goal}
        learnEndLabel={`${learnEnd.getMonth() + 1}/${learnEnd.getDate()}`}
        newThisWeek={data.newThisWeek}
        resume={resume}
        next={next}
        // 복습 시작 버튼이 떠 있지 않을 때만 새 구절 학습이 오늘의 주 행동이 된다
        lamp={data.due === 0 && data.upcoming === 0}
        onLearn={onLearn}
      />
      <ProgressPanel
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
