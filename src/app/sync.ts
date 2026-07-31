import type { SyncConfig, SyncResult } from '../adapters/gist'
import { store } from './index'
import { bumpRevision } from './revision'

export type { SyncConfig, SyncResult }

/**
 * Gist 동기화 (선택 기능).
 *
 * 어댑터를 동적 import로 불러오는 이유: 정적으로 import하면 네트워크를 쓰는
 * 코드가 핵심 번들에 함께 들어가고, "오프라인 완결" 경계가 구조가 아니라 관례로
 * 내려앉는다. 이렇게 두면 동기화 버튼을 누르기 전까지 gist 어댑터가 로드되지
 * 않고, 별도 청크로 갈라져 나가는 것이 빌드 산출물로 확인된다.
 */
export async function syncNow(cfg: SyncConfig): Promise<SyncResult> {
  const { syncNow: run } = await import('../adapters/gist')
  const result = await run(store, cfg)
  bumpRevision()
  return result
}
