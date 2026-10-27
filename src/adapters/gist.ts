import type { ReviewEntry, StoredCard } from '../domain/card'
import { type LearnProgress, stepToLegacy } from '../domain/ladder'
import { type ExportBundle, SCHEMA_VERSION, type Store } from '../ports/repositories'
import { decodeBundle } from './bundle'

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

/** 리뷰는 합집합, 카드/학습 상태는 더 진행된 쪽 우선. */
export function mergeBundles(a: ExportBundle, b: ExportBundle): ExportBundle {
  const reviews = new Map<string, ReviewEntry>()
  for (const r of [...a.reviews, ...b.reviews]) {
    const { id: _id, ...rest } = r
    reviews.set(`${r.cardKey}|${r.ts}|${r.rating}`, rest)
  }
  const cards = new Map<string, StoredCard>()
  for (const c of [...a.cards, ...b.cards]) {
    const prev = cards.get(c.key)
    if (
      !prev ||
      c.card.reps > prev.card.reps ||
      (c.card.reps === prev.card.reps && c.card.due > prev.card.due)
    ) {
      cards.set(c.key, c)
    }
  }
  const learning = new Map<string, LearnProgress>()
  for (const l of [...a.learning, ...b.learning]) {
    const prev = learning.get(l.verseId)
    // 사다리 단계는 문자열이므로 순서 비교는 사다리 순번으로 한다
    if (
      !prev ||
      stepToLegacy(l.step) > stepToLegacy(prev.step) ||
      (l.step === prev.step && l.updatedAt > prev.updatedAt)
    ) {
      learning.set(l.verseId, l)
    }
  }
  return {
    app: 'scripture-memory',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards: [...cards.values()],
    reviews: [...reviews.values()].sort((x, y) => (x.ts < y.ts ? -1 : 1)),
    learning: [...learning.values()],
  }
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
