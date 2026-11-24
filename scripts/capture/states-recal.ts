/** 말씀 상태 개정 (src/views/Recalibrate.tsx — PR #39가 고치는 중이라 찍기만 한다) */
import { type StateDef, vary } from './define'
import { card, DAY, graduate, idsOfCollection, idsOfSection, type Seed, seed } from './seed'
import type { Session } from './session'

const stage = { screen: 'recal', stage: true } as const

/** 개정 판정 차례별 카드 모양 (src/app/recalibrate.ts의 verseRecalibrateKind) */
function verseOf(id: string, kind: 'recite' | 'future' | 'audit'): Partial<Seed> {
  if (kind === 'future') return graduate([id], { due: 3 * DAY })
  if (kind === 'recite') return graduate([id], { due: -2 * DAY })
  // 주제·장절 카드가 5회째 감사 차례(타이핑), 말씀 카드는 장절 입력 — 낭송 차례가 없다
  return seed(graduate([id], { due: -2 * DAY }), {
    cards: [card(id, 'topic', -2 * DAY, 'typing'), card(id, 'ref', -2 * DAY, 'typing')],
  })
}

/** 단원을 골라 첫 구절의 무대로 */
async function startUnit(s: Session, sd: Partial<Seed>, unit: RegExp): Promise<void> {
  await s.seed(sd)
  await s.open('#/recalibrate')
  await s.page.getByRole('button', { name: unit }).click()
  await s.page.locator('.card-code').waitFor()
}

const AS = /^그리스도인의 확신/

/** 구절 하나가 든 단원: 5확신이면 AS, 가장 긴·짧은 구절이면 DEP 4 */
const unitOf = (id: string): RegExp => (id.startsWith('AS') ? AS : /^DEP 4\./)

async function reveal(s: Session): Promise<void> {
  await s.click(/^본문 확인/)
  await s.page.locator('.recal-verdicts').waitFor()
}

/** 판정 하나 — 다음 구절(n / total 완료) 또는 완료 장면까지 */
async function judge(s: Session, label: RegExp, after: string | RegExp): Promise<void> {
  await s.button(label).click()
  await s.see(after)
}

export const RECAL: StateDef[] = [
  {
    id: 'recal-loading',
    screen: 'recal',
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 #/recalibrate',
    stall: true,
    run: async (s) => {
      await s.open('#/recalibrate', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  {
    id: 'recal-picker-empty',
    screen: 'recal',
    title: '단원 고르기: 개정할 것이 없을 때의 안내 + 비활성 줄 20개',
    how: '시드 없이 #/recalibrate',
    run: async (s) => {
      await s.open('#/recalibrate')
      await s.page.locator('.recal-empty').waitFor()
    },
  },
  {
    id: 'recal-picker',
    screen: 'recal',
    title: '단원 고르기: 보조 표기(N구절, 밀린 카드 M장)와 비활성 줄',
    how: '5확신 5구절(2구절 밀림)과 DEP 1 네 구절 졸업',
    run: async (s) => {
      await s.seed(
        seed(
          graduate(idsOfCollection('AS'), { due: 3 * DAY }),
          graduate(['AS1a', 'AS2a'], { due: -2 * DAY }),
          graduate(idsOfSection('D1').slice(0, 4), { due: 3 * DAY }),
        ),
      )
      await s.open('#/recalibrate')
      await s.see('5구절, 밀린 카드 6장')
    },
  },
  ...vary(
    {
      ...stage,
      id: 'recal-covered',
      verse: 'AS1a',
      title: '무대: 본문 가린 상태(주제·장절, 떠올리기 안내, 본문 확인)',
      how: '기한 지난 낭송 차례 구절 하나가 든 단원을 고른다',
    },
    (v) => async (s) => {
      await startUnit(s, verseOf(v, 'recite'), unitOf(v))
      await s.button(/^본문 확인/).waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'recal-revealed',
      verse: 'AS1a',
      title: '무대: 본문 연 상태(낭송의 틀) + 판정 버튼 셋',
      how: '위 상태에서 본문 확인',
    },
    (v) => async (s) => {
      await startUnit(s, verseOf(v, 'recite'), unitOf(v))
      await reveal(s)
    },
  ),
  {
    ...stage,
    id: 'recal-audit',
    title: "무대: '객관 채점 차례 · 자가 판정 유보' 표지가 붙은 카드(가린 상태)",
    how: '주제·장절 카드가 타이핑 감사 차례인 구절',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'audit'), AS)
      await s.page.locator('.recal-mode-tag').waitFor()
    },
  },
  {
    ...stage,
    id: 'recal-audit-revealed',
    title: '무대: 객관 채점 차례 카드의 본문 + 힌트 문구 + 버튼 둘',
    how: '위 상태에서 본문 확인',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'audit'), AS)
      await s.page.locator('.recal-mode-tag').waitFor()
      await reveal(s)
      await s.page.locator('.recal-hint').waitFor()
    },
  },
  {
    ...stage,
    id: 'recal-future-revealed',
    title: '무대: 기한 전 구절의 본문 + 힌트 문구(기존 일정 유지)',
    how: '카드가 모두 사흘 뒤 due인 구절에서 본문 확인',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'future'), AS)
      await reveal(s)
      await s.see(/아직 복습 기한 전입니다/)
    },
  },
  {
    ...stage,
    id: 'recal-none',
    title: '무대: 이미 사다리로 돌아갔거나 카드가 없는 구절(다음 구절 버튼)',
    how: '두 구절 단원을 시작한 뒤 둘째 구절의 카드를 지우고 첫 구절을 판정',
    run: async (s) => {
      await startUnit(s, seed(verseOf('AS1a', 'recite'), verseOf('AS2a', 'recite')), AS)
      await s.deleteCards(['AS2a:topic', 'AS2a:ref', 'AS2a:text'])
      await reveal(s)
      await judge(s, /온전히 기억남/, /이미 사다리 단계로 돌아갔거나/)
    },
  },
  {
    ...stage,
    id: 'recal-notice-stale',
    title: '무대: 안내 문구(role=status) — 다른 탭·동기화로 카드가 바뀌어 다시 불러옴',
    how: '본문을 연 뒤, 판정 커밋 바로 앞에 카드가 고쳐 쓰이게 하고 온전히 기억남',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'recite'), AS)
      await reveal(s)
      await s.arm('stale')
      await judge(s, /온전히 기억남/, /최신 상태로 다시 불러왔습니다/)
    },
  },
  {
    ...stage,
    id: 'recal-notice-failed',
    title: '무대: 안내 문구(role=status) — 상태를 저장하지 못했습니다',
    how: '본문을 연 뒤, 판정 커밋 트랜잭션이 열리지 않게 하고 온전히 기억남',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'recite'), AS)
      await reveal(s)
      await s.arm('fail')
      await judge(s, /온전히 기억남/, /상태를 저장하지 못했습니다/)
    },
  },
  {
    ...stage,
    id: 'recal-done',
    title: '개정 완료 장면(등불): 판정 셋의 합계 + 유보·유지·남김 문구 셋 + 다음 파트 버튼',
    how: '5확신 다섯 구절(낭송·기한 전·감사 차례·가물·잊음)을 차례로 판정, 8동행에 졸업 구절',
    run: async (s) => {
      await startUnit(
        s,
        seed(
          verseOf('AS1a', 'recite'),
          verseOf('AS2a', 'future'),
          verseOf('AS3a', 'audit'),
          verseOf('AS4a', 'recite'),
          verseOf('AS5a', 'recite'),
          graduate(['LV1a']),
        ),
        AS,
      )
      await reveal(s)
      await judge(s, /온전히 기억남/, '1 / 5 완료')
      await reveal(s)
      await judge(s, /온전히 기억남/, '2 / 5 완료')
      await s.page.locator('.recal-mode-tag').waitFor()
      await reveal(s)
      await judge(s, /복습 큐에 남기고 넘어가기/, '3 / 5 완료')
      await reveal(s)
      await judge(s, /가물가물함/, '4 / 5 완료')
      await reveal(s)
      await judge(s, /다시 사다리 타기/, /개정 완료$/)
      await s.button(/^다음 파트 개정하기:/).waitFor()
    },
  },
  {
    ...stage,
    id: 'recal-done-last',
    title: '개정 완료 장면: 합계만(문구 없음), 다음 파트 없음',
    how: '졸업 구절이 하나뿐인 상태에서 다시 사다리 타기',
    run: async (s) => {
      await startUnit(s, verseOf('AS1a', 'recite'), AS)
      await reveal(s)
      await judge(s, /다시 사다리 타기/, /개정 완료$/)
      await s.button('홈으로 가기').waitFor()
    },
  },
]
