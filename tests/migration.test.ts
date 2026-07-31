// 가드레일: IndexedDB v1 → v2 업그레이드에서 기존 사용자 데이터가 살아남아야 한다.
// v2가 바꾸는 것: (a) 인덱스 추가, (b) learning.step 숫자 → 사다리 단계 문자열.
// 이 테스트는 v1 스키마를 직접 만들어 데이터를 심고, 실제 upgrade 콜백을 통과시킨 뒤
// 값과 인덱스 쿼리를 확인한다 — 마이그레이션을 흉내내지 않고 실제로 돌린다.
import 'fake-indexeddb/auto'

import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { closeConnection, openTmsDb } from '../src/adapters/indexeddb'
import type { StoredCard } from '../src/domain/card'
import { required } from '../src/domain/invariant'
import { State } from '../src/domain/scheduler'

const NOW = new Date('2026-07-31T10:00:00.000Z')

/** v1 시절의 카드 모양 (인덱스 없음) */
const v1Card = (key: string, due: string, state: State): StoredCard => {
  const [verseId = '', dir = 'ref'] = key.split(':')
  return {
    key,
    verseId,
    direction: dir === 'topic' ? 'topic' : dir === 'text' ? 'text' : 'ref',
    card: {
      due,
      stability: 3.5,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 2,
      reps: 4,
      lapses: 1,
      learning_steps: 0,
      state,
      last_review: '2026-07-29T10:00:00.000Z',
    },
  }
}

/**
 * v1 스키마 그대로 DB를 만들고 데이터를 심는다.
 * (인덱스 없음, learning.step은 숫자 — 과거 버전이 실제로 저장한 모양)
 */
function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => {
      resolve()
    }
    req.onerror = () => {
      reject(new Error('deleteDatabase 실패'))
    }
    req.onblocked = () => {
      reject(new Error('deleteDatabase가 열린 연결에 막혔습니다'))
    }
  })
}

async function seedV1(): Promise<void> {
  await closeConnection()
  await deleteDb('tms-krv')
  const d = await openDB('tms-krv', 1, {
    upgrade(db) {
      db.createObjectStore('cards', { keyPath: 'key' })
      db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true })
      db.createObjectStore('learning', { keyPath: 'verseId' })
      db.createObjectStore('settings', { keyPath: 'key' })
    },
  })
  const tx = d.transaction(['cards', 'reviews', 'learning', 'settings'], 'readwrite')
  const cards = tx.objectStore('cards')
  await cards.put(v1Card('AS1a:topic', '2026-07-30T00:00:00.000Z', State.Review))
  await cards.put(v1Card('AS1a:ref', '2026-07-31T09:00:00.000Z', State.Learning))
  await cards.put(v1Card('AS1a:text', '2026-08-20T00:00:00.000Z', State.Review))
  await cards.put(v1Card('AS2a:topic', '2026-07-31T09:05:00.000Z', State.Relearning))
  const reviews = tx.objectStore('reviews')
  for (const ts of [
    '2026-07-20T01:00:00.000Z',
    '2026-07-29T01:00:00.000Z',
    '2026-07-31T01:00:00.000Z',
  ]) {
    await reviews.add({
      cardKey: 'AS1a:topic',
      verseId: 'AS1a',
      direction: 'topic',
      mode: 'recite',
      rating: 3,
      accuracy: null,
      peeks: null,
      ts,
    })
  }
  const learning = tx.objectStore('learning')
  // v1의 숫자 단계 — 0 소개, 1 첫글자, 2 타이핑, 3 졸업
  await learning.put({ verseId: 'AS1a', step: 3, updatedAt: '2026-07-14T12:30:00.000Z' })
  await learning.put({ verseId: 'AS2a', step: 2, updatedAt: '2026-07-28T12:30:00.000Z' })
  await learning.put({ verseId: 'AS3a', step: 0, updatedAt: '2026-07-30T12:30:00.000Z' })
  await tx.objectStore('settings').put({ key: 'goalDate', value: '2026-09-01' })
  await tx.done
  d.close()
}

describe('IndexedDB v1 → v2 마이그레이션', () => {
  beforeEach(async () => {
    await seedV1()
  })

  it('버전이 2로 올라가고 카드·복습·설정이 그대로 남는다', async () => {
    const d = await openTmsDb()
    expect(d.version).toBe(2)
    expect(await d.count('cards')).toBe(4)
    expect(await d.count('reviews')).toBe(3)
    expect(await d.count('learning')).toBe(3)
    const card = required(await d.get('cards', 'AS1a:topic'))
    // FSRS 상태의 모든 필드가 보존되어야 한다 (초기화되면 사용자 진도 손실)
    expect(card.card.reps).toBe(4)
    expect(card.card.lapses).toBe(1)
    expect(card.card.stability).toBe(3.5)
    expect(card.card.last_review).toBe('2026-07-29T10:00:00.000Z')
    expect((await d.get('settings', 'goalDate'))?.value).toBe('2026-09-01')
  })

  it('learning.step 숫자가 사다리 단계 문자열로 변환된다', async () => {
    const d = await openTmsDb()
    const steps = Object.fromEntries(
      (await d.getAll('learning')).map((l) => [l.verseId, l.step]),
    )
    expect(steps).toEqual({ AS1a: 'graduated', AS2a: 'typing', AS3a: 'intro' })
  })

  it('새 인덱스가 만들어지고 기존 레코드가 이미 색인되어 있다', async () => {
    const d = await openTmsDb()
    expect([...d.transaction('cards').store.indexNames].sort()).toEqual([
      'due',
      'state_due',
      'verseId',
    ])
    expect([...d.transaction('reviews').store.indexNames].sort()).toEqual(['cardKey', 'ts'])
    // 인덱스는 업그레이드 시 기존 레코드에서 자동으로 채워진다
    expect(await d.countFromIndex('cards', 'verseId', 'AS1a')).toBe(3)
    expect(await d.countFromIndex('reviews', 'cardKey', 'AS1a:topic')).toBe(3)
  })

  it('마이그레이션 후 인덱스 범위 쿼리가 v1 전수 필터와 같은 답을 준다', async () => {
    const d = await openTmsDb()
    const all = await d.getAll('cards')
    const iso = NOW.toISOString()

    // dueCards: 인덱스 범위 vs JS 필터
    const viaIndex = await d.getAllFromIndex('cards', 'due', IDBKeyRange.upperBound(iso))
    const viaScan = all
      .filter((c) => c.card.due <= iso)
      .sort((a, b) => (a.card.due < b.card.due ? -1 : 1))
    expect(viaIndex.map((c) => c.key)).toEqual(viaScan.map((c) => c.key))
    expect(viaIndex).toHaveLength(3)

    // learn-ahead: [state, due] 복합 인덱스 vs JS 필터
    const horizon = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const index = d.transaction('cards').store.index('state_due')
    const viaCompound: string[] = []
    for (const state of [State.Learning, State.Relearning]) {
      for (const c of await index.getAll(IDBKeyRange.bound([state, ''], [state, horizon]))) {
        viaCompound.push(c.key)
      }
    }
    const scanAhead = all
      .filter(
        (c) =>
          (c.card.state === State.Learning || c.card.state === State.Relearning) &&
          c.card.due <= horizon,
      )
      .map((c) => c.key)
    expect(viaCompound.sort()).toEqual(scanAhead.sort())
    expect(viaCompound).toHaveLength(2)

    // reviewsSince: ts 인덱스 하한 vs JS 필터
    const since = '2026-07-29T00:00:00.000Z'
    const viaTs = await d.getAllFromIndex('reviews', 'ts', IDBKeyRange.lowerBound(since))
    expect(viaTs.map((r) => r.ts)).toEqual(
      (await d.getAll('reviews')).filter((r) => r.ts >= since).map((r) => r.ts),
    )
    expect(viaTs).toHaveLength(2)
  })

  it('두 번 열어도 마이그레이션이 반복되지 않는다 (멱등)', async () => {
    const first = await openTmsDb()
    const before = await first.getAll('learning')
    await closeConnection()
    const second = await openTmsDb()
    expect(await second.getAll('learning')).toStrictEqual(before)
    expect(second.version).toBe(2)
  })
})
