/**
 * 저장소 변경 알림.
 *
 * 이전에는 App.tsx가 epoch를 올려 `<main key={epoch}>`로 뷰 전체를 강제
 * 리마운트해 데이터를 새로 읽었다. 리마운트는 스크롤 위치, 입력 중인 텍스트,
 * 펼쳐 둔 목록, 진행 중인 채점 상태를 전부 버린다.
 *
 * 대신 쓰기가 끝날 때마다 리비전을 올리고, 뷰는 useSyncExternalStore로 그
 * 숫자만 구독한다. 리비전이 바뀐 뷰는 데이터를 다시 읽지만 컴포넌트 상태는
 * 유지된다. 외부 상태관리 라이브러리는 쓰지 않는다.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let revision = 0

export function subscribeRevision(onChange: Listener): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** useSyncExternalStore의 getSnapshot — 같은 값이면 리렌더가 일어나지 않는다 */
export function getRevision(): number {
  return revision
}

/** 저장소에 쓰기가 끝난 뒤 호출. 구독 중인 뷰가 데이터를 다시 읽는다. */
export function bumpRevision(): void {
  revision++
  for (const listener of listeners) listener()
}

/**
 * 쓰기 함수를 감싸 성공 시에만 리비전을 올린다.
 * 실패한 쓰기로 뷰를 새로 읽게 만들 이유가 없다.
 */
export function notifying<A extends unknown[], R>(
  write: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const result = await write(...args)
    bumpRevision()
    return result
  }
}
