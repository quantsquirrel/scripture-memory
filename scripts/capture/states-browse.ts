/** 목록 (src/views/Browse.tsx, src/views/browse/panels.tsx) */
import type { StateDef } from './define'
import {
  DAY,
  graduate,
  HOUR,
  idsOfCollection,
  idsOfSection,
  progress,
  seed,
  verse,
} from './seed'
import type { Session } from './session'

/**
 * 5확신 탭 하나에 구절 상태 다섯이 다 보이게: N일 후 · 복습 대기 · 암송 중(카드 없음) ·
 * 학습 2/4 · 미학습. 다른 과정에도 몇 구절씩 진도를 둔다(완료 수 표기).
 */
export const BROWSE = seed(
  graduate(['AS1a'], { due: 4 * DAY }),
  graduate(['AS2a'], { due: -HOUR }),
  graduate(['AS3a'], { cards: false }),
  { learning: [progress('AS4a', 'firstLetter'), progress('LV1a', 'typing')] },
  graduate(idsOfCollection('LV').slice(1, 5), { due: 2 * DAY }),
  graduate(idsOfSection('A'), { due: 6 * DAY }),
  graduate(idsOfSection('B').slice(0, 2), { due: -HOUR }),
  graduate(idsOfSection('D1'), { due: 3 * DAY }),
  graduate(idsOfSection('D2').slice(0, 6), { due: -2 * DAY }),
  graduate(idsOfCollection('TMS180').slice(0, 4), { due: 9 * DAY }),
)

async function openBrowse(s: Session, tab?: string): Promise<void> {
  await s.seed(BROWSE)
  await s.open('#/browse')
  if (tab !== undefined) {
    await s.page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
  }
  await s.page.locator('.col-tab.active').waitFor()
}

/** 구절 줄을 펼친다 */
async function openRow(s: Session, verseId: string, action: string): Promise<void> {
  const ref = verse(verseId).refAbbr
  await s.page
    .locator('.verse-item')
    .filter({ has: s.page.locator('.verse-row-ref', { hasText: ref }) })
    .locator('.verse-row')
    .click()
  await s.button(action).waitFor()
}

const TABS = [
  [
    'as',
    '5확신',
    '구절 상태 다섯(N일 후·복습 대기·암송 중·학습 2/4·미학습), 묶음·부제 없는 섹션',
  ],
  ['lv', '8동행', '학습 3/4 줄, 부제 없는 섹션'],
  ['tms60', '60구절', '부제가 있는 섹션 다섯, 주제마다 구절 둘'],
  ['dep', 'DEP242', '묶음 제목(group)이 있는 섹션, 가장 긴 목록'],
  ['tms180', '180구절', '부제가 있는 섹션, 진도 조금'],
] as const

export const BROWSE_STATES: StateDef[] = [
  {
    id: 'browse-loading',
    screen: 'browse',
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 목록 탭',
    stall: true,
    run: async (s) => {
      await s.open('#/browse', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  ...TABS.map(([key, short, what]): StateDef => ({
    id: `browse-tab-${key}`,
    screen: 'browse',
    title: `과정 탭 '${short}' 고름: ${what}, 완료 수 표기`,
    how: `진도 섞인 시드에서 '${short}' 탭`,
    run: async (s) => {
      await openBrowse(s, key === 'as' ? undefined : short)
    },
  })),
  {
    id: 'browse-open-new',
    screen: 'browse',
    title: '펼친 구절(미학습): 본문 + 학습 시작',
    how: '5확신 탭에서 AS5a 줄을 펼친다',
    view: '.verse-item:has(.verse-detail)',
    run: async (s) => {
      await openBrowse(s)
      await openRow(s, 'AS5a', '학습 시작')
    },
  },
  {
    id: 'browse-open-learning',
    screen: 'browse',
    title: '펼친 구절(학습 중): 본문 + 학습 이어가기',
    how: '5확신 탭에서 AS4a(학습 2/4) 줄을 펼친다',
    view: '.verse-item:has(.verse-detail)',
    run: async (s) => {
      await openBrowse(s)
      await openRow(s, 'AS4a', '학습 이어가기')
    },
  },
  {
    id: 'browse-open-done',
    screen: 'browse',
    title: '펼친 구절(졸업): 본문 + 다시 훈련',
    how: '5확신 탭에서 AS1a(N일 후) 줄을 펼친다',
    view: '.verse-item:has(.verse-detail)',
    run: async (s) => {
      await openBrowse(s)
      await openRow(s, 'AS1a', '다시 훈련')
    },
  },
]
