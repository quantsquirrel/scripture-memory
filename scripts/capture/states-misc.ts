/** 셸(설치 안내), 키보드 포커스, 마우스 올림, 고대비 */
import { installPrompt, keyboardFocus, peek, type StateDef } from './define'
import type { Session } from './session'
import { BROWSE } from './states-browse'
import { HOME_DUE } from './states-home'
import { openReview, reviewSeed } from './states-review'

async function home(s: Session): Promise<void> {
  await s.seed(HOME_DUE)
  await s.open('#/')
  await s.button('복습 시작').waitFor()
}

async function browse(s: Session): Promise<void> {
  await s.seed(BROWSE)
  await s.open('#/browse')
  await s.page.locator('.verse-row').first().waitFor()
}

async function reciteRevealed(s: Session): Promise<void> {
  await openReview(s, reviewSeed('AS1a', 'topic'), '소리 내어 낭송')
  await s.click('정답 보기')
  await s.page.locator('.rating-bar').waitFor()
}

export const SHELL: StateDef[] = [
  {
    id: 'shell-install-prompt',
    screen: 'shell',
    title: '설치 안내(크롬·안드로이드): 설치 버튼 + 닫기, 홈 위',
    how: '홈에서 beforeinstallprompt 이벤트를 보낸다',
    run: async (s) => {
      await home(s)
      await installPrompt(s)
    },
  },
  {
    id: 'shell-install-ios',
    screen: 'shell',
    title: '설치 안내(iOS 사파리): 공유 → 홈 화면에 추가 문구',
    how: 'iPhone 사파리 UA로 홈을 연다',
    ios: true,
    run: async (s) => {
      await home(s)
      await s.see(/홈 화면에 추가/)
    },
  },
  {
    id: 'shell-install-stage',
    screen: 'shell',
    stage: true,
    title: '설치 안내가 복습 무대 위에 붙은 모습',
    how: '복습 첫 장(낭송 주제 카드)에서 beforeinstallprompt',
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic'), '소리 내어 낭송')
      await installPrompt(s)
    },
  },
  {
    id: 'shell-install-dismissed',
    screen: 'shell',
    title: '설치 안내를 닫은 뒤(안내 없음)',
    how: '설치 안내의 닫기',
    run: async (s) => {
      await home(s)
      await installPrompt(s)
      await s.page.getByRole('button', { name: '설치 안내 닫기' }).click()
      await s.page.locator('.install-banner').waitFor({ state: 'detached' })
    },
  },
]

const focus = { screen: 'focus', view: 'focus' } as const

export const FOCUS: StateDef[] = [
  {
    ...focus,
    id: 'focus-primary',
    title: '주 버튼(금색) 포커스 링 — 홈 복습 시작',
    how: '키 입력 뒤 복습 시작에 포커스',
    run: async (s) => {
      await home(s)
      await keyboardFocus(s, s.button('복습 시작'))
    },
  },
  {
    ...focus,
    id: 'focus-secondary',
    title: '보조 버튼 포커스 링 — 홈 다음 구절',
    how: '키 입력 뒤 다음 구절 버튼에 포커스',
    run: async (s) => {
      await home(s)
      await keyboardFocus(s, s.button(/^다음 구절:/))
    },
  },
  {
    ...focus,
    id: 'focus-ghost',
    title: '글자 버튼 포커스 링 — 목록에서 구절 보기',
    how: '키 입력 뒤 목록에서 구절 보기에 포커스',
    run: async (s) => {
      await home(s)
      await keyboardFocus(s, s.button('목록에서 구절 보기'))
    },
  },
  {
    ...focus,
    stage: true,
    id: 'focus-input',
    title: '입력란 포커스 링 — 복습 장절 입력',
    how: '말씀 카드에서 키 입력 뒤 입력란에 포커스',
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'text'), '장절 입력')
      await keyboardFocus(s, s.page.locator('#review-ref'))
    },
  },
  {
    ...focus,
    id: 'focus-tab',
    title: '탭(하단 독·헤더 탭) 포커스 링 — 목록',
    how: '키 입력 뒤 주요 화면 탭의 목록에 포커스',
    run: async (s) => {
      await home(s)
      await keyboardFocus(
        s,
        s.page.locator('nav.tab-nav').getByRole('link', { name: '목록', exact: true }),
      )
    },
  },
  {
    ...focus,
    id: 'focus-col-tab',
    title: '과정 탭 포커스 링 — 목록 8동행',
    how: '목록에서 키 입력 뒤 8동행 탭에 포커스',
    run: async (s) => {
      await browse(s)
      await keyboardFocus(s, s.page.getByRole('tab', { name: /^8동행/ }))
    },
  },
  {
    ...focus,
    id: 'focus-verse-row',
    title: '목록의 구절 줄 포커스 링',
    how: '목록에서 키 입력 뒤 첫 구절 줄에 포커스',
    run: async (s) => {
      await browse(s)
      await keyboardFocus(s, s.page.locator('.verse-row').first())
    },
  },
  {
    ...focus,
    stage: true,
    id: 'focus-rate',
    title: '등급 버튼 포커스 링 — 좋음',
    how: '낭송 정답을 연 뒤 키 입력, 좋음에 포커스',
    run: async (s) => {
      await reciteRevealed(s)
      await keyboardFocus(s, s.page.locator('button.rate-3'))
    },
  },
  {
    ...focus,
    stage: true,
    id: 'focus-chip',
    title: '단어 칩(첫글자 보드 어절) 포커스 링',
    how: '첫글자 보드에서 어절 하나를 엿본 뒤 키 입력, 다음 어절에 포커스',
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic', 'firstLetter'), '첫글자 힌트')
      await peek(s, 1)
      await keyboardFocus(s, s.page.locator('.fl-board button.fl-word').first())
    },
  },
  {
    ...focus,
    id: 'focus-seg',
    title: '세그먼트(화면 테마) 포커스 링',
    how: '설정에서 키 입력 뒤 라이트 버튼에 포커스',
    run: async (s) => {
      await s.open('#/settings')
      await keyboardFocus(s, s.button('라이트'))
    },
  },
]

const hover = { screen: 'hover', pcOnly: true, view: 'keep', hover: true } as const

export const HOVER: StateDef[] = [
  {
    ...hover,
    id: 'hover-primary',
    title: '주 버튼에 마우스를 올린 모습 — 복습 시작',
    how: 'PC 폭에서 복습 시작에 마우스',
    run: async (s) => {
      await home(s)
      await s.button('복습 시작').hover()
    },
  },
  {
    ...hover,
    id: 'hover-secondary',
    title: '보조 버튼에 마우스를 올린 모습 — 다음 구절',
    how: 'PC 폭에서 다음 구절 버튼에 마우스',
    run: async (s) => {
      await home(s)
      await s.button(/^다음 구절:/).hover()
    },
  },
  {
    ...hover,
    id: 'hover-verse-row',
    title: '구절 줄에 마우스를 올린 모습',
    how: 'PC 폭 목록에서 둘째 구절 줄에 마우스',
    run: async (s) => {
      await browse(s)
      await s.page.locator('.verse-row').nth(1).hover()
    },
  },
  {
    ...hover,
    id: 'hover-tab',
    title: '헤더 탭에 마우스를 올린 모습 — 목록',
    how: 'PC 폭 홈에서 헤더의 목록 탭에 마우스',
    run: async (s) => {
      await home(s)
      await s.page
        .locator('nav.tab-nav')
        .getByRole('link', { name: '목록', exact: true })
        .hover()
    },
  },
]

export const CONTRAST: StateDef[] = [
  {
    id: 'contrast-home',
    screen: 'contrast',
    contrast: true,
    title: '고대비 선호에서의 홈(복습 대기)',
    how: 'prefers-contrast: more를 흉내 내고 home-due와 같은 시드',
    run: async (s) => {
      await home(s)
    },
  },
  {
    id: 'contrast-review',
    screen: 'contrast',
    contrast: true,
    stage: true,
    title: '고대비 선호에서의 복습 무대(낭송 정답 연 뒤)',
    how: 'prefers-contrast: more를 흉내 내고 review-recite-topic-revealed와 같은 조작',
    run: async (s) => {
      await reciteRevealed(s)
    },
  },
]
