/** 설정 (src/views/Settings.tsx, src/views/settings/panels.tsx) */
import type { Route } from '@playwright/test'

import { RELAY_URL, type StateDef } from './define'
import {
  at,
  card,
  DAY,
  goal,
  graduate,
  HOUR,
  idsOfCollection,
  log,
  MIN,
  NOW,
  progress,
  seed,
  todayLogs,
} from './seed'
import type { Session } from './session'

const PAIRING = 'section.panel:has(#pair-input)'
const SYNC = 'details.tech-details'
const DATA = 'section.panel:has(.danger-zone)'

/** 기록 숫자가 있는 기기: 12구절 졸업, 복습 기록 30줄, 목표 진행 중·정착 기간 7일, 지난 동기화 */
const FILLED = seed(
  graduate([...idsOfCollection('AS'), ...idsOfCollection('LV').slice(0, 7)], { due: 2 * DAY }),
  { reviews: Array.from({ length: 30 }, (_, i) => log('AS1a:topic', -(i + 1) * DAY)) },
  goal({ date: '2027-02-26', buffer: 7 }),
)

/** 백업·연동으로 받는 번들 — 다른 기기의 8동행 한 구절 */
const BUNDLE = {
  app: 'scripture-memory',
  version: 2,
  exportedAt: at(-HOUR),
  cards: ['topic', 'ref', 'text'].map((d) => card('LV8a', d as 'topic', 3 * DAY)),
  reviews: [log('LV8a:topic', -2 * DAY), log('LV8a:ref', -2 * DAY)],
  learning: [progress('LV8a', 'graduated', -9 * DAY)],
}

async function openSettings(s: Session, sd = seed()): Promise<void> {
  await s.seed(sd)
  await s.open('#/settings')
  await s.page.getByRole('heading', { name: '화면 테마' }).waitFor()
}

/** 연동 서버 흉내 — POST(코드 올리기)·GET(코드로 받기) 응답을 정한다. 'hang'은 응답하지 않는다 */
async function relay(
  s: Session,
  post: number | 'hang',
  get: number | 'hang' = 404,
): Promise<void> {
  await s.page.route(`${RELAY_URL}/**`, async (route: Route) => {
    const status = route.request().method() === 'POST' ? post : get
    if (status === 'hang') return
    await route.fulfill({
      status,
      contentType: 'application/json',
      body:
        status === 200 && route.request().method() === 'GET' ? JSON.stringify(BUNDLE) : '{}',
    })
  })
}

/** GitHub Gist API 흉내 */
async function gist(s: Session, get: number | 'hang'): Promise<void> {
  await s.page.route('https://api.github.com/**', async (route: Route) => {
    if (get === 'hang') return
    const body = route.request().method() === 'GET' ? JSON.stringify({ files: {} }) : '{}'
    await route.fulfill({ status: get, contentType: 'application/json', body })
  })
}

const SYNC_SEED = seed({
  settings: [
    { key: 'syncToken', value: 'capture-token-not-real' },
    { key: 'syncGistId', value: '0123456789abcdef0123456789abcdef' },
    { key: 'lastSyncAt', value: at(-26 * HOUR) },
  ],
})

async function openSync(s: Session, sd = SYNC_SEED): Promise<void> {
  await openSettings(s, sd)
  await s.page.locator(`${SYNC} > summary`).click()
  await s.page.locator('#sync-token').waitFor()
}

const relayState = { screen: 'settings', build: 'relay', view: PAIRING } as const

async function makeCode(s: Session): Promise<void> {
  await relay(s, 201)
  await openSettings(s)
  await s.click('코드 만들기')
  await s.page.locator('.pair-code').waitFor()
}

export const SETTINGS: StateDef[] = [
  {
    id: 'settings-loading',
    screen: 'settings',
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 설정 탭',
    stall: true,
    run: async (s) => {
      await s.open('#/settings', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  {
    id: 'settings',
    screen: 'settings',
    title:
      '빈 기기: 기록 0, 고른 테마 눌림, 목표일 지남 요약, 연동 꺼진 빌드, 고급 접힘, 데이터, 정보',
    how: '시드 없이 설정 탭(테마는 찍는 테마로 저장되어 있다)',
    run: async (s) => {
      await openSettings(s)
    },
  },
  {
    id: 'settings-filled',
    screen: 'settings',
    title: '기록 숫자 있음, 목표 진행 중 요약(D-day) + 정착 기간 문구',
    how: '12구절 졸업·복습 30회, 목표일 2027-02-26·정착 기간 7일',
    run: async (s) => {
      await openSettings(s, FILLED)
      await s.see(/^D-\d+, 남은/)
    },
  },
  {
    id: 'settings-theme-auto',
    screen: 'settings',
    title: "화면 테마 '자동' 눌림 — OS 설정(다크/라이트)을 따른다",
    how: 'localStorage theme을 지우고 OS 색 구성표를 찍는 테마로 흉내',
    autoTheme: true,
    view: 'section.panel:has(.seg-row)',
    run: async (s) => {
      await openSettings(s)
      await s.page.locator('.seg.active', { hasText: '자동' }).waitFor()
    },
  },
  {
    id: 'settings-goal-complete',
    screen: 'settings',
    title: '암송 목표: 범위를 다 외운 요약(범위를 넓혀 보세요)',
    how: '범위 5확신·목표일 2027-02-26, 5확신 졸업',
    view: 'section.panel:has(#goal-scope)',
    run: async (s) => {
      await openSettings(
        s,
        seed(graduate(idsOfCollection('AS')), goal({ date: '2027-02-26', scope: 'AS' })),
      )
      await s.see(/범위를 넓혀 보세요/)
    },
  },
  {
    id: 'settings-goal-saved',
    screen: 'settings',
    title: '목표 범위를 바꾼 뒤: 요약 갱신 + 저장 안내 문구(데이터 칸 아래)',
    how: '목표 범위를 60구절까지로 고른다',
    view: DATA,
    run: async (s) => {
      await openSettings(s, FILLED)
      await s.page.locator('#goal-scope').selectOption('TMS60')
      await s.see('목표 범위를 저장했습니다.')
    },
  },
  {
    id: 'settings-data',
    screen: 'settings',
    title: '데이터 및 학습: 말씀 상태 개정 줄, 백업 두 버튼, 위험 구역(초기화)',
    how: '설정 탭에서 데이터 칸으로 스크롤',
    view: DATA,
    run: async (s) => {
      await openSettings(s)
    },
  },
  {
    id: 'settings-export',
    screen: 'settings',
    title: '백업 결과 문구: 백업 파일을 내려받았습니다',
    how: '내보내기 (JSON)',
    view: DATA,
    run: async (s) => {
      await openSettings(s, FILLED)
      await s.click(/^내보내기/)
      await s.see('백업 파일을 내려받았습니다.')
    },
  },
  {
    id: 'settings-import',
    screen: 'settings',
    title: '가져오기 결과 문구: 가져오기 완료',
    how: '파일 입력에 올바른 백업 번들을 넣는다',
    view: DATA,
    run: async (s) => {
      await openSettings(s)
      await s.page.locator('input[type=file]').setInputFiles({
        name: 'tms-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(BUNDLE)),
      })
      await s.see('가져오기 완료.')
    },
  },
  {
    id: 'settings-import-failed',
    screen: 'settings',
    title: '가져오기 결과 문구: 가져오기 실패(오류 안내)',
    how: '파일 입력에 다른 앱의 JSON을 넣는다',
    view: DATA,
    run: async (s) => {
      await openSettings(s)
      await s.page.locator('input[type=file]').setInputFiles({
        name: 'other.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"app":"other"}'),
      })
      await s.see(/^가져오기 실패:/)
    },
  },
  {
    id: 'settings-reset',
    screen: 'settings',
    title: '초기화 결과 문구: 초기화했습니다(기록 0으로)',
    how: '초기화 → 확인 대화상자 수락',
    view: DATA,
    run: async (s) => {
      await openSettings(s, FILLED)
      s.page.once('dialog', (d) => void d.accept())
      await s.click('초기화')
      await s.see('초기화했습니다.')
    },
  },
  {
    id: 'settings-pairing-off',
    screen: 'settings',
    title: '간편 기기 연동: 연동 서버 주소가 없는 빌드(버튼·입력 꺼짐)',
    how: '기본 빌드(VITE_PAIRING_RELAY_URL 없음)의 설정에서 연동 칸',
    view: PAIRING,
    run: async (s) => {
      await openSettings(s)
      await s.see(/연동 서버 주소가 설정되지 않아/)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-on',
    title: '간편 기기 연동: 켜진 빌드의 처음(코드 만들기 켜짐, 연동하기 꺼짐)',
    how: '연동 서버 주소를 넣은 빌드의 설정',
    run: async (s) => {
      await openSettings(s)
      await s.button('코드 만들기').waitFor()
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-creating',
    title: '간편 기기 연동: 코드 만드는 중…',
    how: '연동 서버가 응답하지 않게 두고 코드 만들기',
    run: async (s) => {
      await relay(s, 'hang')
      await openSettings(s)
      await s.click('코드 만들기')
      await s.button('코드 만드는 중…').waitFor()
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-code',
    title: '간편 기기 연동: 코드 만든 뒤 점선 상자(코드·만료 시각·코드 복사), 새 코드 만들기',
    how: '연동 서버가 201로 받게 하고 코드 만들기',
    run: async (s) => {
      await makeCode(s)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-copied',
    title: '간편 기기 연동: 코드를 복사했습니다',
    how: '코드 만든 뒤 코드 복사(클립보드 쓰기 성공으로)',
    run: async (s) => {
      await makeCode(s)
      await s.page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.resolve()
      })
      await s.click('코드 복사')
      await s.see('코드를 복사했습니다.')
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-copy-failed',
    title: '간편 기기 연동: 복사하지 못했습니다(직접 옮겨 적기 안내)',
    how: '코드 만든 뒤 코드 복사(클립보드 쓰기 실패로)',
    run: async (s) => {
      await makeCode(s)
      await s.page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('막힘'))
      })
      await s.click('코드 복사')
      await s.see(/복사하지 못했습니다/)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-expired',
    title: '간편 기기 연동: 코드가 만료되었습니다',
    how: '코드 만든 뒤 고정 시계를 11분 뒤로 옮긴다',
    run: async (s) => {
      await makeCode(s)
      await s.page.clock.setFixedTime(new Date(NOW.getTime() + 11 * MIN))
      await s.see(/코드가 만료되었습니다/)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-create-failed',
    title: '간편 기기 연동: 코드 만들기 실패 문구',
    how: '연동 서버가 500으로 답하게 하고 코드 만들기',
    run: async (s) => {
      await relay(s, 500)
      await openSettings(s)
      await s.click('코드 만들기')
      await s.see(/^코드 만들기 실패:/)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-input',
    title: '간편 기기 연동: 다른 기기 코드 입력(연동하기 켜짐)',
    how: "입력란에 'ABC-DEF'",
    run: async (s) => {
      await openSettings(s)
      await s.page.locator('#pair-input').fill('ABC-DEF')
      await s.page.locator('button:has-text("연동하기"):enabled').waitFor()
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-applying',
    title: '간편 기기 연동: 연동 중…(가져오는 중 문구)',
    how: '연동 서버가 응답하지 않게 두고 코드 입력 → 연동하기',
    run: async (s) => {
      await relay(s, 201, 'hang')
      await openSettings(s)
      await s.page.locator('#pair-input').fill('ABC-DEF')
      await s.click('연동하기')
      await s.button('연동 중…').waitFor()
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-done',
    title: '간편 기기 연동: 연동 완료 문구(복습·카드·학습 수)',
    how: '연동 서버가 번들을 돌려주게 하고 코드 입력 → 연동하기',
    run: async (s) => {
      await relay(s, 201, 200)
      await openSettings(s, FILLED)
      await s.page.locator('#pair-input').fill('ABC-DEF')
      await s.click('연동하기')
      await s.see(/^연동 완료:/)
    },
  },
  {
    ...relayState,
    id: 'settings-pairing-failed',
    title: '간편 기기 연동: 연동 실패 문구(코드 없음·만료)',
    how: '연동 서버가 404로 답하게 하고 코드 입력 → 연동하기',
    run: async (s) => {
      await relay(s, 201, 404)
      await openSettings(s)
      await s.page.locator('#pair-input').fill('ABC-DEF')
      await s.click('연동하기')
      await s.see(/^연동 실패:/)
    },
  },
  {
    id: 'settings-sync-open',
    screen: 'settings',
    title: '고급(Gist 동기화) 펼친 모습: 빈 입력, 지금 동기화 꺼짐',
    how: '고급 접힘 줄을 연다',
    view: SYNC,
    run: async (s) => {
      await openSync(s, seed())
    },
  },
  {
    id: 'settings-sync-filled',
    screen: 'settings',
    title: '고급 펼침: 토큰·Gist ID 저장됨 + 마지막 동기화 표기',
    how: '토큰·Gist ID·마지막 동기화 시각을 시드하고 고급을 연다',
    view: SYNC,
    run: async (s) => {
      await openSync(s)
      await s.see(/^마지막 동기화:/)
    },
  },
  {
    id: 'settings-sync-busy',
    screen: 'settings',
    title: '고급: 동기화 중…',
    how: 'GitHub API가 응답하지 않게 두고 지금 동기화',
    view: SYNC,
    run: async (s) => {
      await gist(s, 'hang')
      await openSync(s)
      await s.click('지금 동기화')
      await s.button('동기화 중…').waitFor()
    },
  },
  {
    id: 'settings-sync-done',
    screen: 'settings',
    title: '고급: 동기화 완료 문구',
    how: 'GitHub API가 빈 Gist를 돌려주게 하고 지금 동기화',
    view: SYNC,
    run: async (s) => {
      await gist(s, 200)
      await openSync(s, seed(SYNC_SEED, FILLED, { reviews: todayLogs(2) }))
      await s.click('지금 동기화')
      await s.see(/^동기화 완료:/)
    },
  },
  {
    id: 'settings-sync-failed',
    screen: 'settings',
    title: '고급: 동기화 실패 문구',
    how: 'GitHub API가 404로 답하게 하고 지금 동기화',
    view: SYNC,
    run: async (s) => {
      await gist(s, 404)
      await openSync(s)
      await s.click('지금 동기화')
      await s.see(/^실패:/)
    },
  },
]
