import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

/**
 * 전체 흐름 왕복: 홈 → 학습(졸업) → 복습(채점) → 묵상 → 설정 내보내기/가져오기.
 * 실제 파일 다운로드와 파일 선택을 거쳐 백업이 왕복하는지까지 확인한다.
 */
const BASE = '/scripture-memory/'

/** 학습 사다리를 끝까지 통과시켜 3방향 카드를 만든다 */
async function graduateFirstVerse(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}#/home`)
  await page.getByRole('button', { name: /다음 구절:/ }).click()
  await expect(page.getByText('낭송 규칙 (TMS)')).toBeVisible()

  const verseText = (await page.locator('p.verse').first().innerText()).trim()
  await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
  await page.getByRole('button', { name: '낭송 완료' }).click()
  await page.locator('textarea.typing-input').fill(verseText)
  await page.getByRole('button', { name: /채점/ }).click()
  await page.getByRole('button', { name: '졸업 — 복습 큐에 추가' }).click()
  await expect(page.getByText(/졸업!/)).toBeVisible()
}

test.describe('전체 흐름 왕복', () => {
  test('홈 → 학습 → 복습 → 묵상 → 설정 내보내기/가져오기', async ({ page }) => {
    // ── 홈: 아직 아무것도 없는 상태
    await page.goto(BASE)
    await expect(page.getByRole('heading', { name: '오늘의 복습' })).toBeVisible()
    await expect(page.getByText('대기 중인 카드가 없습니다.')).toBeVisible()

    // ── 학습: 첫 구절 졸업 → 3방향 카드 생성
    await graduateFirstVerse(page)

    // ── 홈이 복습 대기를 반영한다 (리비전 구독으로 갱신)
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('button', { name: '복습 시작' })).toBeVisible()
    await expect(page.getByText(/카드 3장이 기다리고 있습니다/)).toBeVisible()

    // ── 복습: 첫 카드를 채점한다 (어린 카드 → 첫글자 또는 장절 입력)
    await page.getByRole('button', { name: '복습 시작' }).click()
    await expect(page.locator('.mode-tag')).toBeVisible()
    const modeText = await page.locator('.mode-tag').innerText()

    if (modeText.includes('장절 입력')) {
      await page.locator('#review-ref').fill('요일 5:11-12')
      await page.getByRole('button', { name: '확인' }).click()
    } else {
      await page.getByRole('button', { name: '낭송 완료 — 확인' }).click()
    }
    // 등급 버튼이 나타나면 증거가 모인 상태다
    await expect(page.locator('.rating-bar')).toBeVisible()
    await page.locator('button.rate-3').click()

    // 남은 카드가 줄었다
    await expect(page.getByText(/남은 카드 2|복습 완료!/)).toBeVisible()

    // ── 묵상: 오늘 읽은 본문에서 고른 한 구절과 그 참조 사슬이 보인다
    await page.getByRole('link', { name: '묵상' }).click()
    await expect(page.getByRole('heading', { name: '오늘 읽은 말씀' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '오늘 마음에 두실 말씀' })).toBeVisible()
    await expect(page.locator('.meditation-verse')).not.toBeEmpty()
    await expect(page.locator('.chain').first()).toBeVisible()

    // 지난 걸음(옛 돌아보기 지표)은 접혀 있고, 펼치면 그대로 남아 있다
    await page.getByText('지난 걸음 돌아보기').click()
    await expect(page.getByRole('heading', { name: '마음에 새긴 말씀' })).toBeVisible()
    await expect(page.getByText(/1\/495구절.*마음에 새겨져/)).toBeVisible()
    await expect(page.getByRole('heading', { name: '동행' })).toBeVisible()

    // ── 설정: 내보내기 (실제 다운로드)
    await page.getByRole('link', { name: '설정' }).click()
    await expect(page.getByText(/총 복습 1회/)).toBeVisible()

    const download = await Promise.race([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: '내보내기 (JSON)' })
        .click()
        .then(() => null),
    ])
    const dl = download ?? (await page.waitForEvent('download'))
    const path = await dl.path()
    expect(path).toBeTruthy()
    const bundle: unknown = JSON.parse(readFileSync(path, 'utf8'))
    expect(bundle).toMatchObject({ app: 'scripture-memory', version: 2 })
    const b = bundle as {
      cards: unknown[]
      reviews: unknown[]
      learning: { step: string }[]
    }
    expect(b.cards).toHaveLength(3)
    expect(b.reviews).toHaveLength(1)
    expect(b.learning[0]?.step).toBe('graduated')

    // ── 초기화 후 가져오기로 복원
    page.once('dialog', (d) => {
      void d.accept()
    })
    await page.getByRole('button', { name: '초기화' }).click()
    await expect(page.getByText('초기화했습니다.')).toBeVisible()
    await expect(page.getByText(/총 복습 0회/)).toBeVisible()

    await page.locator('input[type=file]').setInputFiles(path)
    await expect(page.getByText('가져오기 완료.')).toBeVisible()
    await expect(page.getByText(/총 복습 1회/)).toBeVisible()
    await expect(page.getByText(/암송 편입 1구절/)).toBeVisible()

    // ── 복원된 상태로 복습이 이어진다 (FSRS 진도 보존)
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('button', { name: /복습 시작|지금 이어서 복습/ })).toBeVisible()
  })

  /**
   * 회귀: 졸업 화면의 "다음 구절"로 learn→learn 이동 시, 이전 구절의 타이핑
   * 채점(grade)이 새 구절에 남아 있으면 타이핑 단계가 DiffView로 도배된다.
   * 새 구절의 typing 단계는 빈 입력창이어야 한다.
   */
  test('다음 구절로 넘어가면 타이핑 단계가 빈 입력창으로 시작한다', async ({ page }) => {
    await graduateFirstVerse(page)

    // 졸업 화면의 "다음 구절" 버튼 — learn → learn hash 이동 (리마운트는 key가 한다)
    const nextBtn = page.getByRole('button', { name: /다음 구절:/ })
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()

    // 새 구절 사다리: intro → firstLetter → typing
    await expect(page.getByText('낭송 규칙 (TMS)')).toBeVisible()
    const newRef = (await page.locator('h2.prompt-main').innerText()).trim()
    await page.getByRole('button', { name: '낭송했어요 — 다음' }).click()
    await page.getByRole('button', { name: '낭송 완료' }).click()

    // 타이핑 단계: 이전 구절의 채점 DiffView가 아니라 빈 입력창 + 새 구절 ref
    await expect(page.locator('textarea.typing-input')).toBeVisible()
    await expect(page.locator('textarea.typing-input')).toHaveValue('')
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('h2.prompt-main')).toHaveText(newRef)
  })

  test('v1 백업 파일도 가져올 수 있다 (마이그레이션 경로)', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)
    // 저장소의 골든 v1 fixture를 그대로 올린다
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/export-v1.json')
    await expect(page.getByText('가져오기 완료.')).toBeVisible()
    await expect(page.getByText(/총 복습 4회/)).toBeVisible()
    // v1의 step 3(졸업)이 마이그레이션되어 암송 편입 1구절로 잡힌다
    await expect(page.getByText(/암송 편입 1구절/)).toBeVisible()

    // 내보내면 v2 형식으로 나온다
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '내보내기 (JSON)' }).click(),
    ])
    const path = await download.path()
    const out: unknown = JSON.parse(readFileSync(path, 'utf8'))
    expect(out).toMatchObject({ version: 2 })
    const o = out as { learning: { step: string }[] }
    expect(o.learning.map((l) => l.step).sort()).toEqual(['firstLetter', 'graduated'])
  })

  test('손상된 백업은 거부하고 기존 데이터를 지키지 않는다', async ({ page }) => {
    await page.goto(`${BASE}#/settings`)
    await page.locator('input[type=file]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"app":"scripture-memory","version":9}'),
    })
    await expect(page.getByText(/가져오기 실패/)).toBeVisible()
    // 저장소는 그대로 (검증을 먼저 하고 비운다)
    await expect(page.getByText(/총 복습 0회/)).toBeVisible()
  })
})
