/**
 * 6자리 코드 기기 연동 릴레이 (Cloudflare Workers + KV).
 *
 * POST /pair/:code — 번들을 10분 맡는다 (같은 코드가 있으면 409)
 * GET  /pair/:code — 한 번 돌려주고 지운다 (없거나 만료면 404)
 *
 * 본문은 파싱하지 않고 문자열 그대로 둔다 — 검증은 받는 앱의 decodeBundle이 한다.
 * 배포: worker/에서 `npx wrangler kv namespace create PAIRING` → wrangler.toml의 id 교체
 * → `npx wrangler deploy`.
 */
interface Env {
  PAIRING: {
    get(key: string): Promise<string | null>
    put(key: string, value: string, opts: { expirationTtl: number }): Promise<void>
    delete(key: string): Promise<void>
  }
  ALLOWED_ORIGINS: string
}

const ROUTE = /^\/pair\/([A-HJ-NP-Z2-9]{6})$/
const TTL_SECONDS = 600 // src/domain/pairingCode.ts의 CODE_TTL_MS와 같아야 한다
const MAX_BYTES = 5 * 1024 * 1024

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin)
    const reply = (status: number, body: string | null = null): Response =>
      new Response(body, {
        status,
        headers: {
          ...(allowed && { 'Access-Control-Allow-Origin': origin }),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
          Vary: 'Origin',
        },
      })

    if (req.method === 'OPTIONS') return reply(204)
    const code = ROUTE.exec(new URL(req.url).pathname)?.[1]
    if (!code) return reply(404)

    if (req.method === 'GET') {
      const bundle = await env.PAIRING.get(code)
      if (bundle === null) return reply(404)
      await env.PAIRING.delete(code)
      return reply(200, bundle)
    }
    if (req.method === 'POST') {
      if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BYTES) return reply(413)
      const bundle = await req.text()
      if (bundle.length > MAX_BYTES) return reply(413)
      if ((await env.PAIRING.get(code)) !== null) return reply(409)
      await env.PAIRING.put(code, bundle, { expirationTtl: TTL_SECONDS })
      return reply(201)
    }
    return reply(405)
  },
}
