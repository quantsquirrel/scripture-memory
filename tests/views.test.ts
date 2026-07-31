// 뷰 계층의 두 축을 직접 검증한다: hash 라우팅의 왕복과 저장소 리비전 알림.
// 둘 다 브라우저 없이 순수하게 확인할 수 있는 부분만 여기서 다룬다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bumpRevision, getRevision, notifying, subscribeRevision } from '../src/app/revision'
import { parseHash, type Route, TABS, toHash } from '../src/views/router'

describe('hash 라우팅', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'review' },
    { name: 'browse' },
    { name: 'stats' },
    { name: 'settings' },
    { name: 'learn', verseId: 'AS1a' },
  ]

  it('모든 경로가 hash로 왕복한다 (딥링크 가능)', () => {
    for (const route of routes) {
      expect(parseHash(toHash(route)), toHash(route)).toEqual(route)
    }
  })

  it('hash는 서버에 전달되지 않는 형태다 — 경로가 아니라 # 뒤에만 쓴다', () => {
    for (const route of routes) {
      expect(toHash(route).startsWith('#/')).toBe(true)
    }
  })

  it('구절 id를 인코딩해 특수문자가 섞여도 왕복한다', () => {
    const route: Route = { name: 'learn', verseId: 'T1-1a' }
    expect(parseHash(toHash(route))).toEqual(route)
  })

  it('빈 hash와 알 수 없는 hash는 홈으로 (잘못된 딥링크가 빈 화면이 되지 않게)', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/learn', '#/learn/', 'garbage']) {
      expect(parseHash(hash), hash).toEqual({ name: 'home' })
    }
  })

  it('하단 탭의 모든 경로가 파싱 가능하다', () => {
    for (const tab of TABS) {
      expect(parseHash(`#/${tab.name}`).name).toBe(tab.name)
    }
  })
})

describe('저장소 리비전 알림 (리마운트 대체)', () => {
  let unsubscribes: (() => void)[] = []

  beforeEach(() => {
    for (const off of unsubscribes) off()
    unsubscribes = []
  })

  it('구독자는 쓰기가 끝날 때마다 통보받고, 스냅샷은 단조 증가한다', () => {
    const seen: number[] = []
    unsubscribes.push(
      subscribeRevision(() => {
        seen.push(getRevision())
      }),
    )
    const before = getRevision()
    bumpRevision()
    bumpRevision()
    expect(seen).toHaveLength(2)
    expect(getRevision()).toBe(before + 2)
    expect(seen[0]).toBeLessThan(seen[1] ?? 0)
  })

  it('구독을 해지하면 더 통보받지 않는다', () => {
    const listener = vi.fn()
    const off = subscribeRevision(listener)
    bumpRevision()
    off()
    bumpRevision()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifying은 성공한 쓰기만 알린다', async () => {
    const listener = vi.fn()
    unsubscribes.push(subscribeRevision(listener))

    const ok = notifying(() => Promise.resolve('done'))
    await expect(ok()).resolves.toBe('done')
    expect(listener).toHaveBeenCalledTimes(1)

    const fails = notifying(() => Promise.reject(new Error('쓰기 실패')))
    await expect(fails()).rejects.toThrow('쓰기 실패')
    // 실패한 쓰기로 뷰를 새로 읽게 만들 이유가 없다
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('인자와 반환값을 그대로 통과시킨다', async () => {
    const wrapped = notifying((a: number, b: number) => Promise.resolve(a + b))
    await expect(wrapped(2, 3)).resolves.toBe(5)
  })
})
