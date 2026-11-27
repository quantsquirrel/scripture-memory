import { expect, type Page, test } from '@playwright/test'

/**
 * 첫 실행 소개(src/views/intro) — 빈 기기의 첫 실행에만 저절로 뜨고, 설정에서 다시 연다.
 * 다른 흐름 시험은 공통 준비(playwright.config.ts의 storageState)가 '봤다' 표시를 넣어 건너뛴다.
 * 여기서만 그 표시를 비워 빈 기기에서 시작한다.
 * 시각을 정해야 하는 시험은 Playwright 가짜 시계(page.clock)를 멈춘 채 열고 runFor로만 진행한다 —
 * 앱에는 시험용 구멍(되감기 함수·쿼리 파라미터)이 없다.
 */
const BASE = '/scripture-memory/'
const END_MS = 17_500

test.use({ storageState: { cookies: [], origins: [] } })

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Ivan 소개' })
const skipButton = (page: Page) => page.getByRole('button', { name: '건너뛰기' })
const startButton = (page: Page) => page.getByRole('button', { name: '시작하기' })

/** 가짜 시계를 멈춘 채로 연다 — install만 하면 실제 시간으로 흐른다 */
async function pauseClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-27T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-27T00:00:01Z'))
}

/** 장면이 글꼴을 받고 자리를 재어 재생을 시작할 때까지 */
async function introReady(page: Page): Promise<void> {
  await expect(dialog(page)).toBeVisible()
  await page.locator('.intro[data-ready]').waitFor()
}

test.describe('첫 실행 소개', () => {
  test('빈 기기의 첫 실행에 저절로 뜨고, 두 번째에는 뜨지 않는다', async ({ page }) => {
    await page.goto(BASE)
    await expect(dialog(page)).toBeVisible()
    await expect(skipButton(page)).toBeVisible()
    // 뜨는 순간 표시를 적는다 — 끝까지 보지 않고 새로 열어도 다시 저절로 뜨지 않는다
    expect(await page.evaluate(() => localStorage.getItem('intro-seen'))).not.toBeNull()

    await page.reload()
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
  })

  test('끝까지 재생되면 시작하기에 포커스가 가고, 누르면 홈이다', async ({ page }) => {
    await pauseClock(page)
    // 다른 화면으로 들어온 첫 실행 — '시작하기'는 그 화면이 아니라 홈으로 간다
    await page.goto(`${BASE}#/settings`)
    await introReady(page)
    await page.clock.runFor(END_MS + 500)
    await expect(startButton(page)).toBeFocused()

    await startButton(page).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
  })

  test('재생 중에는 건너뛰기가 언제나 누를 수 있게 서 있고, 누르면 끝 장면으로 간다', async ({
    page,
  }) => {
    await pauseClock(page)
    await page.goto(BASE)
    await introReady(page)

    // 판정 기준의 시각마다: 건너뛰기나 '시작하기' 중 하나는 늘 눌린다(건너뛰기는 '시작하기'가 나타날 때 넘겨준다)
    let at = 0
    for (const t of [0.4, 1.8, 4.2, 5.4, 6.8, 9.9, 12.3, 13.9, 16.4, 17.0, 17.2]) {
      await page.clock.runFor(Math.round(t * 1000) - at)
      at = Math.round(t * 1000)
      const live = await page.evaluate(() => {
        const on = (sel: string) => {
          const el = document.querySelector<HTMLElement>(sel)
          if (!el) return false
          const cs = getComputedStyle(el)
          return (
            cs.visibility === 'visible' &&
            Number(cs.opacity) >= 0.5 &&
            cs.pointerEvents !== 'none'
          )
        }
        return { skip: on('.intro-skip'), start: on('.intro-cta') }
      })
      expect(live.skip || live.start, `t=${String(t)}초에 누를 것이 없다`).toBe(true)
      if (t < 16.9) expect(live.skip, `t=${String(t)}초에 건너뛰기가 없다`).toBe(true)
    }
  })

  test('건너뛰기를 누르면 끝 장면에서 시작하기에 포커스가 간다', async ({ page }) => {
    await page.goto(BASE)
    await introReady(page)
    await skipButton(page).click()
    await expect(startButton(page)).toBeVisible()
    await expect(startButton(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/home$/)
  })

  test('Esc는 재생 중에는 건너뛰기, 끝 장면에서는 시작하기다', async ({ page }) => {
    await page.goto(`${BASE}#/browse`)
    await introReady(page)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeVisible()
    await expect(startButton(page)).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/home$/)
  })

  test('낭독기에는 대화 상자 이름과 두 축 요약이 읽히고, 장면과 뒤 화면은 닿지 않는다', async ({
    page,
  }) => {
    await page.goto(BASE)
    await introReady(page)
    await expect(dialog(page)).toHaveAccessibleDescription(
      /^Ivan의 두 축\. 축자 객관 채점: .+ FSRS 간격 반복: .+ 채점 결과가 그대로 다음 복습 날짜가 됩니다\.$/,
    )
    // 장면은 inert — 제목·카드·등급 칸이 접근성 트리에 없다
    await expect(page.getByRole('heading', { name: '축자 객관 채점' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /어려움/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '채점' })).toHaveCount(0)
    // 뒤의 앱도 inert — 탭·제목에 닿지 않는다
    await expect(page.getByRole('link', { name: '설정' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toHaveCount(0)
    // 키보드로는 건너뛰기에만 닿는다
    await page.keyboard.press('Tab')
    await expect(skipButton(page)).toBeFocused()
  })

  test.describe('움직임 줄이기', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test('움직이지 않고 마지막 장면(두 축 요약)만 정지 화면으로 보인다', async ({ page }) => {
      await page.goto(BASE)
      await introReady(page)
      await expect(startButton(page)).toBeVisible()
      await expect(startButton(page)).toBeFocused()
      await expect(page.locator('[data-part="s4"]')).toBeVisible()
      for (const scene of ['s1', 's2', 's3']) {
        await expect(page.locator(`[data-part="${scene}"]`)).toBeHidden()
      }
      // 시간이 지나도 등불이 움직이지 않는다
      const lamp = () =>
        page.locator('.intro-lamp').evaluate((el) => (el as HTMLElement).style.transform)
      const before = await lamp()
      await page.waitForTimeout(800)
      expect(await lamp()).toBe(before)
    })
  })

  test('기록이 있는 기기(기존 사용자·백업을 가져온 기기)에는 저절로 뜨지 않는다', async ({
    page,
  }) => {
    await page.goto(`${BASE}#/settings`)
    await introReady(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // 백업을 가져온다
    await page.getByRole('link', { name: '설정' }).click()
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/export-v1.json')
    await expect(page.getByText('가져오기 완료.')).toBeVisible()

    // 이 기기에 소개를 띄운 표시가 없는 기존 사용자와 같은 상태로 다시 연다
    await page.evaluate(() => {
      localStorage.removeItem('intro-seen')
    })
    await page.goto(BASE)
    await page.reload()
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('intro-seen'))).toBeNull()
  })

  test('설정의 소개 다시 보기는 오프라인에서도 열린다', async ({ page, context }) => {
    await page.goto(BASE)
    await introReady(page)
    await skipButton(page).click()
    await startButton(page).click()
    await expect(dialog(page)).toHaveCount(0)

    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    })
    // precache 완료를 기다린다
    await page.waitForTimeout(1500)
    await context.setOffline(true)
    // 새 문서로 다시 열어 장면 조각이 메모리가 아니라 서비스 워커 캐시에서 오게 한다
    await page.goto(`${BASE}#/settings`)
    await page.reload()
    await page.getByRole('button', { name: '소개 다시 보기' }).click()
    await introReady(page)
    await expect(skipButton(page)).toBeVisible()
    await skipButton(page).click()
    await startButton(page).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/home$/)
    await context.setOffline(false)
  })
})
