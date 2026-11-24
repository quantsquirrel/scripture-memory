import { expect, type Page, test } from '@playwright/test'

/**
 * 복습 방식은 카드 상태와 그 카드의 복습 기록으로 정해진다(domain/policy.ts).
 * 브라우저 IndexedDB에 남은 기록의 감사 빚이 복습 화면에 타이핑 감사로 나오고,
 * 화면에 보인 방식이 그대로 증거에 남는지 본다.
 */
const BASE = '/scripture-memory/'
const DAY = 86_400_000
const KEY = 'AS1a:topic'

interface SeedReview {
  daysAgo: number
  mode: 'firstLetter' | 'recite' | 'typing'
  rating: 1 | 3
}

/** 간격 복습(Review) 상태이고 어제 due가 된 카드 한 장과 그 기록을 심는다. reps는 기록 수 */
async function seed(page: Page, reviews: SeedReview[]): Promise<void> {
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
  await page.evaluate(
    async ({ day, key, reviews }) => {
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
        key,
        verseId: 'AS1a',
        direction: 'topic',
        card: {
          due: new Date(now - day).toISOString(),
          stability: 10,
          difficulty: 5,
          elapsed_days: 10,
          scheduled_days: 10,
          reps: reviews.length,
          lapses: 0,
          learning_steps: 0,
          state: 2,
          last_review: new Date(now - 11 * day).toISOString(),
        },
      })
      tx.objectStore('learning').put({
        verseId: 'AS1a',
        step: 'graduated',
        updatedAt: new Date(now - 90 * day).toISOString(),
      })
      for (const r of reviews) {
        tx.objectStore('reviews').add({
          cardKey: key,
          verseId: 'AS1a',
          direction: 'topic',
          ts: new Date(now - r.daysAgo * day).toISOString(),
          mode: r.mode,
          rating: r.rating,
          accuracy: r.mode === 'typing' ? (r.rating === 1 ? 0.2 : 1) : null,
          peeks: r.mode === 'firstLetter' ? 0 : null,
        })
      }
      await new Promise((ok, no) => {
        tx.oncomplete = ok
        tx.onerror = () => {
          no(tx.error ?? new Error('tx'))
        }
      })
      db.close()
    },
    { day: DAY, key: KEY, reviews },
  )
}

/** 기록된 방식들 (시각 순) */
async function storedModes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open('tms-krv')
      r.onsuccess = () => {
        ok(r.result)
      }
    })
    const q = db.transaction('reviews').objectStore('reviews').getAll()
    const rows = await new Promise<{ ts: string; mode: string }[]>((ok) => {
      q.onsuccess = () => {
        ok(q.result as { ts: string; mode: string }[])
      }
    })
    db.close()
    return rows.sort((a, b) => (a.ts < b.ts ? -1 : 1)).map((r) => r.mode)
  })
}

/** 새 카드 → 학습 → 간격 복습 두 번까지 — 그 뒤 reps 4는 5회 감사 차례다 */
const CLIMB: SeedReview[] = [
  { daysAgo: 60, mode: 'firstLetter', rating: 3 },
  { daysAgo: 59.99, mode: 'firstLetter', rating: 3 },
  { daysAgo: 57, mode: 'recite', rating: 3 },
]

test.describe('복습 방식 — 카드 상태와 기록', () => {
  test('간격 복습에서 다시를 받은 카드는 재도전을 거쳐도 다음 간격 복습이 타이핑 감사다', async ({
    page,
  }) => {
    // reps 3 낭송 '다시' → 재학습 첫글자 통과 → reps 5 (5회 차례 아님)
    await seed(page, [
      ...CLIMB,
      { daysAgo: 30, mode: 'recite', rating: 1 },
      { daysAgo: 29.99, mode: 'firstLetter', rating: 3 },
    ])
    await page.goto(`${BASE}#/review`)
    await expect(page.locator('.mode-tag')).toHaveText('타이핑 감사')

    const text = (await page.locator('.stt-context').textContent()) ?? ''
    await page.locator('#review-typing').fill(text)
    await page.getByRole('button', { name: '채점' }).click()
    await page.locator('button.rate-3').click()
    await expect(page.getByRole('heading', { name: '복습 완료!' })).toBeVisible()
    // 화면에 보인 방식이 그대로 증거에 남았다
    expect((await storedModes(page)).at(-1)).toBe('typing')
  })

  test('타이핑 감사를 통과한 뒤로는 낭송으로 돌아간다', async ({ page }) => {
    // reps 4 감사 통과 → reps 5는 낭송 차례
    await seed(page, [
      ...CLIMB,
      { daysAgo: 46, mode: 'recite', rating: 3 },
      { daysAgo: 11, mode: 'typing', rating: 3 },
    ])
    await page.goto(`${BASE}#/review`)
    await expect(page.locator('.mode-tag')).toHaveText('소리 내어 낭송')
  })
})
