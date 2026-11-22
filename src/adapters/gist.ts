import type { ReviewEntry, SerializedCard, StoredCard } from '../domain/card'
import { isGraduated, type LearnProgress, stepToLegacy } from '../domain/ladder'
import { type ExportBundle, SCHEMA_VERSION, type Store } from '../ports/repositories'
import { decodeBundle } from './bundle'
import { mergeGoalPrefs } from './goalPrefs'

export interface SyncConfig {
  token: string
  gistId: string
}

/**
 * 기기마다 자기 파일(tms-sync-<deviceId>.json)에만 쓰고, 읽을 때는 tms-sync*.json을
 * 전부 합친다. 한 파일을 여러 기기가 덮어쓰면 조건부 쓰기가 없는 PATCH라 나중
 * 기기가 앞 기기의 "동기화 완료"된 기록을 지운다. tms-sync.json은 이전 버전이 쓰던
 * 공용 파일이라 읽기만 한다.
 */
const SYNC_FILE = /^tms-sync(-[0-9a-f]+)?\.json$/
const deviceFile = (deviceId: string): string => `tms-sync-${deviceId}.json`
const API = 'https://api.github.com'

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
}

function emptyBundle(): ExportBundle {
  return {
    app: 'scripture-memory',
    version: SCHEMA_VERSION,
    exportedAt: new Date(0).toISOString(),
    cards: [],
    reviews: [],
    learning: [],
  }
}

/** 시각 값. 가져온 번들은 ISO 표기가 다를 수 있어(…00Z 대 …00.000Z) 문자열로 비교하지 않는다 */
const time = (iso: string): number => Date.parse(iso)

const order = (x: number | string, y: number | string): number => (x < y ? -1 : x > y ? 1 : 0)

/**
 * 카드가 마지막으로 바뀐 시각: 마지막 복습. 복습 전 새 카드(reps 0)는 발행 시각인 due.
 * last_review 없이 reps가 있는 옛 카드(옛 버전이 남긴 모양 — 기존 fixture의 AS1a:text)는
 * 언제 바뀌었는지 모르므로 가장 오래된 것으로 친다.
 */
function changedAt(c: SerializedCard): number {
  if (c.last_review !== undefined) return time(c.last_review)
  return c.reps === 0 ? time(c.due) : -Infinity
}

/** 마지막 동률 깨기. 필드 순서를 고정해 객체의 키 순서와 무관하게 한다 */
const canonical = (c: StoredCard): string =>
  JSON.stringify([
    c.verseId,
    c.direction,
    c.card.due,
    c.card.last_review ?? null,
    c.card.stability,
    c.card.difficulty,
    c.card.elapsed_days,
    c.card.scheduled_days,
    c.card.reps,
    c.card.lapses,
    c.card.learning_steps,
    c.card.state,
  ])

/** 같은 키의 카드끼리: 나중에 바뀐 쪽 → reps 많은 쪽 → due 늦은 쪽 → 정규 표기 */
const compareCards = (x: StoredCard, y: StoredCard): number =>
  order(changedAt(x.card), changedAt(y.card)) ||
  order(x.card.reps, y.card.reps) ||
  order(time(x.card.due), time(y.card.due)) ||
  order(canonical(x), canonical(y))

/** 같은 구절의 학습 행끼리: 나중에 바뀐 쪽 → 사다리 순번 높은 쪽 → 같은 시각의 다른 표기 */
const compareLearning = (x: LearnProgress, y: LearnProgress): number =>
  order(time(x.updatedAt), time(y.updatedAt)) ||
  order(stepToLegacy(x.step), stepToLegacy(y.step)) ||
  order(x.updatedAt, y.updatedAt)

/** 키마다 compare가 가장 큰 행. 전순서라 행의 순서와 무관하게 같은 행이 남는다 */
function latest<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  compare: (x: T, y: T) => number,
): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    const prev = out.get(keyOf(row))
    if (!prev || compare(row, prev) > 0) out.set(keyOf(row), row)
  }
  return out
}

/**
 * 두 번들을 합친다 — 간편 연동(receivePairing)과 Gist 동기화(fetchRemote·syncNow)가
 * 같이 쓴다. 복습 기록은 합집합(키 `cardKey|ts|rating`), 암송 목표는 나중에 바꾼 쪽
 * (mergeGoalPrefs). 카드·학습 상태는 구절마다 "나중에 바뀐 쪽"을 고른다:
 *
 * 1. 학습 단계: updatedAt이 늦은 쪽. 같으면 사다리 순번이 높은 쪽.
 * 2. 고른 단계가 졸업 전이면 그 구절의 카드는 넣지 않는다 — 강등(demoteToLadder:
 *    카드 삭제 + firstLetter)이 이렇게 다른 기기로 전해진다.
 * 3. 졸업이면 카드 키마다 변경 시각(changedAt)이 늦은 쪽. 같으면 reps 많은 쪽, due 늦은
 *    쪽, 그다음 인자 순서와 무관한 정규 표기 순.
 * 4. 학습 행이 어느 쪽에도 없는 구절의 카드는 지우지 않고 3번처럼 고른다(하드 경계 3).
 *
 * 있는 상태 중에서 고르기만 한다 — FSRS 상태를 새로 계산하거나 복습 기록을 재생해
 * 카드를 만들지 않는다(하드 경계 1). 교환·멱등과 접기 순서는 tests/properties.test.ts.
 *
 * 알고 받아들인 대가:
 * - 오래 연동하지 않은 기기의 더 늦은 복습이 더 진행된(reps 많은) 카드를 덮을 수 있다.
 *   복습 기록은 남는다.
 * - 연동하지 않은 기기에서 이미 다른 기기가 졸업한 구절을 새로 배우기 시작하면, 그
 *   사다리 진행이 더 늦은 변경이므로 병합 결과에서 그 구절 카드가 내려간다.
 * - 되살아난 옛 카드를 다른 기기의 재졸업보다 늦게 복습했다면 그 카드는 복습한 쪽
 *   상태가 남는다.
 */
export function mergeBundles(a: ExportBundle, b: ExportBundle): ExportBundle {
  const reviews = new Map<string, ReviewEntry>()
  for (const r of [...a.reviews, ...b.reviews]) {
    const { id: _id, ...rest } = r
    reviews.set(`${r.cardKey}|${r.ts}|${r.rating}`, rest)
  }
  const learning = latest([...a.learning, ...b.learning], (l) => l.verseId, compareLearning)
  const kept = (c: StoredCard): boolean => {
    const l = learning.get(c.verseId)
    return l === undefined || isGraduated(l)
  }
  const cards = latest([...a.cards, ...b.cards].filter(kept), (c) => c.key, compareCards)
  const merged: ExportBundle = {
    app: 'scripture-memory',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards: [...cards.values()],
    reviews: [...reviews.values()].sort((x, y) => (x.ts < y.ts ? -1 : 1)),
    learning: [...learning.values()],
  }
  const goal = mergeGoalPrefs(a.goal, b.goal)
  if (goal) merged.goal = goal
  return merged
}

interface GistFile {
  content: string
  truncated: boolean
  raw_url: string
}

async function readFile(name: string, file: GistFile): Promise<ExportBundle> {
  let content = file.content
  if (file.truncated) {
    const raw = await fetch(file.raw_url)
    if (!raw.ok) throw new Error(`Gist raw 읽기 실패: HTTP ${raw.status}`)
    content = await raw.text()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`원격 데이터 파싱 실패 — Gist의 ${name}을 확인하세요`)
  }
  // 원격도 v1일 수 있다 (다른 기기가 아직 업데이트되지 않은 경우)
  return decodeBundle(parsed)
}

/** Gist의 모든 동기화 파일을 읽어 하나로 병합한다 */
async function fetchRemote(cfg: SyncConfig): Promise<ExportBundle> {
  const res = await fetch(`${API}/gists/${cfg.gistId}`, { headers: headers(cfg.token) })
  if (res.status === 404) throw new Error('Gist를 찾을 수 없습니다 (ID 확인)')
  if (!res.ok) throw new Error(`Gist 읽기 실패: HTTP ${res.status}`)
  const gist = (await res.json()) as { files: Record<string, GistFile | undefined> }
  let remote = emptyBundle()
  for (const [name, file] of Object.entries(gist.files)) {
    if (!file || !SYNC_FILE.test(name)) continue
    remote = mergeBundles(remote, await readFile(name, file))
  }
  return remote
}

async function pushRemote(cfg: SyncConfig, file: string, bundle: ExportBundle): Promise<void> {
  const res = await fetch(`${API}/gists/${cfg.gistId}`, {
    method: 'PATCH',
    headers: headers(cfg.token),
    body: JSON.stringify({ files: { [file]: { content: JSON.stringify(bundle) } } }),
  })
  if (!res.ok) {
    throw new Error(`Gist 쓰기 실패: HTTP ${res.status} (토큰의 gist 권한 확인)`)
  }
}

export interface SyncResult {
  reviews: number
  cards: number
  learning: number
}

async function deviceIdOf(store: Store): Promise<string> {
  const saved = await store.settings.syncDeviceId()
  if (saved) return saved
  const id = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  await store.settings.setSyncDeviceId(id)
  return id
}

const fallbackLocks = new Map<string, Promise<unknown>>()

/**
 * 같은 이름의 작업을 한 번에 하나씩. 탭 사이는 Web Locks가, 그것이 없는 환경에서는
 * 이 모듈 안의 대기열이 줄 세운다.
 */
async function exclusive<T>(name: string, run: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks
  if (locks) return await locks.request(name, run)
  const prev = fallbackLocks.get(name) ?? Promise.resolve()
  const next = prev.then(run, run)
  fallbackLocks.set(
    name,
    next.catch(() => undefined),
  )
  return next
}

/**
 * 원격을 읽어 로컬과 병합 → 로컬 저장 + 이 기기 파일 갱신.
 *
 * 병합은 네트워크를 기다린 뒤 mergeAll 트랜잭션 안에서 그 순간의 로컬에 대고 한다 —
 * 응답을 기다리는 동안 채점한 기록도 병합에 들어간다. 전체를 기기별 잠금 안에서
 * 돌리는 이유: 같은 기기에서 동기화 두 개가 겹치면 먼저 병합한 쪽이 나중에 push해
 * 이 기기 파일을 옛 내용으로 덮는다(탭 두 개, 설정 화면 재진입).
 */
export async function syncNow(store: Store, cfg: SyncConfig): Promise<SyncResult> {
  const deviceId = await deviceIdOf(store)
  return exclusive(`tms-sync:${deviceId}`, async () => {
    const remote = await fetchRemote(cfg)
    const merged = await store.mergeAll((local) => mergeBundles(local, remote))
    await pushRemote(cfg, deviceFile(deviceId), merged)
    return {
      reviews: merged.reviews.length,
      cards: merged.cards.length,
      learning: merged.learning.length,
    }
  })
}
