import { expect, type Page, test } from '@playwright/test'

/**
 * 말씀 상태 개정(Recalibrate) E2E 회귀 테스트.
 * - 빈 상태 안내 및 180구절(T1~T5) 포함한 20개 파트 표시
 * - 홈 밀린 카드 배너(30장 이상) → 개정 세션 → 각 상태별 분기(정상/기한 전/객관 감사/사다리 복귀)
 * - 완료 화면 정직한 집계 & 다음 파트 이어가기
 * - 키보드 단축키(Space/1/2/3) 및 버튼 포커스 Space 비간섭
 * - 44×44px 터치 타깃 & 320px 좁은 폭 오버플로 없음
 */
const BASE = '/scripture-memory/'

interface SeedVerse {
  id: string
  reps: number
  dueDays: number
}

async function seedGraduatedVerses(page: Page, verses: SeedVerse[]): Promise<void> {
  await page.evaluate(async (items) => {
    const db = await new Promise<IDBDatabase>((ok, no) => {
      const r = indexedDB.open('tms-krv')
      r.onsuccess = () => {
        ok(r.result)
      }
      r.onerror = () => {
        no(r.error ?? new Error('IDB open failed'))
      }
    })
    const now = Date.now()
    const day = 86_400_000
    const tx = db.transaction(['cards', 'learning', 'reviews'], 'readwrite')
    for (const v of items) {
      tx.objectStore('learning').put({
        verseId: v.id,
        step: 'graduated',
        updatedAt: new Date(now - 60 * day).toISOString(),
      })
      for (const dir of ['topic', 'ref', 'text']) {
        tx.objectStore('cards').put({
          key: `${v.id}:${dir}`,
          verseId: v.id,
          direction: dir,
          card: {
            due: new Date(now + v.dueDays * day).toISOString(),
            stability: 10,
            difficulty: 5,
            elapsed_days: 10,
            scheduled_days: 10,
            reps: v.reps,
            lapses: 0,
            learning_steps: 0,
            state: v.reps === 0 ? 0 : 2,
            ...(v.reps > 0 ? { last_review: new Date(now - 15 * day).toISOString() } : {}),
          },
        })
      }
    }
    await new Promise<void>((ok, no) => {
      tx.oncomplete = () => {
        ok()
      }
      tx.onerror = () => {
        no(tx.error ?? new Error('IDB tx failed'))
      }
    })
    db.close()
  }, verses)
}

async function dumpCardsAndLearning(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok, no) => {
      const r = indexedDB.open('tms-krv')
      r.onsuccess = () => {
        ok(r.result)
      }
      r.onerror = () => {
        no(r.error ?? new Error('IDB open failed'))
      }
    })
    const tx = db.transaction(['cards', 'learning'], 'readonly')
    const all = <T>(store: IDBObjectStore) =>
      new Promise<T[]>((ok, no) => {
        const r = store.getAll()
        r.onsuccess = () => {
          ok(r.result as T[])
        }
        r.onerror = () => {
          no(r.error ?? new Error('IDB getAll failed'))
        }
      })
    const [cards, learning] = await Promise.all([
      all<{
        key: string
        verseId: string
        direction: string
        card: { reps: number; state: number; due: string }
      }>(tx.objectStore('cards')),
      all<{ verseId: string; step: string }>(tx.objectStore('learning')),
    ])
    db.close()
    return { cards, learning }
  })
}

test.describe('말씀 상태 개정', () => {
  test('졸업한 구절이 없으면 안내와 함께 20개 파트(180구절 포함)를 비활성으로 보여 준다', async ({
    page,
  }) => {
    await page.goto(`${BASE}#/recalibrate`)
    await expect(page.getByText(/아직 졸업한 구절이 없습니다/)).toBeVisible()
    await expect(page.locator('.recal-unit')).toHaveCount(20)
    await expect(
      page.getByRole('button', { name: /180구절 1\. 하나님을 알아감/ }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: /180구절 5\. 그리스도를 증거함/ }),
    ).toBeDisabled()
  })

  test('홈 배너 → 파트 선택 → 구절별 상태 분기(정상/기한전/객관감사/강등) → 완료 집계 → 180구절 이어가기', async ({
    page,
  }) => {
    await page.goto(BASE)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()

    // 11개 구절 = 카드 33장 (AS due 27장? 아니 AS 4개*3+미래1개*3=due 12장 + T1 6개*3=due 18장 => 총 due 30장)
    await seedGraduatedVerses(page, [
      { id: 'AS1a', reps: 3, dueDays: -5 }, // recite due -> solid
      { id: 'AS2a', reps: 3, dueDays: 10 }, // recite future -> solid (일정 유지!)
      { id: 'AS3a', reps: 4, dueDays: -5 }, // typing auditOnly -> 1 남기기
      { id: 'AS4a', reps: 3, dueDays: -5 }, // recite due -> shaky
      { id: 'AS5a', reps: 3, dueDays: -5 }, // recite due -> forgotten
      { id: 'T1-1a', reps: 3, dueDays: -5 },
      { id: 'T1-1b', reps: 3, dueDays: -5 },
      { id: 'T1-2a', reps: 3, dueDays: -5 },
      { id: 'T1-2b', reps: 3, dueDays: -5 },
      { id: 'T1-3a', reps: 3, dueDays: -5 },
      { id: 'T1-3b', reps: 3, dueDays: -5 },
    ])
    await page.reload()

    // 밀린 카드 30장 이상 -> 홈 배너 노출 → 클릭해 진입
    const banner = page.locator('.notice-row')
    await expect(banner).toContainText('말씀 상태 개정 모드')
    await banner.click()

    await expect(page.getByRole('button', { name: /그리스도인의 확신/ })).toContainText(
      '5구절, 밀린 카드 12장',
    )
    await expect(
      page.getByRole('button', { name: /180구절 1\. 하나님을 알아감/ }),
    ).toContainText('6구절, 밀린 카드 18장')

    // AS 진입
    await page.getByRole('button', { name: /그리스도인의 확신/ }).click()

    // AS1a (due, recite) -> 1 온전히 기억남
    await expect(page.locator('.card-code')).toHaveText('AS-1')
    await page.getByRole('button', { name: /본문 확인/ }).click()
    // 터치 타깃 44px 이상 확인
    for (const btn of await page.locator('.recal-verdicts .btn').all()) {
      const box = await btn.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(43.5)
    }
    await page.locator('.recal-solid').click()

    // AS2a (future, recite) -> 기한 전 안내 확인 + 온전히 기억남
    await expect(page.locator('.card-code')).toHaveText('AS-2')
    await page.getByRole('button', { name: /본문 확인/ }).click()
    await expect(page.getByText(/아직 복습 기한 전입니다/)).toBeVisible()
    await page.locator('.recal-solid').click()

    // AS3a (auditOnly, reps=4) -> 객관 채점 차례 안내 + 2번 키 무반응 + 남기고 넘어가기
    await expect(page.locator('.card-code')).toHaveText('AS-3')
    await expect(page.locator('.mode-tag')).toContainText('객관 채점 차례')
    await page.getByRole('button', { name: /본문 확인/ }).click()
    await expect(page.getByRole('button', { name: /복습 큐에 남기고 넘어가기/ })).toBeVisible()
    await expect(page.locator('.recal-shaky')).toHaveCount(0)
    await page.keyboard.press('2')
    await expect(page.locator('.card-code')).toHaveText('AS-3')
    await page.keyboard.press('1')

    // AS4a (due, recite) -> 가물가물함(단축키 2)
    await expect(page.locator('.card-code')).toHaveText('AS-4')
    await page.keyboard.press('Space')
    await page.keyboard.press('2')

    // AS5a (due, recite) -> 다시 사다리 타기(단축키 3)
    await expect(page.locator('.card-code')).toHaveText('AS-5')
    await page.keyboard.press('Space')
    await page.keyboard.press('3')

    // 완료 화면: 정확한 집계 확인 (정상화 1, 단기 복습 큐 1, 사다리 복귀 1 + 유보 1 + 기한 유지 1)
    await expect(
      page.getByRole('heading', { name: '그리스도인의 확신 개정 완료' }),
    ).toBeVisible()
    await expect(page.locator('.tally-solid dd')).toHaveText('1구절')
    await expect(page.locator('.tally-shaky dd')).toHaveText('1구절')
    await expect(page.locator('.tally-forgotten dd')).toHaveText('1구절')
    await expect(page.getByText(/객관 채점 차례.*1구절은 자가 판정을 유보/)).toBeVisible()
    await expect(
      page.getByText(/아직 복습 기한이 남은 1구절은 기존 일정을 그대로 유지/),
    ).toBeVisible()
    await expect(page.getByText(/말씀→장절 카드와 감사 차례 카드 2장은/)).toBeVisible()

    // DB 검증
    const db = await dumpCardsAndLearning(page)
    const as2Topic = db.cards.find((c) => c.key === 'AS2a:topic')
    expect(as2Topic?.card.reps).toBe(3) // 미래 카드는 건드리지 않았음
    const as3Topic = db.cards.find((c) => c.key === 'AS3a:topic')
    expect(as3Topic?.card.reps).toBe(4) // 객관 감사 카드도 건드리지 않았음
    const as4Topic = db.cards.find((c) => c.key === 'AS4a:topic')
    expect(as4Topic?.card.state).toBe(3) // Relearning
    expect(db.cards.filter((c) => c.verseId === 'AS5a')).toHaveLength(0)
    expect(db.learning.find((l) => l.verseId === 'AS5a')?.step).toBe('firstLetter')

    // 다음 파트 이어가기 → 180구절 1
    const nextBtn = page.getByRole('button', {
      name: /다음 파트 개정하기: 180구절 1\. 하나님을 알아감/,
    })
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()
    await expect(page.locator('.card-code')).toHaveText('T1-1')
  })

  test('뒤로가기 버튼 포커스 중 Space 키는 파트 선택으로 돌아가고, 카드 본문을 열지 않는다', async ({
    page,
  }) => {
    await page.goto(BASE)
    await seedGraduatedVerses(page, [{ id: 'AS1a', reps: 3, dueDays: -5 }])
    await page.goto(`${BASE}#/recalibrate`)

    await page.getByRole('button', { name: /그리스도인의 확신/ }).click()
    await expect(page.getByRole('button', { name: /본문 확인/ })).toBeVisible()

    const back = page.getByRole('button', { name: '파트 선택' })
    await back.focus()
    await page.keyboard.press('Space')

    await expect(page.locator('.recal-units')).toBeVisible()
    await expect(page.locator('.recal-verdicts')).toHaveCount(0)
  })

  test('320px 좁은 모바일 화면에서도 가로 넘침 없이 판정 버튼과 완료 집계가 정렬된다', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(BASE)
    await seedGraduatedVerses(page, [{ id: 'D8-1a', reps: 3, dueDays: -5 }])
    await page.goto(`${BASE}#/recalibrate`)

    await page.getByRole('button', { name: /DEP 8\./ }).click()
    await page.getByRole('button', { name: /본문 확인/ }).click()
    await expect(page.locator('.recal-verdicts')).toBeVisible()

    const cardOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(cardOverflow).toBe(false)

    await page.locator('.recal-solid').click()
    await expect(page.locator('.recal-summary')).toBeVisible()

    const summaryMetrics = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth
      const dds = [...document.querySelectorAll('.recal-summary dd')].map((el) =>
        Math.round(el.getBoundingClientRect().top),
      )
      return { overflow, dds }
    })
    expect(summaryMetrics.overflow).toBe(false)
    // 세 칸의 구절 수 숫자가 모두 같은 세로 높이에 맞춰진다
    expect(new Set(summaryMetrics.dds).size).toBe(1)
  })
})
