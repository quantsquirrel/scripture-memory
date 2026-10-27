import type { SyncResult } from '../adapters/gist'
import type { Pairing } from '../adapters/pairing'
import { store } from './index'
import { bumpRevision } from './revision'

export type { Pairing }

/**
 * 6자리 코드 기기 연동 (선택 기능).
 *
 * Gist 동기화(app/sync.ts)와 같은 이유로 어댑터를 동적 import한다 — 연동 버튼을
 * 누르기 전까지 네트워크 코드가 로드되지 않고 별도 청크로 갈라진다.
 *
 * 릴레이 주소는 빌드 때 VITE_PAIRING_RELAY_URL로 넣는다. 없으면 기능이 꺼진다.
 */
export function pairingRelay(): string | null {
  const url = import.meta.env.VITE_PAIRING_RELAY_URL?.trim() ?? ''
  return url === '' ? null : url
}

function relayOrThrow(): string {
  const relay = pairingRelay()
  if (!relay) throw new Error('이 빌드에는 연동 서버 주소가 설정되지 않았습니다')
  return relay
}

export async function generatePairingCode(): Promise<Pairing> {
  const { createPairing } = await import('../adapters/pairing')
  return createPairing(store, relayOrThrow())
}

export async function applyPairingCode(code: string): Promise<SyncResult> {
  const { receivePairing } = await import('../adapters/pairing')
  const result = await receivePairing(store, relayOrThrow(), code)
  bumpRevision()
  return result
}
