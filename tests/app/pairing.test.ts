import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { idbStore } from '../../src/adapters/indexeddb'
import { MemoryStore } from '../../src/adapters/memory'
import { createPairing, receivePairing } from '../../src/adapters/pairing'
import { applyPairingCode, generatePairingCode, pairingRelay } from '../../src/app/pairing'
import { submitReview } from '../../src/app/review'
import { getRevision } from '../../src/app/revision'
import { required } from '../../src/domain/invariant'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MS,
  formatCode,
  generateCode,
  normalizeCode,
} from '../../src/domain/pairingCode'
import type { Store } from '../../src/ports/repositories'
import relayWorker from '../../worker/pairing-relay'

const RELAY = 'https://relay.test'
const ORIGIN = 'https://app.test'
const NOW = new Date('2026-10-27T10:00:00.000Z')

/** worker/pairing-relay.ts를 그대로 돌리는 가짜 릴레이. KV는 Map, 시계는 손으로 민다. */
function fakeRelay() {
  const kv = new Map<string, { value: string; until: number }>()
  const clock = { now: 0 }
  const env = {
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    PAIRING: {
      get: (k: string) => {
        const e = kv.get(k)
        return Promise.resolve(e && e.until > clock.now ? e.value : null)
      },
      put: (k: string, value: string, { expirationTtl }: { expirationTtl: number }) => {
        kv.set(k, { value, until: clock.now + expirationTtl * 1000 })
        return Promise.resolve()
      },
      delete: (k: string) => {
        kv.delete(k)
        return Promise.resolve()
      },
    },
  }
  const handle = (req: Request) => relayWorker.fetch(req, env)
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handle(new Request(input, init)),
  )
  vi.stubGlobal('fetch', fetch)
  return { kv, clock, fetch, handle }
}

async function deviceWith(verseId: string, at: Date): Promise<MemoryStore> {
  const store = new MemoryStore()
  await store.graduate(verseId, ['topic', 'ref', 'text'], at)
  const card = required(await store.cards.get(`${verseId}:topic`))
  await submitReview(store, card, { mode: 'typing', rating: 3, accuracy: 1, peeks: null }, at)
  return store
}

const counts = async (store: Store) => ({
  reviews: await store.reviews.count(),
  cards: (await store.cards.all()).length,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('연동 코드 규칙', () => {
  it('6자리이고 헷갈리는 0/O/1/I가 없다', () => {
    expect(CODE_ALPHABET).toHaveLength(32)
    expect(CODE_ALPHABET).not.toMatch(/[0O1I]/)
    for (let i = 0; i < 200; i++) {
      const code = generateCode((n) => crypto.getRandomValues(new Uint8Array(n)))
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
      expect(code).toHaveLength(CODE_LENGTH)
    }
  })

  it('바이트 전 구간(0~255)이 문자표에 고르게 대응한다', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const seen = new Map<string, number>()
    for (let i = 0; i < 256; i += CODE_LENGTH) {
      for (const ch of generateCode(() => all.slice(i, i + CODE_LENGTH))) {
        seen.set(ch, (seen.get(ch) ?? 0) + 1)
      }
    }
    expect(seen.size).toBe(32)
  })

  it('입력은 대소문자·하이픈·공백을 무시하고, 형식이 틀리면 거부한다', () => {
    expect(normalizeCode('abc-def')).toBe('ABCDEF')
    expect(normalizeCode(' K7Q 9XM ')).toBe('K7Q9XM')
    expect(normalizeCode('ABCDE')).toBeNull()
    expect(normalizeCode('ABCDEFG')).toBeNull()
    expect(normalizeCode('ABCDE0')).toBeNull()
    expect(normalizeCode('ABCDEI')).toBeNull()
    expect(formatCode('K7Q9XM')).toBe('K7Q-9XM')
  })

  it('앱의 만료 시간과 릴레이 TTL이 같다', async () => {
    const { clock, handle } = fakeRelay()
    await handle(new Request(`${RELAY}/pair/ABCDEF`, { method: 'POST', body: '{}' }))
    clock.now = CODE_TTL_MS - 1
    expect((await handle(new Request(`${RELAY}/pair/ABCDEF`))).status).toBe(200)
    await handle(new Request(`${RELAY}/pair/ABCDEF`, { method: 'POST', body: '{}' }))
    clock.now += CODE_TTL_MS
    expect((await handle(new Request(`${RELAY}/pair/ABCDEF`))).status).toBe(404)
  })
})

describe('코드 연동 왕복 — 병합은 Gist 동기화와 같은 규칙', () => {
  it('받는 기기는 합집합을 갖고, 보내는 기기는 바뀌지 않는다', async () => {
    fakeRelay()
    const phone = await deviceWith('AS1a', NOW)
    const laptop = await deviceWith('AS2a', new Date(NOW.getTime() + 60_000))

    const { code, expiresAt } = await createPairing(phone, RELAY)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(expiresAt - Date.now()).toBeGreaterThan(CODE_TTL_MS - 5_000)

    const result = await receivePairing(laptop, RELAY, formatCode(code).toLowerCase())
    expect(result).toEqual({ reviews: 2, cards: 6, learning: 2 })
    expect(await counts(laptop)).toEqual({ reviews: 2, cards: 6 })
    expect(await counts(phone)).toEqual({ reviews: 1, cards: 3 })
  })

  it('같은 코드를 두 번 쓰면 두 번째는 만료 안내를 받는다 (한 번만 읽힌다)', async () => {
    fakeRelay()
    const phone = await deviceWith('AS1a', NOW)
    const { code } = await createPairing(phone, RELAY)
    await receivePairing(new MemoryStore(), RELAY, code)
    await expect(receivePairing(new MemoryStore(), RELAY, code)).rejects.toThrow(/없거나 만료/)
  })

  it('10분이 지난 코드는 만료 안내를 받고 로컬은 그대로다', async () => {
    const { clock } = fakeRelay()
    const { code } = await createPairing(await deviceWith('AS1a', NOW), RELAY)
    clock.now += CODE_TTL_MS
    const laptop = await deviceWith('AS2a', NOW)
    await expect(receivePairing(laptop, RELAY, code)).rejects.toThrow(/없거나 만료/)
    expect(await counts(laptop)).toEqual({ reviews: 1, cards: 3 })
  })

  it('형식이 틀린 코드는 서버에 묻지 않고 거부한다', async () => {
    const { fetch } = fakeRelay()
    await expect(receivePairing(new MemoryStore(), RELAY, 'ABC-10O')).rejects.toThrow(/6자리/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('코드가 겹치면(409) 새 코드로 다시 올린다', async () => {
    const relay = fakeRelay()
    relay.fetch.mockImplementationOnce(() =>
      Promise.resolve(new Response(null, { status: 409 })),
    )
    const { code } = await createPairing(await deviceWith('AS1a', NOW), RELAY)
    expect(relay.fetch).toHaveBeenCalledTimes(2)
    expect(relay.kv.has(code)).toBe(true)
  })

  it('검증을 통과하지 못한 번들은 병합하지 않는다 (경계 2·3 — 소수 reps)', async () => {
    const relay = fakeRelay()
    const bad = await (await deviceWith('AS1a', NOW)).exportAll(NOW)
    required(bad.cards[0]).card.reps = 1.5
    relay.kv.set('ABCDEF', { value: JSON.stringify(bad), until: Infinity })
    const laptop = await deviceWith('AS2a', NOW)
    await expect(receivePairing(laptop, RELAY, 'ABCDEF')).rejects.toThrow()
    expect(await counts(laptop)).toEqual({ reviews: 1, cards: 3 })
  })

  it('네트워크·서버 오류는 한글 안내로 바뀐다', async () => {
    const relay = fakeRelay()
    const store = new MemoryStore()

    relay.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(receivePairing(store, RELAY, 'ABCDEF')).rejects.toThrow(/인터넷 연결/)

    relay.fetch.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
    await expect(createPairing(store, RELAY)).rejects.toThrow(/응답하지 않습니다/)

    relay.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(createPairing(store, RELAY)).rejects.toThrow(/HTTP 500/)

    relay.fetch.mockResolvedValueOnce(new Response(null, { status: 413 }))
    await expect(createPairing(store, RELAY)).rejects.toThrow(/너무 커서/)

    relay.fetch.mockResolvedValueOnce(new Response(null, { status: 429 }))
    await expect(receivePairing(store, RELAY, 'ABCDEF')).rejects.toThrow(/너무 잦습니다/)

    relay.fetch.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await expect(receivePairing(store, RELAY, 'ABCDEF')).rejects.toThrow(/읽지 못했습니다/)

    relay.fetch.mockResolvedValue(new Response(null, { status: 409 }))
    await expect(createPairing(store, RELAY)).rejects.toThrow(/만들지 못했습니다/)
  })
})

describe('릴레이 Worker', () => {
  it('허용한 출처에만 CORS 헤더를 준다', async () => {
    const { handle } = fakeRelay()
    const pre = await handle(
      new Request(`${RELAY}/pair/ABCDEF`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    )
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    const evil = await handle(
      new Request(`${RELAY}/pair/ABCDEF`, { headers: { Origin: 'https://evil.test' } }),
    )
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('형식이 틀린 경로·메서드·큰 본문은 받지 않는다', async () => {
    const { handle, kv } = fakeRelay()
    expect((await handle(new Request(`${RELAY}/pair/ABC10O`))).status).toBe(404)
    expect((await handle(new Request(`${RELAY}/other`))).status).toBe(404)
    expect(
      (await handle(new Request(`${RELAY}/pair/ABCDEF`, { method: 'DELETE' }))).status,
    ).toBe(405)
    const big = 'x'.repeat(5 * 1024 * 1024 + 1)
    expect(
      (await handle(new Request(`${RELAY}/pair/ABCDEF`, { method: 'POST', body: big }))).status,
    ).toBe(413)
    expect(kv.size).toBe(0)
  })

  it('같은 코드에 두 번 올리면 409', async () => {
    const { handle } = fakeRelay()
    const post = () =>
      handle(new Request(`${RELAY}/pair/ABCDEF`, { method: 'POST', body: '{}' }))
    expect((await post()).status).toBe(201)
    expect((await post()).status).toBe(409)
  })
})

describe('app/pairing — 동적 진입점', () => {
  beforeEach(async () => {
    await idbStore.reset()
  })

  it('릴레이 주소가 없으면 기능이 꺼지고 네트워크를 쓰지 않는다', async () => {
    const { fetch } = fakeRelay()
    vi.stubEnv('VITE_PAIRING_RELAY_URL', '')
    expect(pairingRelay()).toBeNull()
    await expect(generatePairingCode()).rejects.toThrow(/주소가 설정되지/)
    await expect(applyPairingCode('ABCDEF')).rejects.toThrow(/주소가 설정되지/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('코드를 적용하면 IndexedDB에 병합되고 화면 리비전이 오른다', async () => {
    fakeRelay()
    vi.stubEnv('VITE_PAIRING_RELAY_URL', `${RELAY}/`)
    const { code } = await createPairing(await deviceWith('AS1a', NOW), RELAY)
    const before = getRevision()
    const result = await applyPairingCode(code)
    expect(result.reviews).toBe(1)
    expect(await idbStore.reviews.count()).toBe(1)
    expect(getRevision()).toBe(before + 1)

    const mine = await generatePairingCode()
    expect(mine.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})
