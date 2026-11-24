/** 홈 (src/views/Home.tsx, src/views/home/panels.tsx) */
import type { StateDef } from './define'
import {
  ALL_IDS,
  card,
  DAY,
  goal,
  graduate,
  HOUR,
  idsOfCollection,
  idsOfSection,
  MIN,
  progress,
  seed,
  todayLogs,
} from './seed'

/** 복습 대기 2구절(카드 6장, 오늘 08시 due — 밀리지 않음), 목표 진행 중(D-95) */
export const HOME_DUE = seed(
  graduate(['AS1a', 'AS2a'], { due: -HOUR, updatedAt: -3 * DAY }),
  graduate(['AS3a', 'AS4a'], { due: 4 * DAY, updatedAt: -10 * DAY }),
  goal({ date: '2027-02-26' }),
)

const LAST = ALL_IDS[ALL_IDS.length - 1] ?? ''

export const HOME: StateDef[] = [
  {
    id: 'home-loading',
    screen: 'home',
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 홈을 연다',
    stall: true,
    run: async (s) => {
      await s.open('#/', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  {
    id: 'home-first-run',
    screen: 'home',
    title: '첫 실행(빈 DB): 대기 카드 없음, 다음 구절 5확신 첫 구절에 등불, 진행률 0',
    how: '시드 없이 홈. 기본 목표일(8/26)이 지나 D-day 없이 유지 모드 문구',
    run: async (s) => {
      await s.open('#/')
      await s.see(/^다음 구절:/)
    },
  },
  {
    id: 'home-due',
    screen: 'home',
    title:
      '복습 대기: 큰 숫자·금색 복습 시작, 밀린 카드·오늘 복습 없음, 목표 진행 중(오늘 칸 없음)',
    how: '2구절 6장을 오늘 08시 due로, 목표일 2027-02-26',
    run: async (s) => {
      await s.seed(HOME_DUE)
      await s.open('#/')
      await s.button('복습 시작').waitFor()
    },
  },
  {
    id: 'home-due-overdue',
    screen: 'home',
    title: '복습 대기 + 밀린 카드만, 이어서·다음 구절 버튼 둘(등불 없음), 목표일 지남',
    how: '3구절 9장을 이틀 전 due로, LV4a 타이핑 단계 진행 중, 목표는 기본값(지남)',
    run: async (s) => {
      await s.seed(
        seed(
          graduate([...idsOfCollection('AS'), 'LV1a', 'LV2a', 'LV3a'], { due: 6 * DAY }),
          graduate(['AS1a', 'AS2a', 'AS3a'], { due: -2 * DAY }),
          { learning: [progress('LV4a', 'typing')] },
        ),
      )
      await s.open('#/')
      await s.see('밀린 카드 9장')
      await s.see(/^이어서:/)
    },
  },
  {
    id: 'home-due-overdue-reviewed',
    screen: 'home',
    title: '복습 대기 + 밀린 카드 + 오늘 복습 횟수, 목표의 오늘 칸',
    how: '밀린 카드 6장, 오늘 복습 기록 4줄, 오늘 졸업한 구절 1개, 목표일 2027-02-26',
    run: async (s) => {
      await s.seed(
        seed(
          graduate(['AS1a', 'AS2a'], { due: -2 * DAY }),
          graduate(['AS3a', 'AS4a'], { due: 3 * DAY }),
          graduate(['AS5a'], { due: 2 * DAY, updatedAt: -HOUR }),
          { reviews: todayLogs(4, 'AS3a:topic') },
          goal({ date: '2027-02-26' }),
        ),
      )
      await s.open('#/')
      await s.see('오늘 4회 복습')
      await s.page.locator('.figures dt', { hasText: '오늘' }).waitFor()
    },
  },
  {
    id: 'home-due-many',
    screen: 'home',
    title: '대기 30장 이상: 말씀 상태 개정 안내 줄, 정착 기간 안내(마감 전)',
    how: '12구절 36장을 사흘 전 due로, 목표일 2027-02-26·정착 기간 14일',
    run: async (s) => {
      await s.seed(
        seed(
          graduate([...idsOfCollection('AS'), ...idsOfCollection('LV').slice(0, 7)], {
            due: -3 * DAY,
          }),
          goal({ date: '2027-02-26', buffer: 14 }),
        ),
      )
      await s.open('#/')
      await s.page.locator('.notice-row').waitFor()
      await s.see(/마지막 14일은 복습으로 굳히기/)
    },
  },
  {
    id: 'home-upcoming',
    screen: 'home',
    title: '대기 0, 잠시 후 돌아올 카드: 지금 이어서 복습 + 오늘 복습 횟수, 정착 기간 중 안내',
    how: '재학습 카드 1장을 10분 뒤 due로, 오늘 기록 3줄, 목표일 12/4·정착 기간 14일',
    run: async (s) => {
      await s.seed(
        seed(
          graduate(['AS1a', 'AS2a', 'AS3a', 'AS4a'], { due: 3 * DAY }),
          { cards: [card('AS1a', 'topic', 10 * MIN, 'firstLetter')] },
          { reviews: todayLogs(3, 'AS1a:topic') },
          goal({ date: '2026-12-04', buffer: 14 }),
        ),
      )
      await s.open('#/')
      await s.button('지금 이어서 복습').waitFor()
      await s.see(/복습 정착 기간입니다/)
    },
  },
  {
    id: 'home-upcoming-noreviews',
    screen: 'home',
    title: '대기 0, 잠시 후 돌아올 카드, 오늘 복습 횟수 없음',
    how: '재학습 카드 1장을 10분 뒤 due로, 오늘 기록 없음',
    run: async (s) => {
      await s.seed(
        seed(graduate(['AS1a', 'AS2a'], { due: 3 * DAY }), {
          cards: [card('AS1a', 'topic', 10 * MIN, 'firstLetter')],
        }),
      )
      await s.open('#/')
      await s.button('지금 이어서 복습').waitFor()
    },
  },
  {
    id: 'home-rest-done',
    screen: 'home',
    title: '대기 0·돌아올 카드 0: 오늘 복습 완료 문구 + 다음 복습, 이어서 버튼에 등불',
    how: '7구절 카드를 사흘 뒤 due로, 오늘 기록 5줄, LV3a 첫글자 단계 진행 중',
    run: async (s) => {
      await s.seed(
        seed(
          graduate([...idsOfCollection('AS'), 'LV1a', 'LV2a'], { due: 3 * DAY }),
          { reviews: todayLogs(5) },
          { learning: [progress('LV3a', 'firstLetter')] },
        ),
      )
      await s.open('#/')
      await s.see(/오늘 5회 복습 완료!/)
      await s.page.locator('.btn-primary', { hasText: '이어서:' }).waitFor()
    },
  },
  {
    id: 'home-rest',
    screen: 'home',
    title: '대기 0·오늘 복습 없음: 다음 복습만, 다음 구절에 등불, 과정별 줄 완료 표시',
    how: '5확신·8동행·60구절·DEP 1을 모두 졸업(카드 이틀 뒤 due), 목표일 2027-02-26',
    run: async (s) => {
      await s.seed(
        seed(
          graduate(
            [
              ...idsOfCollection('AS'),
              ...idsOfCollection('LV'),
              ...idsOfCollection('TMS60'),
              ...idsOfSection('D1'),
            ],
            { due: 2 * DAY, updatedAt: -5 * DAY },
          ),
          goal({ date: '2027-02-26' }),
        ),
      )
      await s.open('#/')
      await s.see('대기 중인 카드가 없습니다.')
      await s.page.locator('.btn-primary', { hasText: '다음 구절:' }).waitFor()
    },
  },
  {
    id: 'home-goal-complete',
    screen: 'home',
    title: '목표 범위 완료 문구(5확신까지), 다음 구절에 등불',
    how: '목표 범위 5확신·목표일 2027-02-26, 5확신 5구절 졸업',
    run: async (s) => {
      await s.seed(
        seed(
          graduate(idsOfCollection('AS'), { due: 2 * DAY }),
          goal({ date: '2027-02-26', scope: 'AS' }),
        ),
      )
      await s.open('#/')
      await s.see(/목표 범위\(5확신까지\)를 모두 외웠습니다/)
    },
  },
  {
    id: 'home-all-learned',
    screen: 'home',
    title: '모든 구절 학습 완료 문구, 진행률 전부 완료',
    how: '495구절 모두 졸업(카드 이틀 뒤 due)',
    run: async (s) => {
      await s.seed(graduate(ALL_IDS, { due: 2 * DAY }))
      await s.open('#/')
      await s.see(/모든 구절을 학습했습니다!/)
    },
  },
  {
    id: 'home-resume-only',
    screen: 'home',
    title: '이어서 버튼만(다음 구절 없음), 등불이 이어서에',
    how: '마지막 구절만 타이핑 단계, 나머지 494구절 졸업',
    run: async (s) => {
      await s.seed(
        seed(graduate(ALL_IDS.slice(0, -1), { due: 2 * DAY }), {
          learning: [progress(LAST, 'typing')],
        }),
      )
      await s.open('#/')
      await s.page.locator('.btn-primary', { hasText: '이어서:' }).waitFor()
    },
  },
]
