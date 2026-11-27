import { expect, type Page, test } from '@playwright/test'

/**
 * 같은 자리를 연달아 누른 둘째 누름은 방금 나타난 버튼에 닿지 않는다(components/SettleShield.tsx).
 * 쟁반이 화면 아래 같은 자리에 붙어 있어 '정답 보기' 자리에 등급 칸이, 홈의 금색 버튼 자리에
 * 무대의 첫 버튼이 선다 — 막지 않으면 보지 않은 답에 손가락 자리의 등급이 기록된다.
 * 누름은 좌표로 보낸다(locator.click은 버튼이 누름을 받을 때까지 스스로 기다려서 이 장치를 지나친다).
 */
const BASE = '/scripture-memory/'
const DAY = 86_400_000

/** 간격 복습(Review) 상태이고 어제 due가 된 낭송 카드 한 장을 심는다 */
async function seedReciteCard(page: Page): Promise<void> {
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
    const tx = db.transaction(['cards', 'learning'], 'readwrite')
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
        reps: 3,
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
    await new Promise((ok, no) => {
      tx.oncomplete = ok
      tx.onerror = () => {
        no(tx.error ?? new Error('tx'))
      }
    })
    db.close()
  }, DAY)
}

async function reviewCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((ok, no) => {
        const r = indexedDB.open('tms-krv')
        r.onsuccess = () => {
          const db = r.result
          const q = db.transaction('reviews').objectStore('reviews').count()
          q.onsuccess = () => {
            db.close()
            ok(q.result)
          }
          q.onerror = () => {
            no(q.error ?? new Error('count'))
          }
        }
        r.onerror = () => {
          no(r.error ?? new Error('open'))
        }
      }),
  )
}

test.describe('같은 자리 연달아 누르기', () => {
  test("'정답 보기'를 같은 자리에서 두 번 눌러도 등급이 기록되지 않는다", async ({
    page,
    hasTouch,
  }) => {
    await seedReciteCard(page)
    await page.goto(`${BASE}#/review`)
    const reveal = page.getByRole('button', { name: '정답 보기' })
    await expect(reveal).toBeVisible()
    // 카드가 놓이는 움직임이 끝난 뒤(사람이 말씀을 떠올리는 동안)
    await page.waitForTimeout(600)
    const box = await reveal.boundingBox()
    if (!box) throw new Error("'정답 보기'의 자리를 읽지 못했다")
    // 왼쪽 끝 등급 칸('다시')이 설 자리
    const x = box.x + box.width * 0.125
    const y = box.y + box.height / 2
    const press = () => (hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y))

    await press()
    await page.waitForTimeout(150)
    await press()

    // 정답은 열리고(첫 누름), 둘째 누름은 등급을 남기지 않는다
    await expect(page.locator('.rating-bar')).toBeVisible()
    await page.waitForTimeout(600)
    expect(await reviewCount(page)).toBe(0)

    // 보통 속도로 다시 누르면 받는다
    await press()
    await expect.poll(() => reviewCount(page)).toBe(1)
  })

  test('홈의 금색 버튼을 두 번 눌러도 복습 첫 카드의 정답이 열리지 않는다', async ({
    page,
    hasTouch,
    isMobile,
  }) => {
    test.skip(!isMobile, '금색 버튼이 쟁반에 서는 것은 폰에서다')
    await seedReciteCard(page)
    await page.reload()
    const gold = page.getByRole('button', { name: '복습 시작' })
    await expect(gold).toBeVisible()
    await page.waitForTimeout(600)
    const box = await gold.boundingBox()
    if (!box) throw new Error("'복습 시작'의 자리를 읽지 못했다")
    // 버튼의 위쪽 띠 — 복습 무대의 쟁반 버튼('정답 보기')과 겹치는 자리
    const x = box.x + box.width / 2
    const y = box.y + 4
    const press = () => (hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y))

    await press()
    await page.waitForTimeout(150)
    await press()

    await expect(page.getByRole('button', { name: '정답 보기' })).toBeVisible()
    await page.waitForTimeout(600)
    await expect(page.locator('.rating-bar')).toHaveCount(0)
  })
})
