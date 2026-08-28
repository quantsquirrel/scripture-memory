import { expect, test } from '@playwright/test'

/**
 * T3에서 바꾼 두 가지를 실제 브라우저에서 확인한다.
 * 1) hash 라우팅 — 딥링크·뒤로가기·새로고침
 * 2) 리마운트 제거 — 저장소 쓰기 후에도 입력·스크롤 상태가 살아 있는지
 *
 * vite base가 '/scripture-memory/'이므로 모든 경로에 그 접두어가 붙는다.
 */
const BASE = '/scripture-memory/'

test.describe('hash 라우팅', () => {
  test('탭 이동이 URL에 반영되고 뒤로가기·앞으로가기가 동작한다', async ({ page }) => {
    await page.goto(BASE)
    await expect(page.getByRole('heading', { name: 'Ivan' })).toBeVisible()

    await page.getByRole('link', { name: '목록' }).click()
    await expect(page).toHaveURL(/#\/browse$/)

    await page.getByRole('link', { name: '설정' }).click()
    await expect(page).toHaveURL(/#\/settings$/)
    await expect(page.getByRole('heading', { name: '화면 테마' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/#\/browse$/)
    await expect(page.locator('button.verse-row').first()).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/#\/settings$/)
  })

  test('딥링크로 바로 들어갈 수 있고 새로고침해도 같은 화면이다', async ({ page }) => {
    await page.goto(`${BASE}#/stats`)
    await expect(page.getByRole('heading', { name: '마음에 새긴 말씀' })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/#\/stats$/)
    await expect(page.getByRole('heading', { name: '마음에 새긴 말씀' })).toBeVisible()
  })

  test('구절 딥링크가 학습 화면을 열고 새로고침을 견딘다', async ({ page }) => {
    await page.goto(`${BASE}#/learn/AS1a`)
    await expect(page.getByText('낭송 규칙 (TMS)')).toBeVisible()
    await page.reload()
    await expect(page.getByText('낭송 규칙 (TMS)')).toBeVisible()
  })

  test('알 수 없는 hash는 홈으로 떨어진다 (빈 화면 금지)', async ({ page }) => {
    await page.goto(`${BASE}#/does-not-exist`)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
  })

  test('활성 탭에 aria-current가 붙는다', async ({ page }) => {
    await page.goto(`${BASE}#/browse`)
    await expect(page.getByRole('link', { name: '목록' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('link', { name: '홈' })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

test.describe('리마운트 제거 (상태 보존)', () => {
  /**
   * 이전 구현의 정확한 회귀: 설정에서 값을 입력하던 중 다른 설정을 저장하면
   * onChanged() → epoch++ → <main key={epoch}> 리마운트로 입력이 사라졌다.
   */
  test('입력 중 저장소 쓰기가 일어나도 입력값과 스크롤이 유지된다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)

    const gistId = page.locator('#sync-gist')
    await gistId.fill('my-draft-gist-id')

    await page.evaluate(() => {
      window.scrollTo(0, 300)
    })
    const scrollBefore = await page.evaluate(() => window.scrollY)
    expect(scrollBefore).toBeGreaterThan(0)

    // 목표일 변경 = IndexedDB 쓰기 + 리비전 증가. Playwright fill은 요소를
    // 화면 안으로 스크롤해 버리므로, 네이티브 setter로 값을 넣고 input 이벤트만 쏜다.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#goal-date')
      if (!input) throw new Error('#goal-date 없음')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- 네이티브 setter를 떼어내 React 값 추적을 우회하는 의도된 패턴
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(input, '2099-12-31')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.getByText('목표일을 저장했습니다.')).toBeVisible()

    // 입력값이 살아 있어야 한다 (리마운트되었다면 빈 문자열이 된다)
    await expect(gistId).toHaveValue('my-draft-gist-id')
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  })

  test('쓰기 후 구독 중인 화면의 데이터는 갱신된다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)
    // 미래 목표일 저장 = IndexedDB 쓰기. 홈 학습 패널의 D-day 문구가 이를 반영한다.
    await page.locator('#goal-date').fill('2099-12-31')
    await expect(page.getByText('목표일을 저장했습니다.')).toBeVisible()

    await page.getByRole('link', { name: '홈' }).click()
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
    await expect(page.getByText(/DEP242 완결/)).toBeVisible()
  })
})

test.describe('오프라인 완결', () => {
  test('서비스 워커 캐시로 재방문이 오프라인에서 동작한다', async ({ page, context }) => {
    await page.goto(BASE)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    })
    // precache 완료를 기다린다
    await page.waitForTimeout(1500)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Ivan' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()

    // 오프라인에서도 이동과 본문 표시가 된다 (본문은 번들에 포함)
    await page.getByRole('link', { name: '목록' }).click()
    await expect(page.locator('button.verse-row').first()).toBeVisible()

    await page.goto(`${BASE}#/learn/AS1a`)
    await expect(page.getByText('낭송 규칙 (TMS)')).toBeVisible()
    await context.setOffline(false)
  })

  test('오프라인에서 학습·졸업이 저장되고 복습 카드가 생성된다', async ({ page, context }) => {
    await page.goto(BASE)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    })
    await page.waitForTimeout(1500)
    await context.setOffline(true)

    await page.goto(`${BASE}#/learn/AS1a`)
    // 본문을 화면에서 읽어 둔다 (구절 id별 본문을 테스트에 박아 넣지 않는다)
    const verseText = (await page.locator('p.verse').first().innerText()).trim()
    expect(verseText.length).toBeGreaterThan(10)

    await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
    await page.getByRole('button', { name: '낭송 완료' }).click()

    const box = page.locator('textarea.typing-input')
    await expect(box).toBeVisible()
    // 정답 본문을 그대로 입력해 word-perfect 통과
    await box.fill(verseText)
    await page.getByRole('button', { name: /채점/ }).click()
    await page.getByRole('button', { name: '졸업 — 복습 큐에 추가' }).click()
    await expect(page.getByText(/졸업!/)).toBeVisible()

    // 홈에서 복습 대기 카드가 보인다 — 네트워크 없이 전 과정이 끝났다
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('button', { name: /복습 시작|지금 이어서 복습/ })).toBeVisible()
    await context.setOffline(false)
  })
})
