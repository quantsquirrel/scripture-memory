// 뷰 계층의 두 축을 직접 검증한다: hash 라우팅의 왕복과 저장소 리비전 알림.
// 둘 다 브라우저 없이 순수하게 확인할 수 있는 부분만 여기서 다룬다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bumpRevision, getRevision, notifying, subscribeRevision } from '../src/app/revision'
import { computeGoal } from '../src/domain/goal'
import { advance } from '../src/domain/ladder'
import { resumeLabel } from '../src/views/Home'
import { paceNote } from '../src/views/home/panels'
import {
  type AttemptEvent,
  type FirstLetterAttempt,
  FRESH_ATTEMPT,
  nextAttempt,
  RESUMED_ATTEMPT,
} from '../src/views/learn/attempt'
import { parseHash, type Route, TABS, toHash } from '../src/views/router'
import { installHint } from '../src/views/usePwaInstall'

describe('hash 라우팅', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'review' },
    { name: 'browse' },
    { name: 'settings' },
    { name: 'recalibrate' },
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

  it('없어진 묵상·돌아보기 링크는 홈으로 간다 (저장해 둔 링크가 빈 화면이 되지 않게)', () => {
    expect(parseHash('#/meditate')).toEqual({ name: 'home' })
    expect(parseHash('#/stats')).toEqual({ name: 'home' })
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

describe('홈 화면 설치 안내', () => {
  const base = { standalone: false, ios: false, canPrompt: false, dismissed: false }

  it('설치 이벤트가 있으면 버튼, iOS면 공유 메뉴 안내, 둘 다 아니면 없다', () => {
    expect(installHint({ ...base, canPrompt: true })).toBe('prompt')
    expect(installHint({ ...base, ios: true })).toBe('ios')
    expect(installHint(base)).toBeNull()
  })

  it('이미 설치했거나 닫았으면 보이지 않는다', () => {
    expect(installHint({ ...base, canPrompt: true, standalone: true })).toBeNull()
    expect(installHint({ ...base, ios: true, dismissed: true })).toBeNull()
  })
})

describe('홈 이어서 문구 (resumeLabel)', () => {
  it('진행 중 구절이 하나면 그 구절과 단계만', () => {
    expect(resumeLabel('롬3:23', 'firstLetter', 0)).toBe('롬3:23 (단계 2/4)')
  })

  it('다른 진행 중 구절이 남았으면 남은 수를 붙인다', () => {
    expect(resumeLabel('롬3:23', 'firstLetter', 4)).toBe('롬3:23 (단계 2/4) · 외 4구절')
  })
})

describe('홈 목표 보조 문구 (paceNote)', () => {
  it('기본 정착 기간(0일)에서는 복습 굳히기 문구를 숨긴다', () => {
    const g = computeGoal('2026-11-22', [], new Date('2026-11-13T12:00:00+09:00'))
    expect(paceNote(g, '11/22')).toBeNull()
  })

  it('목표일이 지났으면 기한 없는 시기 문구를 돌려준다', () => {
    const g = computeGoal('2026-08-26', [], new Date('2026-11-13T12:00:00+09:00'))
    expect(paceNote(g, '8/26')).toBe('기한 없이 새기는 시기, 마음에 오래 남는 속도로')
  })

  it('정착 기간을 켰고 마감 전이면 마감일 안내를 보여준다', () => {
    const g = computeGoal('2026-11-22', [], new Date('2026-11-13T12:00:00+09:00'), 7)
    expect(paceNote(g, '11/15')).toBe('새 구절은 11/15까지, 마지막 7일은 복습으로 굳히기')
  })

  it('정착 기간을 켰고 마감 당일(11/15)까지도 마감일 안내를 유지한다', () => {
    const g = computeGoal('2026-11-22', [], new Date('2026-11-15T20:00:00+09:00'), 7)
    expect(paceNote(g, '11/15')).toBe('새 구절은 11/15까지, 마지막 7일은 복습으로 굳히기')
  })

  it('정착 기간 안에 들어오면 마감이 지났음을 알린다', () => {
    const g = computeGoal('2026-11-22', [], new Date('2026-11-16T09:00:00+09:00'), 7)
    expect(paceNote(g, '11/15')).toBe(
      '새 구절 마감(11/15)이 지나 마지막 7일 복습 정착 기간입니다',
    )
  })

  it('목표 범위를 다 외웠으면 정착 기간이 있어도 마감 문구를 숨긴다', () => {
    const g = computeGoal('2026-11-22', [], new Date('2026-11-13T12:00:00+09:00'), 7)
    expect(paceNote({ ...g, remaining: 0 }, '11/15')).toBeNull()
  })
})

describe('첫글자 단계의 본문 다시 보기 (화면 상태)', () => {
  const run = (...events: AttemptEvent[]): FirstLetterAttempt =>
    events.reduce(nextAttempt, FRESH_ATTEMPT)
  const peek: AttemptEvent = { type: 'peek' }
  /** '낭송 완료'가 사다리에 싣는 판정 — Learn.tsx의 onDone과 같은 명령 */
  const judge = (s: FirstLetterAttempt) =>
    advance({ step: 'firstLetter', event: 'attempted', peeks: s.peeks })

  it('엿보기 3회로 실패한 뒤 본문을 보고 가리면 엿보기 0회의 새 보드, 실패 안내 없음', () => {
    const failed = run(peek, peek, peek, { type: 'failed', peeks: 3 })
    expect(failed.failedPeeks).toBe(3)

    const reading = nextAttempt(failed, { type: 'reread' })
    expect(reading.reading).toBe(true)

    const covered = nextAttempt(reading, { type: 'restart' })
    expect(covered).toEqual({
      peeks: 0,
      board: failed.board + 1,
      failedPeeks: null,
      reading: false,
    })
  })

  it('본문을 본 시도의 엿보기는 통과 판정에 실리지 않는다', () => {
    // 본문을 보기 전 2회 + 가린 뒤 1회 — 합치면 3회라 실패지만, 판정에는 새 시도의 1회만 실린다
    const s = run(peek, peek, { type: 'reread' }, { type: 'restart' }, peek)
    expect(s.peeks).toBe(1)
    expect(judge(s)).toEqual({ kind: 'move', step: 'typing' })
    expect(judge(run(peek, peek, peek))).toMatchObject({
      kind: 'stay',
      reason: 'peeksExceeded',
    })
  })

  it('저장된 단계로 다시 들어오면 본문부터, 1단계에서 넘어오면 보드부터 연다', () => {
    expect(RESUMED_ATTEMPT).toMatchObject({ reading: true, peeks: 0, failedPeeks: null })
    // Learn.tsx의 1단계 '낭송했어요'는 restart를 먼저 보낸다
    expect(nextAttempt(RESUMED_ATTEMPT, { type: 'restart' }).reading).toBe(false)
    // 다시 들어와 본문을 읽은 뒤 가리면 엿보기 0회부터 센다
    const s = [peek, peek, peek].reduce(
      nextAttempt,
      nextAttempt(RESUMED_ATTEMPT, { type: 'restart' }),
    )
    expect(judge(s)).toMatchObject({ kind: 'stay', reason: 'peeksExceeded' })
  })

  it('다시 시도도 같은 초기화다 — 보드 열쇠가 매번 바뀌어 모든 어절을 다시 가린다', () => {
    const once = run(peek, { type: 'restart' })
    const twice = nextAttempt(nextAttempt(once, peek), { type: 'restart' })
    expect(once).toEqual({ ...FRESH_ATTEMPT, board: 1 })
    expect(twice).toEqual({ ...FRESH_ATTEMPT, board: 2 })
  })
})
