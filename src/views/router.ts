import { useCallback, useSyncExternalStore } from 'react'

/**
 * hash 라우팅.
 *
 * 이전에는 useState<View>여서 딥링크·뒤로가기·새로고침이 모두 불가능했다.
 * hash를 쓰는 이유: 이 앱은 GitHub Pages의 서브경로(vite base
 * '/scripture-memory/')에 정적 파일로 올라가고 서버 리라이트가 없다.
 * history API로 경로를 바꾸면 새로고침 시 404가 나지만, hash는 서버에 전달되지
 * 않으므로 base 경로와 서비스 워커의 precache(index.html) 그대로 동작한다.
 * 오프라인에서도 hash 이동은 네트워크를 타지 않는다.
 */
export type Route =
  | { name: 'home' }
  | { name: 'review' }
  | { name: 'learn'; verseId: string }
  | { name: 'browse' }
  | { name: 'stats' }
  | { name: 'settings' }

export type RouteName = Route['name']

/** 하단 탭에 노출되는 경로 */
export const TABS: readonly { name: RouteName; label: string }[] = [
  { name: 'home', label: '홈' },
  { name: 'review', label: '복습' },
  { name: 'stats', label: '돌아보기' },
  { name: 'browse', label: '목록' },
  { name: 'settings', label: '설정' },
]

export function toHash(route: Route): string {
  return route.name === 'learn'
    ? `#/learn/${encodeURIComponent(route.verseId)}`
    : `#/${route.name}`
}

/** 알 수 없는 hash는 홈으로 — 잘못된 딥링크가 빈 화면이 되지 않게 한다 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [head = '', tail = ''] = path.split('/')
  switch (head) {
    case 'review':
      return { name: 'review' }
    case 'browse':
      return { name: 'browse' }
    case 'stats':
      return { name: 'stats' }
    case 'settings':
      return { name: 'settings' }
    case 'learn': {
      const verseId = decodeURIComponent(tail)
      return verseId === '' ? { name: 'home' } : { name: 'learn', verseId }
    }
    default:
      return { name: 'home' }
  }
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

const getHash = (): string => window.location.hash

/** 서버 렌더는 없지만 useSyncExternalStore가 요구하는 스냅샷 */
const getServerHash = (): string => ''

export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash)
  const navigate = useCallback((route: Route) => {
    const next = toHash(route)
    // 같은 경로를 다시 누르면 히스토리에 중복 항목을 쌓지 않는다
    if (window.location.hash === next) return
    window.location.hash = next
  }, [])
  return { route: parseHash(hash), navigate }
}
