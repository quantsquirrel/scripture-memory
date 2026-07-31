/**
 * 하드 경계 회귀 테스트.
 *
 * 이 파일의 목적은 기능 확인이 아니라 **미래의 리팩토링이 경계를 깨는 순간 즉시
 * 실패하는 것**이다. 그래서 구현 세부가 아니라 "우회 경로가 존재하지 않음"을 본다.
 * 일부는 소스를 읽어 export 표면을 검사한다 — 타입 수준 보장은 컴파일러가 이미
 * 지키지만, 누군가 export를 추가하면 컴파일은 통과하고 경계만 조용히 열리기 때문이다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MemoryStore } from '../src/adapters/memory'
import * as appIndex from '../src/app'
import { submitReview } from '../src/app/review'
import type { ReviewMode, StoredCard } from '../src/domain/card'
import { required } from '../src/domain/invariant'
import { reviewMode } from '../src/domain/policy'
import * as scheduler from '../src/domain/scheduler'
import { rateCard, type RatedCard } from '../src/domain/scheduler'
import * as ports from '../src/ports/repositories'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')

const NOW = new Date('2026-07-31T10:00:00.000Z')

const graduate = (store: MemoryStore) => store.graduate('AS1a', ['topic', 'ref', 'text'], NOW)

describe('경계 1 — 증거 없는 등급 적용 금지', () => {
  it('applyRating은 어느 모듈에서도 import할 수 없다 (domain 내부에만 존재)', () => {
    // 런타임 export 표면에 없다
    expect('applyRating' in scheduler).toBe(false)
    expect(Object.keys(scheduler)).not.toContain('applyRating')

    // 소스에도 export 키워드가 붙지 않았다 — 누가 export를 추가하면 이 단정이 깨진다
    const src = read('src/domain/scheduler.ts')
    expect(src).toMatch(/^function applyRating\(/m)
    expect(src).not.toMatch(/export\s+(async\s+)?function applyRating/)
    expect(src).not.toMatch(/export\s*\{[^}]*\bapplyRating\b/)
  })

  it('등급 적용의 유일한 진입점 rateCard는 증거를 필수 인자로 받는다', () => {
    // 인자 2개(카드, 증거)가 필수 — 증거를 빼면 컴파일되지 않는다
    expect(rateCard.length).toBeGreaterThanOrEqual(2)
    const src = read('src/domain/scheduler.ts')
    // applyRating을 부르는 곳은 rateCard 하나뿐이어야 한다 (선언 줄은 제외)
    const calls = src.match(/(?<!function )\bapplyRating\(/g) ?? []
    expect(calls).toHaveLength(1)
  })

  it('저장소 포트에 카드 상태를 직접 쓰는 메서드가 없다', () => {
    const src = read('src/ports/repositories.ts')
    // 카드 쓰기는 commitRating(RatedCard)뿐 — put/save/update류가 없어야 한다
    expect(src).toMatch(/commitRating\(rated: RatedCard\)/)
    const cardRepo = src.slice(
      src.indexOf('export interface CardRepository'),
      src.indexOf('export interface ReviewLog'),
    )
    for (const forbidden of ['put(', 'save(', 'update(', 'setCard(', 'writeCard(']) {
      expect(cardRepo, `CardRepository에 ${forbidden}가 생겼다`).not.toContain(forbidden)
    }
  })

  it('app 표면에 등급을 적용하는 함수는 submitReview 하나뿐이다', () => {
    const raters = Object.keys(appIndex).filter((k) => /rate|grade|applyRating/i.test(k))
    expect(raters).toEqual([])
    expect(typeof appIndex.submitReview).toBe('function')
  })

  it('커밋된 등급에는 반드시 같은 트랜잭션의 증거가 남는다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const card = required(await store.cards.get('AS1a:topic'))

    await submitReview(
      store,
      card,
      { mode: 'typing', rating: 2, accuracy: 0.9, peeks: null },
      NOW,
    )

    const reviews = await store.reviews.all()
    expect(reviews).toHaveLength(1)
    // 카드의 reps 증가 횟수와 증거 개수가 일치해야 한다
    const after = required(await store.cards.get('AS1a:topic'))
    expect(after.card.reps).toBe(card.card.reps + 1)
    expect(reviews).toHaveLength(after.card.reps - card.card.reps)
  })

  it('여러 번 채점해도 등급 수와 증거 수가 항상 같다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    let card = required(await store.cards.get('AS1a:ref'))
    const modes: ReviewMode[] = ['firstLetter', 'recite', 'typing', 'refInput', 'recite']

    for (const [i, mode] of modes.entries()) {
      card = await submitReview(
        store,
        card,
        { mode, rating: 3, accuracy: mode === 'typing' ? 1 : null, peeks: null },
        new Date(NOW.getTime() + i * 60_000),
      )
    }
    expect(card.card.reps).toBe(modes.length)
    expect(await store.reviews.count()).toBe(modes.length)
  })

  it('이중 캐스팅으로 위조한 RatedCard는 런타임에 거부된다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const card = required(await store.cards.get('AS1a:topic'))
    // 타입 브랜드는 `as unknown as`로 우회할 수 있다 — 런타임 검증이 마지막 방어선
    const forged = {
      card: { ...card, card: { ...card.card, reps: 999 } },
    } as unknown as RatedCard
    await expect(store.cards.commitRating(forged)).rejects.toThrow(/rateCard/)
    // 카드가 바뀌지 않았고 증거도 생기지 않았다
    expect(required(await store.cards.get('AS1a:topic')).card.reps).toBe(card.card.reps)
    expect(await store.reviews.count()).toBe(0)
  })

  it('증거가 비어 있으면 커밋을 거부한다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const card = required(await store.cards.get('AS1a:topic'))
    const real = rateCard(card, { mode: 'typing', rating: 3, accuracy: 1, peeks: null })
    const gutted = { ...real, entry: {} } as unknown as RatedCard
    await expect(store.cards.commitRating(gutted)).rejects.toThrow(/증거/)
    expect(await store.reviews.count()).toBe(0)
  })

  it('커밋은 증거를 먼저 쓴다 (두 번째 쓰기 실패 시 카드가 남지 않게)', () => {
    const src = read('src/adapters/indexeddb.ts')
    const body = src.slice(src.indexOf('async commitRating'))
    const reviewsAt = body.indexOf("objectStore('reviews')")
    const cardsAt = body.indexOf("objectStore('cards')")
    expect(reviewsAt).toBeGreaterThanOrEqual(0)
    expect(cardsAt).toBeGreaterThanOrEqual(0)
    expect(reviewsAt, '증거 쓰기가 카드 쓰기보다 앞에 있어야 한다').toBeLessThan(cardsAt)
  })

  it('RatedCard는 도메인 밖에서 위조할 수 없다 (브랜드 심볼 미공개)', () => {
    const src = read('src/domain/scheduler.ts')
    // 브랜드 심볼이 export되면 다른 모듈이 RatedCard를 만들 수 있게 된다
    expect(src).toMatch(/const RATED = Symbol\(/)
    expect(src).not.toMatch(/export const RATED/)
    expect('RATED' in scheduler).toBe(false)
  })
})

describe('경계 2 — 자가 채점은 감사와 함께만', () => {
  it('연속 5회 창에 반드시 객관 모드가 하나 이상 낀다 (모든 방향·모든 시작점)', () => {
    for (const dir of ['topic', 'ref', 'text'] as const) {
      for (let start = 0; start <= 500; start++) {
        const window = [0, 1, 2, 3, 4].map((i) => reviewMode(dir, start + i))
        expect(
          window.some((m) => m !== 'recite'),
          `${dir} reps ${start}~${start + 4}가 전부 recite`,
        ).toBe(true)
      }
    }
  })

  it('자가 채점만으로 5회를 넘길 수 없다 — 실제 채점 루프로 확인', async () => {
    const store = new MemoryStore()
    await graduate(store)
    let card = required(await store.cards.get('AS1a:topic'))
    const used: ReviewMode[] = []

    // 정책이 정하는 모드로만 30회 복습한다 (뷰가 모드를 고르지 않는다)
    for (let i = 0; i < 30; i++) {
      const mode = reviewMode(card.direction, card.card.reps)
      used.push(mode)
      card = await submitReview(
        store,
        card,
        {
          mode,
          rating: 3,
          accuracy: mode === 'typing' ? 1 : mode === 'refInput' ? 1 : null,
          peeks: mode === 'firstLetter' ? 0 : null,
        },
        new Date(NOW.getTime() + i * 86400_000),
      )
    }

    // 어떤 연속 5회 구간에도 recite만 있는 구간이 없다
    for (let i = 0; i + 5 <= used.length; i++) {
      expect(
        used.slice(i, i + 5).some((m) => m !== 'recite'),
        `구간 ${i}`,
      ).toBe(true)
    }
    // 타이핑 감사가 실제로 끼었다
    expect(used.filter((m) => m === 'typing').length).toBeGreaterThan(0)
  })

  it('말씀→장절 방향은 언제나 객관 채점(장절 입력)이다', () => {
    for (const reps of [0, 1, 2, 3, 4, 5, 50, 500]) {
      expect(reviewMode('text', reps)).toBe('refInput')
    }
  })

  it('감사 주기가 정책에 상수로 남아 있다 (제거되면 실패)', () => {
    const src = read('src/domain/policy.ts')
    expect(src).toMatch(/% 5 === 0/)
    expect(src).toMatch(/< 3/)
  })

  /**
   * 독립 감사가 찾아낸 실제 구멍의 회귀 테스트.
   * reps가 소수(5.5)면 `(reps + 1) % 5 === 0`이 영원히 거짓이 되어 타이핑 감사가
   * 한 번도 끼지 않았다. reps는 백업 가져오기·Gist 병합으로 외부에서 들어오는
   * 영속 값이므로 실제로 도달 가능한 경로였다.
   */
  it('소수·비정상 reps에서도 5회 창에 객관 모드가 낀다', () => {
    const starts = [0.5, 2.5, 3.1, 4.9, 5.5, 9.999, 100.25, -1, -0.5, Number.EPSILON]
    for (const dir of ['topic', 'ref'] as const) {
      for (const start of starts) {
        const window = [0, 1, 2, 3, 4].map((i) => reviewMode(dir, start + i))
        expect(
          window.some((m) => m !== 'recite'),
          `${dir} reps ${String(start)}부터 5회가 전부 recite`,
        ).toBe(true)
      }
      // NaN·Infinity도 자가 채점 무한 루프로 빠지지 않는다
      for (const weird of [Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(reviewMode(dir, weird)).not.toBe('recite')
      }
    }
  })

  it('가져오기가 소수 reps를 아예 받지 않는다 (근본 차단)', async () => {
    const store = new MemoryStore()
    const bundle = {
      app: 'scripture-memory',
      version: 2,
      exportedAt: '2026-07-31T00:00:00.000Z',
      cards: [
        {
          key: 'AS1a:topic',
          verseId: 'AS1a',
          direction: 'topic',
          card: {
            due: '2026-08-01T00:00:00.000Z',
            stability: 5,
            difficulty: 5,
            elapsed_days: 1,
            scheduled_days: 2,
            reps: 5.5,
            lapses: 0,
            learning_steps: 0,
            state: 2,
          },
        },
      ],
      reviews: [],
      learning: [],
    }
    await expect(store.importAll(bundle)).rejects.toThrow(/정수/)
    // 음수 횟수도 거부한다
    const negative = structuredClone(bundle)
    const firstCard = required(negative.cards[0])
    firstCard.card.reps = -3
    await expect(store.importAll(negative)).rejects.toThrow(/정수/)
  })

  it('recite만 accuracy·peeks 둘 다 null로 남을 수 있다', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const card = required(await store.cards.get('AS1a:topic'))
    await submitReview(
      store,
      card,
      { mode: 'recite', rating: 3, accuracy: null, peeks: null },
      NOW,
    )
    const entry = required((await store.reviews.all())[0])
    expect(entry.mode).toBe('recite')
    expect(entry.accuracy).toBeNull()
    expect(entry.peeks).toBeNull()
  })
})

describe('경계 3 — 기존 사용자 데이터 생존', () => {
  it('골든 v1 fixture는 수정되지 않았다 (과거 사용자 데이터의 대역)', () => {
    const v1: unknown = JSON.parse(read('tests/fixtures/export-v1.json'))
    expect(v1).toMatchObject({ app: 'scripture-memory', version: 1 })
    const b = v1 as { learning: { step: unknown }[]; cards: unknown[]; reviews: unknown[] }
    // v1은 숫자 step이어야 한다 — 문자열로 바뀌었다면 fixture가 수정된 것이다
    for (const l of b.learning) expect(typeof l.step).toBe('number')
    expect(b.cards).toHaveLength(3)
    expect(b.reviews).toHaveLength(4)
  })

  it('스키마 버전이 올라가면 import가 두 버전을 모두 받아야 한다', () => {
    expect(ports.SCHEMA_VERSION).toBe(2)
    const src = read('src/adapters/bundle.ts')
    // v1과 현재 버전을 모두 수용하는 분기가 남아 있어야 한다
    expect(src).toMatch(/version !== 1 && version !== SCHEMA_VERSION/)
  })

  it('import는 검증을 먼저 끝내고 나서 저장소를 비운다', () => {
    for (const rel of ['src/adapters/indexeddb.ts', 'src/adapters/memory.ts']) {
      const src = read(rel)
      const body = src.slice(src.indexOf('importAll('))
      const decodeAt = body.indexOf('decodeBundle(')
      const clearAt = Math.min(
        ...[body.indexOf('.clear()'), body.indexOf('cardRows = new Map')].filter((i) => i >= 0),
      )
      expect(decodeAt, rel).toBeGreaterThanOrEqual(0)
      expect(
        decodeAt,
        `${rel}: 저장소를 비운 뒤 검증하면 실패 시 데이터가 사라진다`,
      ).toBeLessThan(clearAt)
    }
  })
})

describe('경계 4 — 오프라인 완결', () => {
  it('domain과 app 계층에 네트워크 호출이 없다', () => {
    for (const rel of [
      'src/domain/scheduler.ts',
      'src/domain/ladder.ts',
      'src/domain/policy.ts',
      'src/domain/grading.ts',
      'src/domain/stats.ts',
      'src/domain/goal.ts',
      'src/app/review.ts',
      'src/app/queries.ts',
      'src/app/settings.ts',
      'src/adapters/indexeddb.ts',
      'src/adapters/memory.ts',
    ]) {
      const src = read(rel)
      for (const net of [
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'navigator.onLine',
      ]) {
        expect(src, `${rel}에 ${net}가 생겼다`).not.toContain(net)
      }
    }
  })

  it('네트워크는 Gist 어댑터에만 있고, 그것은 선택 기능이다', () => {
    const gist = read('src/adapters/gist.ts')
    expect(gist).toContain('fetch(')
    // 핵심 경로는 Gist 어댑터를 정적으로 import하지 않는다.
    // app/index.ts를 반드시 포함한다 — 이 파일이 gist를 정적으로 끌고 있어서
    // 네트워크 코드가 메인 번들에 섞여 들어갔던 것을 독립 감사가 찾아냈다.
    for (const rel of [
      'src/app/index.ts',
      'src/app/review.ts',
      'src/app/queries.ts',
      'src/app/settings.ts',
      'src/app/revision.ts',
      'src/views/hooks.ts',
      'src/views/App.tsx',
      'src/views/Review.tsx',
      'src/views/Learn.tsx',
    ]) {
      expect(read(rel), `${rel}가 gist를 정적으로 import한다`).not.toMatch(
        /^import .*adapters\/gist/m,
      )
    }
    // 유일한 연결점은 동적 import여서 별도 청크로 갈라진다
    const sync = read('src/app/sync.ts')
    expect(sync).toMatch(/await import\('\.\.\/adapters\/gist'\)/)
  })

  it('학습·복습·export 전 과정이 저장소만으로 끝난다 (네트워크 어댑터 없이)', async () => {
    const store = new MemoryStore()
    await graduate(store)
    const card = required(await store.cards.get('AS1a:topic'))
    const rated = await submitReview(
      store,
      card,
      { mode: 'recite', rating: 3, accuracy: null, peeks: null },
      NOW,
    )
    expect(rated.card.reps).toBe(card.card.reps + 1)
    const bundle = await store.exportAll(NOW)
    expect(bundle.cards).toHaveLength(3)
    expect(bundle.reviews).toHaveLength(1)
    expect(bundle.learning).toHaveLength(1)
    // 왕복도 가능
    const other = new MemoryStore()
    await other.importAll(bundle)
    expect((await other.cards.all()).map((c) => c.key).sort()).toEqual(
      bundle.cards.map((c: StoredCard) => c.key).sort(),
    )
  })
})
