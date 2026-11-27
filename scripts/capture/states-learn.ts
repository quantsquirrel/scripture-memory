/** 새 구절 학습 (src/views/Learn.tsx, src/views/learn/*) */
import { peek, type StateDef, vary } from './define'
import {
  ALL_IDS,
  graduate,
  idsOfCollection,
  LONG,
  oneOff,
  partial,
  progress,
  seed,
  verse,
} from './seed'
import { type Session, settle } from './session'
import { scrollCard } from './states-review'

const stage = { screen: 'learn', stage: true } as const

/**
 * 무대 카드의 스타일을 한 번 다시 계산하게 한다 — 쓰이지 않는 사용자 속성을 적을 뿐이라 보이는 것은 그대로다.
 * 등장한 뒤에 스타일이 다시 계산된 카드는 Chromium이 다르게 그려, 모서리의 안티에일리어싱이 1~3/255
 * 달라진다. 그 재계산이 실행에 따라 일어나기도 아니기도 하는 상태에서 미리 한 번 일으켜 둔다.
 */
async function restyleCard(s: Session): Promise<void> {
  await settle(s.page)
  await s.page.locator('.stage-card').evaluate((card) => {
    card.style.setProperty('--capture-restyled', '1')
  })
}

/** 1단계에서 시작해 2단계 보드까지 */
async function toBoard(s: Session, v: string): Promise<void> {
  await s.open(`#/learn/${v}`)
  await s.click('낭송했어요, 다음으로')
  await s.page.locator('.fl-board').waitFor()
}

/** 저장된 타이핑 단계로 들어온다 */
async function toTyping(s: Session, v: string): Promise<void> {
  await s.seed(seed({ learning: [progress(v, 'typing')] }))
  await s.open(`#/learn/${v}`)
  await s.page.locator('#learn-typing').waitFor()
}

/** 채점하고, 정확도 칸이 기대한 등급(완벽 good·90% 이상 warn·그 아래 bad)인지까지 */
async function gradeTyping(
  s: Session,
  text: string,
  score: 'good' | 'warn' | 'bad',
): Promise<void> {
  await s.page.locator('#learn-typing').fill(text)
  await s.click('채점 (word-perfect 통과)')
  await s.page.locator(`.diff-view .diff-score.${score}`).waitFor()
}

export const LEARN: StateDef[] = [
  {
    id: 'learn-loading',
    screen: 'learn',
    stage: true,
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 #/learn/AS1a',
    stall: true,
    run: async (s) => {
      await s.open('#/learn/AS1a', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  {
    id: 'learn-missing',
    screen: 'learn',
    title: '없는 구절 id: 구절을 찾을 수 없습니다 카드와 홈으로',
    how: '#/learn/NOPE',
    run: async (s) => {
      await s.open('#/learn/NOPE')
      await s.page.getByRole('heading', { name: '구절을 찾을 수 없습니다' }).waitFor()
      await s.button('홈으로').waitFor()
    },
  },
  ...vary(
    {
      ...stage,
      id: 'learn-intro',
      verse: 'AS1a',
      title: '1단계 본문 익히기: 장절·말씀·장절, 낭송 규칙 안내',
      how: '시드 없이 #/learn/<구절>',
    },
    (v) => async (s) => {
      await s.open(`#/learn/${v}`)
      await s.button('낭송했어요, 다음으로').waitFor()
    },
  ),
  {
    ...stage,
    id: 'learn-intro-long-end',
    view: 'keep',
    title: '1단계: 가장 긴 구절을 카드 안에서 끝까지 내린 모습(닫는 장절과 낭송 규칙)',
    how: '#/learn/<가장 긴 구절>을 열고 카드를 맨 아래로 스크롤',
    run: async (s) => {
      await s.open(`#/learn/${LONG}`)
      await s.button('낭송했어요, 다음으로').waitFor()
      await scrollCard(s)
    },
  },
  {
    ...stage,
    id: 'learn-intro-duplicate',
    view: 'keep',
    title:
      '1단계 + 다른 과정에서 이미 암송한 구절 안내(타이핑 검증으로 건너뛰기) — 가장 긴 구절',
    how: 'D4-28a를 졸업시킨 뒤 같은 장절인 T1-17a를 열고, 카드 안에서 안내까지 내린다',
    run: async (s) => {
      await s.seed(graduate(['D4-28a']))
      await s.open('#/learn/T1-17a')
      await s.button('타이핑 검증으로 건너뛰기').waitFor()
      // 이 카드는 그 재계산이 기기가 바쁠 때 열두 번에 한 번쯤만 일어나, PC·390 그림의 카드 모서리가 흔들렸다
      await restyleCard(s)
      await scrollCard(s, '.callout:has(button)')
    },
  },
  ...vary(
    {
      ...stage,
      id: 'learn-fl',
      verse: 'AS1a',
      title: '2단계 첫글자 복원: 보드 처음(낭송 완료에 등불)',
      how: '1단계에서 낭송했어요',
    },
    (v) => async (s) => {
      await toBoard(s, v)
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-fl-peeked',
      verse: 'AS1a',
      title: '2단계: 어절 둘을 엿본 보드',
      how: '보드의 앞 어절 둘을 탭',
    },
    (v) => async (s) => {
      await toBoard(s, v)
      await peek(s, 2)
      await s.see('엿보기 2회')
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-fl-failed',
      verse: 'AS1a',
      title: "2단계 실패 안내(엿보기 3회): 등불이 '본문 다시 보기'로 옮겨 감",
      how: '어절 셋을 엿보고 낭송 완료',
    },
    (v) => async (s) => {
      await toBoard(s, v)
      await peek(s, 3)
      await s.click('낭송 완료')
      await s.page.getByRole('status').filter({ hasText: '엿보기 3회' }).waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-fl-reread',
      verse: 'AS1a',
      title: '2단계: 본문 다시 보기를 연 화면(본문 가리고 다시 도전)',
      how: '보드에서 본문 다시 보기',
    },
    (v) => async (s) => {
      await toBoard(s, v)
      await s.click('본문 다시 보기')
      await s.button('본문 가리고 다시 도전').waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-fl-resumed',
      verse: 'AS1a',
      title: '2단계: 저장된 단계로 다시 들어왔을 때(본문부터)',
      how: '사다리 기록을 firstLetter로 두고 #/learn/<구절>',
    },
    (v) => async (s) => {
      await s.seed(seed({ learning: [progress(v, 'firstLetter')] }))
      await s.open(`#/learn/${v}`)
      await s.button('본문 가리고 다시 도전').waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-typing',
      verse: 'AS1a',
      title: '3단계 타이핑 검증: 빈 입력(채점 버튼 꺼짐)',
      how: '사다리 기록을 typing으로 두고 #/learn/<구절>',
    },
    (v) => async (s) => {
      await toTyping(s, v)
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-typing-input',
      verse: 'AS1a',
      title: '3단계: 입력 중(앞 절반)',
      how: '입력란에 본문 앞 어절 절반(포커스 유지)',
    },
    (v) => async (s) => {
      await toTyping(s, v)
      await s.page.locator('#learn-typing').fill(partial(verse(v).text, 0.5))
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-typing-perfect',
      verse: 'AS1a',
      title: '3단계: 완벽(졸업하고 복습 큐에 추가)',
      how: '본문 그대로 입력하고 채점',
    },
    (v) => async (s) => {
      await toTyping(s, v)
      await gradeTyping(s, verse(v).text, 'good')
      await s.button('졸업하고 복습 큐에 추가').waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-typing-close',
      verse: 'AS1a',
      skip: ['short'],
      title: '3단계: 조금 틀림(90% 이상) — 다시 도전·그냥 넘어가기',
      how: '가운데 글자 하나를 바꿔 입력하고 채점',
    },
    (v) => async (s) => {
      await toTyping(s, v)
      await gradeTyping(s, oneOff(verse(v).text), 'warn')
      await s.button('그냥 넘어가기').waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-typing-wrong',
      verse: 'AS1a',
      title: '3단계: 많이 틀림 — 다시 도전·그냥 넘어가기',
      how: '앞 어절 40%만 입력하고 채점',
    },
    (v) => async (s) => {
      await toTyping(s, v)
      await gradeTyping(s, partial(verse(v).text, 0.4), 'bad')
      await s.button('그냥 넘어가기').waitFor()
    },
  ),
  ...vary(
    {
      ...stage,
      id: 'learn-graduated',
      verse: 'AS1a',
      title: '4단계 졸업 장면(등불) + 다음 구절 버튼',
      how: '타이핑 완벽 → 졸업하고 복습 큐에 추가',
    },
    (v) => async (s) => {
      await toTyping(s, v)
      await gradeTyping(s, verse(v).text, 'good')
      await s.click('졸업하고 복습 큐에 추가')
      await s.button(/^다음 구절:/).waitFor()
    },
  ),
  {
    ...stage,
    id: 'learn-graduated-last',
    title: '4단계 졸업 장면 — 다음 구절 없음(마지막 구절)',
    how: '나머지 494구절을 졸업시켜 두고 마지막 구절을 졸업',
    run: async (s) => {
      const last = ALL_IDS[ALL_IDS.length - 1] ?? ''
      await s.seed(
        seed(graduate(ALL_IDS.slice(0, -1), { cards: false }), {
          learning: [progress(last, 'typing')],
        }),
      )
      await s.open(`#/learn/${last}`)
      await gradeTyping(s, verse(last).text, 'good')
      await s.click('졸업하고 복습 큐에 추가')
      await s.page.getByRole('heading', { name: /졸업!$/ }).waitFor()
      // 다음 구절은 효과가 비동기로 고른다 — 고를 것이 없어 버튼이 끝내 서지 않는지 잠시 본다
      await s.page.waitForTimeout(400)
      if ((await s.button(/^다음 구절:/).count()) > 0) throw new Error('다음 구절 버튼이 섰다')
    },
  },
  {
    ...stage,
    id: 'learn-graduated-resume',
    title: "4단계 졸업 장면 — 강등한 구절이 남아 다음 걸음이 '이어서: …'",
    how: 'LV1a를 첫글자 단계(강등)로 둔 채 LV3a를 타이핑 완벽으로 졸업',
    run: async (s) => {
      await s.seed(
        seed(graduate([...idsOfCollection('AS'), 'LV2a'], { cards: false }), {
          learning: [progress('LV1a', 'firstLetter'), progress('LV3a', 'typing')],
        }),
      )
      await s.open('#/learn/LV3a')
      await gradeTyping(s, verse('LV3a').text, 'good')
      await s.click('졸업하고 복습 큐에 추가')
      await s.button(/^이어서:/).waitFor()
    },
  },
]
