import { localDateKey, type PlanDay, planFor, portionLabel } from '../data/readingPlan'
import { loadCandidates } from '../data/xrefCandidates'
import {
  chapterKey,
  type MeditationResult,
  pickMeditation,
  type ShownEntry,
  type SourceChapter,
} from '../domain/meditation'
import { advanceQt, formatQt, parseQt, type QtPosition } from '../domain/qt'
import type { Store } from '../ports/repositories'

/** 오늘 묵상 화면이 필요로 하는 전부 */
export interface MeditationData {
  dateKey: string
  /** 통독 계획의 오늘 (계획 기간 밖이면 null) */
  plan: PlanDay | null
  planLabel: string | null
  /** 통독 일차 1..365 */
  planDay: number | null
  qt: QtPosition | null
  /** QT 위치가 저장값에서 자동으로 밀린 추정값인가 */
  qtEstimated: boolean
  result: MeditationResult
}

/** 로그 한 줄 'YYYY-MM-DD|구절id' — JSON 배열로 담는다 */
const MAX_LOG = 120

/** 'YYYY-MM-DD'이면서 실제로 존재하는 날짜인가 */
function isCalendarDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

export function decodeLog(raw: string | undefined): ShownEntry[] {
  if (raw === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [] // 손상된 값은 없는 것으로 — 잠시 중복이 나올 뿐 해가 없다
  }
  if (!Array.isArray(parsed)) return []
  const out: ShownEntry[] = []
  for (const row of parsed) {
    if (typeof row !== 'string') continue
    const [date, verseId] = row.split('|')
    if (date === undefined || verseId === undefined) continue
    // 형식만 보면 '2026-13-99'가 통과해 재등장 간격 계산이 조용히 어긋난다.
    // Date.parse는 '2026-02-30'을 3월 2일로 넘겨 주므로 되돌려 비교한다.
    if (!isCalendarDate(date) || verseId === '') continue
    out.push({ date, verseId })
  }
  return out
}

export function encodeLog(entries: readonly ShownEntry[]): string {
  const trimmed = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_LOG)
  return JSON.stringify(trimmed.map((e) => `${e.date}|${e.verseId}`))
}

/** 통독 분량 + QT 한 장 → 확산의 씨앗이 될 장 목록 */
export function sourceChapters(plan: PlanDay | null, qt: QtPosition | null): SourceChapter[] {
  const chapters: SourceChapter[] = []
  for (const p of plan?.portions ?? [])
    for (let c = p.from; c <= p.to; c++)
      chapters.push({ key: chapterKey(p.book, c), label: `${p.book} ${c}`, origin: 'reading' })
  if (qt)
    chapters.push({
      key: chapterKey(qt.book, qt.chapter),
      label: `${qt.book} ${qt.chapter}`,
      origin: 'qt',
    })
  return chapters
}

async function readQt(
  store: Store,
  dateKey: string,
): Promise<{ qt: QtPosition | null; estimated: boolean }> {
  const [raw, savedDate] = await Promise.all([
    store.settings.qtPosition(),
    store.settings.qtPositionDate(),
  ])
  const saved = raw === undefined ? null : parseQt(raw)
  if (!saved) return { qt: null, estimated: false }
  if (savedDate === undefined) return { qt: saved, estimated: false }
  const { position, estimated } = advanceQt(saved, savedDate, dateKey)
  return { qt: position, estimated }
}

export async function loadMeditation(
  store: Store,
  now: Date = new Date(),
): Promise<MeditationData> {
  const dateKey = localDateKey(now)
  const [{ qt, estimated }, logRaw, table] = await Promise.all([
    readQt(store, dateKey),
    store.settings.meditationLog(),
    loadCandidates(),
  ])
  const plan = planFor(dateKey)
  const shown = decodeLog(logRaw)
  // 오늘 것은 기록에서 빼고 고른다 — 그러지 않으면 어제 저장한 오늘 항목이
  // 자기 자신을 밀어내 하루 안에 구절이 바뀐다
  const history = shown.filter((e) => e.date !== dateKey)
  const chapters = sourceChapters(plan, qt)
  const result = pickMeditation(table, chapters, history, dateKey)
  return {
    dateKey,
    plan,
    planLabel: plan ? portionLabel(plan.portions) : null,
    planDay: plan?.n ?? null,
    qt,
    qtEstimated: estimated,
    result,
  }
}

/** 오늘 보여준 구절을 기록에 남긴다 (같은 날 중복 기록은 덮어쓴다) */
export async function rememberMeditation(
  store: Store,
  dateKey: string,
  verseId: string,
): Promise<void> {
  const shown = decodeLog(await store.settings.meditationLog())
  if (shown.some((e) => e.date === dateKey && e.verseId === verseId)) return
  const next = [...shown.filter((e) => e.date !== dateKey), { date: dateKey, verseId }]
  await store.settings.setMeditationLog(encodeLog(next))
}

/** 사용자가 QT 본문을 고쳐 적었다 */
export async function setQtPosition(
  store: Store,
  position: QtPosition,
  dateKey: string,
): Promise<void> {
  await store.settings.setQtPosition(formatQt(position))
  await store.settings.setQtPositionDate(dateKey)
}
