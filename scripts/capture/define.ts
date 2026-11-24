/** 상태 정의의 모양과 여러 화면이 함께 쓰는 조작 */
import type { Locator } from '@playwright/test'

import { LONG, SHORT } from './seed'
import type { Session } from './session'

export type Screen =
  | 'shell'
  | 'home'
  | 'review'
  | 'learn'
  | 'browse'
  | 'settings'
  | 'recal'
  | 'focus'
  | 'hover'
  | 'contrast'

export const SCREENS: Record<Screen, string> = {
  shell: '셸 · 설치 안내',
  home: '홈',
  review: '복습',
  learn: '새 구절 학습',
  browse: '목록',
  settings: '설정',
  recal: '말씀 상태 개정',
  focus: '키보드 포커스',
  hover: '마우스 올림 (PC)',
  contrast: '고대비 (prefers-contrast: more)',
}

export interface StateDef {
  /** 화면-상태. 뒤 노드가 같은 id로 전후를 맞춘다 */
  id: string
  screen: Screen
  /** 한 줄 설명 */
  title: string
  /** 도달 방법 요약 */
  how: string
  /** 무대 화면 — 360×640도 찍는다 */
  stage?: boolean
  /** PC 폭만 — 폰에는 hover가 없다(hover: none) */
  pcOnly?: boolean
  /** 뷰포트 캡처 전 스크롤: 'top'(기본), 요소 CSS 선택자, 'focus'(포커스한 요소), 'keep' */
  view?: string
  /** 'relay': 연동 서버 주소(VITE_PAIRING_RELAY_URL)를 넣은 빌드에서 */
  build?: 'relay'
  /** iOS 사파리 흉내(UA) */
  ios?: boolean
  /** IndexedDB 열기를 멈춘다 — 불러오는 중 */
  stall?: boolean
  /** 테마를 '자동'으로 두고 OS 설정(colorScheme)이 고르게 한다 */
  autoTheme?: boolean
  /** prefers-contrast: more */
  contrast?: boolean
  run: (s: Session) => Promise<void>
}

/** 연동 서버 주소 — 실제로 닿지 않는다(.invalid). 요청은 상태 정의가 page.route로 받는다 */
export const RELAY_URL = 'https://relay.capture.invalid'

type Make = (verseId: string) => (s: Session) => Promise<void>

/**
 * 말씀이 나오는 무대 상태를 기본 구절, 가장 긴 구절, 가장 짧은 구절로 늘린다.
 * id 끝에 -long, -short가 붙는다.
 */
export function vary(
  base: Omit<StateDef, 'run'> & { verse: string; skip?: readonly ('long' | 'short')[] },
  make: Make,
): StateDef[] {
  const { verse, skip = [], ...def } = base
  const out: StateDef[] = [{ ...def, run: make(verse) }]
  if (!skip.includes('long')) {
    out.push({
      ...def,
      id: `${def.id}-long`,
      title: `${def.title} — 가장 긴 구절(대상 29:11-13, 221자)`,
      run: make(LONG),
    })
  }
  if (!skip.includes('short')) {
    out.push({
      ...def,
      id: `${def.id}-short`,
      title: `${def.title} — 가장 짧은 구절(살전 5:17, 10자)`,
      run: make(SHORT),
    })
  }
  return out
}

/** 첫글자 보드에서 앞 어절부터 n개를 엿본다 */
export async function peek(s: Session, n: number): Promise<void> {
  const board = s.page.locator('.fl-board')
  for (let i = 0; i < n; i++) await board.locator('button.fl-word').first().click()
}

/** 키보드로 옮겨 간 것처럼 포커스한다 — 키 입력 뒤의 포커스는 :focus-visible 링을 띄운다 */
export async function keyboardFocus(s: Session, target: Locator): Promise<void> {
  await s.page.keyboard.press('Shift')
  await target.focus()
}

/** 설치 안내를 부른다 — 크롬·안드로이드의 beforeinstallprompt */
export async function installPrompt(s: Session): Promise<void> {
  await s.page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(e, {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(e)
  })
  await s.see('홈 화면에 앱 설치하기')
}
