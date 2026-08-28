import { expect, test } from '@playwright/test'

/**
 * 접근성 검증 — 계산하거나 측정할 수 있는 것만 담는다.
 * 명도비는 scripts/audit_contrast.py가 토큰 값에서 직접 계산한다(별도).
 */
const BASE = '/scripture-memory/'
const TOUCH_MIN = 44

/** 화면에 보이는 모든 대화형 요소의 실제 렌더 크기를 잰다 */
async function measureTargets(page: import('@playwright/test').Page) {
  return page.evaluate((min) => {
    const selector = 'a, button, input:not([type=hidden]), textarea, select, summary'
    const small: { tag: string; label: string; w: number; h: number }[] = []
    let checked = 0
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      checked++
      // 확장된 누름 영역(::after)까지 고려해 자식 의사요소 높이를 포함시킨다
      const after = getComputedStyle(el, '::after')
      const afterH = parseFloat(after.height) || 0
      const afterW = parseFloat(after.minWidth) || 0
      const h = Math.max(r.height, afterH)
      const w = Math.max(r.width, afterW)
      if (h < min - 0.5 || w < min - 0.5) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 30),
          w: Math.round(w),
          h: Math.round(h),
        })
      }
    }
    return { checked, small }
  }, TOUCH_MIN)
}

test.describe('터치 타깃 44×44px', () => {
  for (const route of ['home', 'browse', 'meditate', 'settings'] as const) {
    test(`${route} 화면의 모든 대화형 요소가 44px 이상`, async ({ page }) => {
      await page.goto(`${BASE}#/${route}`)
      await expect(page.locator('nav.bottom-nav')).toBeVisible()
      const { checked, small } = await measureTargets(page)
      expect(checked).toBeGreaterThan(3)
      expect(small, `작은 타깃: ${JSON.stringify(small)}`).toEqual([])
    })
  }

  test('학습 화면(첫글자 보드 포함)의 타깃이 44px 이상', async ({ page }) => {
    await page.goto(`${BASE}#/learn/AS1a`)
    await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
    await expect(page.locator('.fl-board')).toBeVisible()
    const { checked, small } = await measureTargets(page)
    expect(checked).toBeGreaterThan(5)
    expect(small, `작은 타깃: ${JSON.stringify(small)}`).toEqual([])
  })
})

/** 현재 포커스된 요소의 텍스트 — 키보드 이동을 따라가기 위한 헬퍼 */
async function focusedText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    return el instanceof HTMLElement ? el.innerText.trim() : ''
  })
}

test.describe('키보드 전용 조작', () => {
  test('탭 이동만으로 학습 사다리를 졸업까지 통과할 수 있다', async ({ page }) => {
    await page.goto(`${BASE}#/learn/AS1a`)
    const verseText = (await page.locator('p.verse').first().innerText()).trim()

    // 1단계: 키보드로 '낭송했어요' 버튼까지 이동해 Enter
    await page.keyboard.press('Tab')
    let guard = 0
    while (guard++ < 25) {
      const name = await focusedText(page)
      if (name.includes('낭송했어요')) break
      await page.keyboard.press('Tab')
    }
    expect(guard).toBeLessThan(25)
    await page.keyboard.press('Enter')
    await expect(page.locator('.fl-board')).toBeVisible()

    // 2단계: '낭송 완료'까지 이동해 Enter (엿보기 0회로 통과)
    guard = 0
    while (guard++ < 60) {
      const name = await focusedText(page)
      if (name === '낭송 완료') break
      await page.keyboard.press('Tab')
    }
    expect(guard).toBeLessThan(60)
    await page.keyboard.press('Enter')

    // 3단계: 입력란에 포커스를 두고 타이핑 → 채점 → 졸업
    const box = page.locator('textarea.typing-input')
    await expect(box).toBeVisible()
    await box.focus()
    await page.keyboard.insertText(verseText)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveText(/채점/)
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: '졸업 — 복습 큐에 추가' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/졸업!/)).toBeVisible()
  })

  test('포커스 표시가 키보드 이동에서 보인다', async ({ page }) => {
    await page.goto(`${BASE}#/home`)
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const s = getComputedStyle(el)
      return { width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow }
    })
    expect(outline).not.toBeNull()
    // outline이 none이거나 0px이면 포커스가 보이지 않는다
    expect(outline?.style).not.toBe('none')
    expect(parseFloat(outline?.width ?? '0')).toBeGreaterThanOrEqual(2)
  })

  test('하단 탭이 키보드로 이동 가능한 링크다', async ({ page }) => {
    await page.goto(`${BASE}#/home`)
    const tabs = page.locator('nav.bottom-nav a')
    await expect(tabs).toHaveCount(5)
    for (let i = 0; i < 5; i++) {
      await expect(tabs.nth(i)).toHaveAttribute('href', /#\//)
    }
  })
})

test.describe('스크린리더 텍스트 대안', () => {
  test('첫글자 보드의 각 어절 버튼에 뜻이 통하는 이름이 있다', async ({ page }) => {
    await page.goto(`${BASE}#/learn/AS1a`)
    await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
    const board = page.locator('.fl-board')
    await expect(board).toHaveAttribute('aria-label', '첫글자 복원 보드')
    const first = board.getByRole('button').first()
    // "보··" 같은 시각 표기가 아니라 순번·첫 글자·조작법이 읽힌다
    await expect(first).toHaveAttribute('aria-label', /1번째 어절, 첫 글자 .+누르면/)
  })

  test('diff 결과에 색이 아닌 문장 요약이 함께 있다', async ({ page }) => {
    await page.goto(`${BASE}#/learn/AS1a`)
    await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
    await page.getByRole('button', { name: '낭송 완료' }).click()
    await page.locator('textarea.typing-input').fill('전혀 다른 문장을 입력한다')
    await page.getByRole('button', { name: /채점/ }).click()

    // 점수는 status로 알린다
    await expect(page.getByRole('status')).toBeVisible()
    // 색으로만 표현된 diff는 aria-hidden이고, 대신 문장 요약이 있다
    await expect(page.locator('.diff-words')).toHaveAttribute('aria-hidden', 'true')
    const srText = await page.locator('.diff-view .sr-only').innerText()
    expect(srText).toMatch(/정확도 \d+퍼센트/)
    expect(srText).toMatch(/빠뜨린 글자|틀리거나 더 넣은 글자/)
  })

  test('세그먼트 토글이 눌린 상태를 알린다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)
    const dark = page.getByRole('button', { name: '다크' })
    await dark.click()
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '자동' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

test.describe('테마 토큰 전환', () => {
  test('테마 선택이 data-theme와 color-scheme에 반영된다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)

    await page.getByRole('button', { name: '라이트' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const light = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    )

    await page.getByRole('button', { name: '다크' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const dark = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    )
    expect(light).not.toBe(dark)

    // '자동'은 속성을 지워 OS 설정을 따른다
    await page.getByRole('button', { name: '자동' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  })

  test('테마 선택이 새로고침 후에도 유지된다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)
    await page.getByRole('button', { name: '라이트' }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('button', { name: '라이트' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
