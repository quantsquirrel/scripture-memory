import type { ReviewEntry, StoredCard } from '../domain/card'
import { type LearnProgress, stepToLegacy } from '../domain/ladder'
import { type ExportBundle, SCHEMA_VERSION, type Store } from '../ports/repositories'
import { decodeBundle } from './bundle'

export interface SyncConfig {
  token: string
  gistId: string
}

const FILE = 'tms-sync.json'
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

async function fetchRemote(cfg: SyncConfig): Promise<ExportBundle> {
  const res = await fetch(`${API}/gists/${cfg.gistId}`, { headers: headers(cfg.token) })
  if (res.status === 404) throw new Error('Gist를 찾을 수 없습니다 (ID 확인)')
  if (!res.ok) throw new Error(`Gist 읽기 실패: HTTP ${res.status}`)
  const gist = (await res.json()) as {
    files: Record<string, { content: string; truncated: boolean; raw_url: string } | undefined>
  }
  const file = gist.files[FILE]
  if (!file) return emptyBundle()
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
    throw new Error('원격 데이터 파싱 실패 — Gist 내용을 확인하세요')
  }
  // 원격도 v1일 수 있다 (다른 기기가 아직 업데이트되지 않은 경우)
  return decodeBundle(parsed)
}

async function pushRemote(cfg: SyncConfig, bundle: ExportBundle): Promise<void> {
  const res = await fetch(`${API}/gists/${cfg.gistId}`, {
    method: 'PATCH',
    headers: headers(cfg.token),
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(bundle) } } }),
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

/** 원격을 읽어 로컬과 병합 → 로컬 저장 + 원격 갱신 */
export async function syncNow(store: Store, cfg: SyncConfig): Promise<SyncResult> {
  const [local, remote] = [await store.exportAll(), await fetchRemote(cfg)]
  const merged = mergeBundles(local, remote)
  await store.importAll(merged)
  await pushRemote(cfg, merged)
  return {
    reviews: merged.reviews.length,
    cards: merged.cards.length,
    learning: merged.learning.length,
  }
}
