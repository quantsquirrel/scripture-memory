import { CODE_TTL_MS, generateCode, normalizeCode } from '../domain/pairingCode'
import type { ExportBundle, Store } from '../ports/repositories'
import { decodeBundle } from './bundle'
import { mergeBundles, type SyncResult } from './gist'

/**
 * 6자리 코드로 기기 간 번들을 한 번 건네는 릴레이 (worker/pairing-relay.ts).
 *
 * 릴레이는 코드를 키로 번들을 10분 맡아 두고, 한 번 읽히면 지운다. 받는 쪽은
 * Gist 동기화와 같은 mergeBundles를 mergeAll 트랜잭션 안에서 적용한다 — 복습
 * 기록은 합집합, 카드·사다리는 더 진행된 쪽. 보내는 쪽 데이터는 바뀌지 않는다.
 */
export interface Pairing {
  code: string
  expiresAt: number
}

const TIMEOUT_MS = 15_000

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('연동 서버가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요')
    }
    throw new Error('연동 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요')
  }
}

function failure(status: number): Error {
  if (status === 413) return new Error('데이터가 너무 커서 코드로 보낼 수 없습니다')
  if (status === 429) return new Error('요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요')
  return new Error(`연동 서버 오류입니다 (HTTP ${status})`)
}

const endpoint = (relay: string, code: string): string =>
  `${relay.replace(/\/+$/, '')}/pair/${code}`

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))

/** 이 기기의 현재 데이터를 올리고 코드를 받는다. 코드가 겹치면(409) 새로 뽑는다. */
export async function createPairing(store: Store, relay: string): Promise<Pairing> {
  const body = JSON.stringify(await store.exportAll())
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode(randomBytes)
    const res = await call(endpoint(relay, code), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (res.ok) return { code, expiresAt: Date.now() + CODE_TTL_MS }
    if (res.status !== 409) throw failure(res.status)
  }
  throw new Error('코드를 만들지 못했습니다. 다시 시도해 주세요')
}

async function fetchBundle(relay: string, code: string): Promise<ExportBundle> {
  const res = await call(endpoint(relay, code))
  if (res.status === 404) {
    throw new Error(
      '코드가 없거나 만료되었습니다. 코드는 10분 동안 한 번만 쓸 수 있으니 새 코드를 만들어 주세요',
    )
  }
  if (!res.ok) throw failure(res.status)
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('받은 데이터를 읽지 못했습니다')
  }
  return decodeBundle(parsed)
}

/** 다른 기기가 올린 번들을 받아 이 기기 데이터에 병합한다 */
export async function receivePairing(
  store: Store,
  relay: string,
  input: string,
): Promise<SyncResult> {
  const code = normalizeCode(input)
  if (!code) throw new Error('코드는 6자리 영문·숫자입니다 (0·O·1·I 제외)')
  const remote = await fetchBundle(relay, code)
  const merged = await store.mergeAll((local) => mergeBundles(local, remote))
  return {
    reviews: merged.reviews.length,
    cards: merged.cards.length,
    learning: merged.learning.length,
  }
}
