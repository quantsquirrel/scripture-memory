import { type BrowserContext, expect, type Page, test } from '@playwright/test'

/**
 * 탭 두 개가 같은 카드를 들고 있을 때: 늦게 채점한 탭은 옛 사본으로 진도를 덮지 않고
 * (commitRating의 기준 상태 확인), 화면이 카드를 다시 읽어 출제하거나 건너뛴다.
 */
const BASE = '/scripture-memory/'
const DAY = 86_400_000

async function seedOneDueCard(page: Page): Promise<void> {
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
  await page.evaluate(async (day) => {
    const db = await new Promise<IDBDatabase>((ok, no) => {
      const r = indexedDB.open('tms-krv')
      r.onsuccess = () => {
        ok(r.result)
      }
      r.onerror = () => {
        no(r.error ?? new Error('open'))
      }
    })
    const now = Date.now()
    const tx = db.transaction(['cards', 'learning', 'reviews'], 'readwrite')
    tx.objectStore('cards').put({
      key: 'AS1a:topic',
      verseId: 'AS1a',
      direction: 'topic',
      card: {
        due: new Date(now - day).toISOString(),
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        reps: 5,
        lapses: 0,
        learning_steps: 0,
        state: 2,
        last_review: new Date(now - 11 * day).toISOString(),
      },
    })
    tx.objectStore('learning').put({
      verseId: 'AS1a',
      step: 'graduated',
      updatedAt: new Date(now - 30 * day).toISOString(),
    })
    for (let i = 0; i < 5; i++) {
      tx.objectStore('reviews').add({
        cardKey: 'AS1a:topic',
        verseId: 'AS1a',
        direction: 'topic',
        ts: new Date(now - (11 + i) * day).toISOString(),
        mode: 'recite',
        rating: 3,
        accuracy: null,
        peeks: null,
      })
    }
    await new Promise((ok, no) => {
      tx.oncomplete = ok
      tx.onerror = () => {
        no(tx.error ?? new Error('tx'))
      }
    })
    db.close()
  }, DAY)
}

async function stored(page: Page): Promise<{ reps: number; reviews: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open('tms-krv')
      r.onsuccess = () => {
        ok(r.result)
      }
    })
    const tx = db.transaction(['cards', 'reviews'])
    const ask = <T>(q: IDBRequest<T>) =>
      new Promise<T>((ok) => {
        q.onsuccess = () => {
          ok(q.result)
        }
      })
    const card = (await ask(tx.objectStore('cards').get('AS1a:topic'))) as {
      card: { reps: number }
    }
    const reviews = await ask(tx.objectStore('reviews').count())
    db.close()
    return { reps: card.card.reps, reviews }
  })
}

async function rate(page: Page, grade: 1 | 3): Promise<void> {
  await page.getByRole('button', { name: '정답 보기' }).click()
  await page.locator(`button.rate-${String(grade)}`).click()
}

async function twoReviewTabs(context: BrowserContext, page: Page): Promise<Page> {
  await seedOneDueCard(page)
  const other = await context.newPage()
  for (const p of [page, other]) {
    await p.goto(`${BASE}#/review`)
    await expect(p.getByRole('heading', { name: '구원의 확신' })).toBeVisible()
  }
  return other
}

test.describe('다른 탭이 먼저 채점한 카드', () => {
  test('아직 출제할 때면 갱신된 상태로 다시 출제하고, 옛 사본으로는 쓰지 않는다', async ({
    context,
    page,
  }) => {
    const other = await twoReviewTabs(context, page)
    await rate(other, 1)
    await expect.poll(() => stored(page)).toEqual({ reps: 6, reviews: 6 })

    await rate(page, 3)
    await expect(page.getByText('갱신된 상태로 다시 출제합니다')).toBeVisible()
    await expect(page.getByRole('button', { name: '정답 보기' })).toBeVisible()
    expect(await stored(page)).toEqual({ reps: 6, reviews: 6 })

    await rate(page, 3)
    await expect(page.getByRole('heading', { name: '복습 완료!' })).toBeVisible()
    expect(await stored(page)).toEqual({ reps: 7, reviews: 7 })
  })

  test('이미 복습돼 밀려난 마지막 카드는 건너뛰고 세션을 마친다', async ({ context, page }) => {
    const other = await twoReviewTabs(context, page)
    await rate(other, 3)
    await expect(other.getByRole('heading', { name: '복습 완료!' })).toBeVisible()

    await rate(page, 3)
    await expect(page.getByRole('heading', { name: '복습할 카드가 없습니다' })).toBeVisible()
    await expect(page.getByText('이미 복습한 카드라 건너뜁니다')).toBeVisible()
    await expect(page.getByText(/다음 복습: .+ 후/)).toBeVisible()
    expect(await stored(page)).toEqual({ reps: 6, reviews: 6 })
  })
})
