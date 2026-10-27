/**
 * 기기 연동 코드 규칙.
 *
 * 화면(입력 검증·표시)과 릴레이 어댑터(생성) 둘 다 쓰는 순수 규칙이라 여기 둔다 —
 * 어댑터는 네트워크 코드여서 화면이 정적으로 import하면 경계 4가 깨진다.
 *
 * 문자표는 헷갈리는 0/O, 1/I를 뺀 32자다. 256이 32로 나누어떨어지므로 바이트를
 * 나머지 연산해도 치우침이 없다.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
/** 릴레이가 코드를 지우기까지의 시간. worker/pairing-relay.ts의 TTL과 같아야 한다. */
export const CODE_TTL_MS = 10 * 60_000

const CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

export function generateCode(randomBytes: (n: number) => Uint8Array): string {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % 32]).join('')
}

/** 사용자가 친 값을 코드로. 대소문자·하이픈·공백은 무시하고, 형식이 틀리면 null. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return CODE.test(code) ? code : null
}

/** 화면 표시용 — 3자씩 끊어 읽기 쉽게 (ABC-DEF) */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`
}
