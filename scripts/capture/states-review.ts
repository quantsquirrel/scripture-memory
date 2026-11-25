/** 복습 (src/views/Review.tsx, src/views/review/*, src/components/RatingBar·FirstLetterBoard·DiffView) */
import type { Direction } from '../../src/domain/card'
import { peek, type StateDef, vary } from './define'
import {
  card,
  type CardKind,
  DAY,
  graduate,
  HOUR,
  LONG,
  MIN,
  oneOff,
  partial,
  type Seed,
  seed,
  verse,
} from './seed'
import type { Session } from './session'

const FILLER_IDS = ['AS2a', 'AS3a', 'AS4a']

/** 첫 장 뒤에 이어지는 낭송 카드 3장 — 남은 카드가 1이 아닌, 세션다운 모습 */
const FILLERS = seed(graduate(FILLER_IDS, { due: 5 * DAY }), {
  cards: FILLER_IDS.map((id) => card(id, 'topic', -HOUR)),
})

/**
 * 첫 장이 될 카드 하나와 뒤따르는 카드. 큐는 due 순이라(fixtures의 Math.random) 가장 이른
 * 카드가 첫 장이다. 방식은 카드 모양이 정한다(seed.ts의 CardKind, 말씀→장절은 장절 입력).
 */
export function reviewSeed(
  verseId: string,
  direction: Direction,
  kind: CardKind = 'recite',
  fillers = true,
): Seed {
  return seed(graduate([verseId], { due: 5 * DAY }), fillers ? FILLERS : {}, {
    cards: [card(verseId, direction, -3 * HOUR, kind)],
  })
}

/** 복습 탭을 연다 — 첫 장의 방식 표지가 뜰 때까지 */
export async function openReview(s: Session, sd: Seed, mode: string): Promise<void> {
  await s.seed(sd)
  await s.open('#/review')
  await s.page.locator('.mode-tag', { hasText: mode }).waitFor()
}

/**
 * 무대 카드를 안에서 내린다 — 긴 말씀은 페이지가 아니라 카드 안에서 흐른다.
 * 맨 아래로, 또는 고른 요소가 보이는 데까지. 폭이 바뀌어 다시 짜여도(390 → 360) 그 자리를 지킨다.
 */
export async function scrollCard(s: Session, selector?: string): Promise<void> {
  await s.page.locator('.stage-card').evaluate((card, target) => {
    const place = () => {
      if (target === null) card.scrollTo(0, card.scrollHeight)
      else card.querySelector(target)?.scrollIntoView({ block: 'center' })
    }
    place()
    new ResizeObserver(place).observe(card)
  }, selector ?? null)
}

const MODE = {
  recite: '소리 내어 낭송',
  firstLetter: '첫글자 힌트',
  typing: '타이핑 감사',
  refInput: '장절 입력',
} as const

const DIR_NAME: Record<'topic' | 'ref', string> = { topic: '주제 카드', ref: '장절 카드' }

const stage = { screen: 'review', stage: true } as const

function recite(dir: 'topic' | 'ref'): StateDef[] {
  return [
    ...vary(
      {
        ...stage,
        id: `review-recite-${dir}`,
        verse: 'AS1a',
        title: `낭송(자가 채점) × ${DIR_NAME[dir]}: 정답 보기 전`,
        how: `Review 상태·reps 3 카드(${dir})를 첫 장으로`,
      },
      (v) => async (s) => {
        await openReview(s, reviewSeed(v, dir), MODE.recite)
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-recite-${dir}-revealed`,
        verse: 'AS1a',
        title: `낭송 × ${DIR_NAME[dir]}: 정답 연 뒤(낭송의 틀, 등급 네 칸, 제안 없음)`,
        how: '위 상태에서 정답 보기',
      },
      (v) => async (s) => {
        await openReview(s, reviewSeed(v, dir), MODE.recite)
        await s.click('정답 보기')
        await s.page.locator('.rating-bar').waitFor()
      },
    ),
    // 긴 말씀은 카드 안에서 흐른다 — 끝까지 내린 모습(닫는 장절이 쟁반 위에 선다)
    ...(dir === 'ref'
      ? [
          {
            ...stage,
            id: 'review-recite-ref-revealed-long-end',
            view: 'keep',
            title: '낭송 × 장절 카드: 가장 긴 구절의 정답을 카드 안에서 끝까지 내린 모습',
            how: '정답을 연 뒤 카드를 맨 아래로 스크롤',
            run: async (s: Session) => {
              await openReview(s, reviewSeed(LONG, dir), MODE.recite)
              await s.click('정답 보기')
              await s.page.locator('.rating-bar').waitFor()
              await scrollCard(s)
            },
          },
        ]
      : []),
  ]
}

function firstLetter(dir: 'topic' | 'ref'): StateDef[] {
  const open = (s: Session, v: string) =>
    openReview(s, reviewSeed(v, dir, 'firstLetter'), MODE.firstLetter)
  /** 정답을 열고, 엿보기 수가 정하는 제안 등급(0회 좋음·1~2회 어려움·3회 이상 다시)이 맞는지까지 */
  const reveal = async (s: Session, suggested: 1 | 2 | 3) => {
    await s.click('낭송 완료, 정답 확인')
    await s.page.locator(`button.rate-${String(suggested)}.suggested`).waitFor()
  }
  return [
    ...vary(
      {
        ...stage,
        id: `review-fl-${dir}`,
        verse: 'AS1a',
        title: `첫글자 힌트 × ${DIR_NAME[dir]}: 보드 처음`,
        how: `재학습(분 단위) 카드(${dir})를 첫 장으로`,
      },
      (v) => async (s) => {
        await open(s, v)
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-fl-${dir}-peeked`,
        verse: 'AS1a',
        title: `첫글자 힌트 × ${DIR_NAME[dir]}: 어절 둘을 엿본 보드`,
        how: '보드의 앞 어절 둘을 탭',
      },
      (v) => async (s) => {
        await open(s, v)
        await peek(s, 2)
        await s.see('엿보기 2회')
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-fl-${dir}-revealed`,
        verse: 'AS1a',
        title:
          dir === 'topic'
            ? `첫글자 힌트 × ${DIR_NAME[dir]}: 정답 연 뒤, 엿보기 1회 → 제안 '어려움'`
            : `첫글자 힌트 × ${DIR_NAME[dir]}: 정답 연 뒤, 엿보기 0회 → 제안 '좋음'`,
        how: dir === 'topic' ? '어절 하나를 엿보고 낭송 완료' : '엿보지 않고 낭송 완료',
      },
      (v) => async (s) => {
        await open(s, v)
        if (dir === 'topic') await peek(s, 1)
        await reveal(s, dir === 'topic' ? 2 : 3)
      },
    ),
    ...(dir === 'topic'
      ? vary(
          {
            ...stage,
            id: 'review-fl-topic-revealed-many',
            verse: 'AS1a',
            title: "첫글자 힌트 × 주제 카드: 정답 연 뒤, 엿보기 3회 → 제안 '다시'",
            how: '어절 셋을 엿보고 낭송 완료',
          },
          (v) => async (s) => {
            await open(s, v)
            await peek(s, 3)
            await reveal(s, 1)
          },
        )
      : []),
  ]
}

function typing(dir: 'topic' | 'ref'): StateDef[] {
  const open = (s: Session, v: string) =>
    openReview(s, reviewSeed(v, dir, 'typing'), MODE.typing)
  /** 채점하고, 정확도 칸(완벽 good·90% 이상 warn·그 아래 bad)과 제안 등급이 맞는지까지 */
  const grade = async (s: Session, text: string, score: 'good' | 'warn' | 'bad') => {
    await s.page.locator('#review-typing').fill(text)
    await s.click('채점')
    await s.page.locator(`.diff-view .diff-score.${score}`).waitFor()
    const suggested = { good: 3, warn: 2, bad: 1 }[score]
    await s.page.locator(`button.rate-${String(suggested)}.suggested`).waitFor()
  }
  const name = DIR_NAME[dir]
  return [
    ...vary(
      {
        ...stage,
        id: `review-typing-${dir}`,
        verse: 'AS1a',
        title: `타이핑 감사 × ${name}: 빈 입력(채점 버튼 꺼짐)`,
        how: `Review 상태·reps 4 카드(${dir}) — 5회째 감사 차례`,
      },
      (v) => async (s) => {
        await open(s, v)
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-typing-${dir}-input`,
        verse: 'AS1a',
        title: `타이핑 감사 × ${name}: 입력 중(앞 절반)`,
        how: '입력란에 본문 앞 어절 절반을 넣는다(포커스 유지)',
      },
      (v) => async (s) => {
        await open(s, v)
        await s.page.locator('#review-typing').fill(partial(verse(v).text, 0.5))
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-typing-${dir}-perfect`,
        verse: 'AS1a',
        title: `타이핑 감사 × ${name}: 채점 완벽 + 정답 + 제안 '좋음'`,
        how: '본문 그대로 입력하고 채점',
      },
      (v) => async (s) => {
        await open(s, v)
        await grade(s, verse(v).text, 'good')
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-typing-${dir}-close`,
        verse: 'AS1a',
        // 10자 구절은 한 글자만 틀려도 87.5%라 '조금 틀림'(90% 이상)이 될 수 없다
        skip: ['short'],
        title: `타이핑 감사 × ${name}: 조금 틀림(90% 이상) + 정답 + 제안 '어려움'`,
        how: '가운데 글자 하나를 바꿔 입력하고 채점',
      },
      (v) => async (s) => {
        await open(s, v)
        await grade(s, oneOff(verse(v).text), 'warn')
      },
    ),
    ...vary(
      {
        ...stage,
        id: `review-typing-${dir}-wrong`,
        verse: 'AS1a',
        title: `타이핑 감사 × ${name}: 많이 틀림 + 정답 + 제안 '다시'`,
        how: '앞 어절 40%만 입력하고 채점',
      },
      (v) => async (s) => {
        await open(s, v)
        await grade(s, partial(verse(v).text, 0.4), 'bad')
      },
    ),
  ]
}

function refInput(): StateDef[] {
  const open = (s: Session, v: string) => openReview(s, reviewSeed(v, 'text'), MODE.refInput)
  /** 확인하고, 정오 칸(정답 good·오답 bad)과 제안 등급(좋음·다시)이 맞는지까지 */
  const answer = async (s: Session, text: string, ok: boolean) => {
    await s.page.locator('#review-ref').fill(text)
    await s.click('확인')
    await s.page.locator(`.diff-score.${ok ? 'good' : 'bad'}`).waitFor()
    await s.page.locator(`button.rate-${ok ? '3' : '1'}.suggested`).waitFor()
  }
  return [
    ...vary(
      {
        ...stage,
        id: 'review-refinput',
        verse: 'AS1a',
        title: '장절 입력(말씀 카드): 빈 입력(확인 버튼 꺼짐)',
        how: '말씀→장절(text) 카드를 첫 장으로',
      },
      (v) => async (s) => {
        await open(s, v)
      },
    ),
    ...vary(
      {
        ...stage,
        id: 'review-refinput-input',
        verse: 'AS1a',
        title: '장절 입력: 입력 중',
        how: '책 이름만 입력(포커스 유지)',
      },
      (v) => async (s) => {
        await open(s, v)
        await s.page.locator('#review-ref').fill(verse(v).bookAbbr)
      },
    ),
    ...vary(
      {
        ...stage,
        id: 'review-refinput-correct',
        verse: 'AS1a',
        title: "장절 입력: 정답 + 제안 '좋음'",
        how: '약칭 장절을 입력하고 확인',
      },
      (v) => async (s) => {
        await open(s, v)
        await answer(s, verse(v).refAbbr, true)
      },
    ),
    ...vary(
      {
        ...stage,
        id: 'review-refinput-wrong',
        verse: 'AS1a',
        title: "장절 입력: 오답(입력 표기) + 정답 + 제안 '다시'",
        how: "'요 3:16'을 입력하고 확인",
      },
      (v) => async (s) => {
        await open(s, v)
        await answer(s, '요 3:16', false)
      },
    ),
  ]
}

/** 낭송 카드 한 장을 '좋음'으로 넘긴다 */
async function passRecite(s: Session): Promise<void> {
  await s.click('정답 보기')
  await s.page.locator('button.rate-3').click()
}

export const REVIEW: StateDef[] = [
  {
    id: 'review-loading',
    screen: 'review',
    stage: true,
    title: '불러오는 중',
    how: 'IndexedDB 열기를 멈춘 채 복습 탭',
    stall: true,
    run: async (s) => {
      await s.open('#/review', false)
      await s.page.locator('.loading').waitFor()
    },
  },
  {
    id: 'review-empty',
    screen: 'review',
    title: '빈 상태: 복습할 카드가 없습니다 + 새 구절 안내 + 홈으로',
    how: '시드 없이 복습 탭',
    run: async (s) => {
      await s.open('#/review')
      await s.page.getByRole('heading', { name: '복습할 카드가 없습니다' }).waitFor()
    },
  },
  ...recite('topic'),
  {
    ...stage,
    id: 'review-recite-topic-multi',
    title: '낭송 × 주제 카드: 주제에 구절이 여럿(차례 1/2 표시와 안내)',
    how: '구절 둘인 주제(A1 중심되신 그리스도)의 첫 구절 카드',
    run: async (s) => {
      await openReview(s, reviewSeed('A1a', 'topic'), MODE.recite)
      await s.page.locator('.prompt-ord').waitFor()
    },
  },
  ...recite('ref'),
  ...firstLetter('topic'),
  ...firstLetter('ref'),
  ...typing('topic'),
  ...typing('ref'),
  ...refInput(),
  {
    ...stage,
    id: 'review-progress',
    title: '세션 중간: 진행 막대 2/4, 남은 카드 2',
    how: '낭송 카드 4장 중 2장을 좋음으로 넘긴다',
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic'), MODE.recite)
      await passRecite(s)
      await s.see('남은 카드 3')
      await passRecite(s)
      await s.see('남은 카드 2')
    },
  },
  {
    ...stage,
    id: 'review-stale-requeued',
    title: '다른 탭에서 갱신된 카드 안내(다시 출제) — 첫글자 힌트로 다시 나온 카드 위',
    how: "정답을 연 뒤 DB의 그 카드를 '다시' 받은 재학습 카드로 바꾸고 좋음을 누른다(StaleCardError)",
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic'), MODE.recite)
      await s.click('정답 보기')
      await s.put({ cards: [card('AS1a', 'topic', 5 * MIN, 'firstLetter')] })
      await s.page.locator('button.rate-3').click()
      await s.see(/갱신된 상태로 다시 출제합니다/)
      await s.page.locator('.mode-tag', { hasText: MODE.firstLetter }).waitFor()
    },
  },
  {
    ...stage,
    id: 'review-stale-skip-empty',
    title: '다른 탭에서 이미 복습한 카드 안내(건너뜀) — 한 장도 못 넘긴 빈 상태 + 다음 복습',
    how: "카드 한 장뿐. 정답을 연 뒤 DB의 그 카드를 열흘 뒤 due로 바꾸고 좋음(문구의 '다음 복습'은 같은 구절의 장절·말씀 카드, 5일 뒤)",
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic', 'recite', false), MODE.recite)
      await s.click('정답 보기')
      await s.put({ cards: [card('AS1a', 'topic', 10 * DAY)] })
      await s.page.locator('button.rate-3').click()
      await s.see(/이미 복습한 카드라 건너뜁니다/)
      await s.see(/^다음 복습: .+ 후$/)
    },
  },
  {
    ...stage,
    id: 'review-stale-skip-finale',
    title: '복습 완료 장면 + 건너뜀 안내, 다음 복습 문구 없음(카드가 모두 지워짐)',
    how: '두 장 중 한 장을 넘긴 뒤, 다른 탭에서 초기화한 것처럼 카드를 모두 지우고 좋음',
    run: async (s) => {
      await openReview(
        s,
        seed(reviewSeed('AS1a', 'topic', 'recite', false), {
          cards: [card('AS2a', 'topic', -HOUR)],
        }),
        MODE.recite,
      )
      await passRecite(s)
      await s.see('남은 카드 1')
      await s.click('정답 보기')
      await s.deleteCards('all')
      await s.page.locator('button.rate-3').click()
      await s.page.getByRole('heading', { name: '복습 완료!' }).waitFor()
      await s.see(/이미 복습한 카드라 건너뜁니다/)
      if ((await s.page.getByText(/^다음 복습:/).count()) > 0)
        throw new Error('다음 복습 문구가 섰다')
    },
  },
  {
    ...stage,
    id: 'review-stale-skip-finale-next',
    title: '복습 완료 장면 + 건너뜀 안내 + 다음 복습 문구(셋이 함께)',
    how: '두 장 중 한 장을 넘긴 뒤, 남은 카드를 DB에서 열흘 뒤 due로 바꾸고 좋음',
    run: async (s) => {
      await openReview(
        s,
        seed(reviewSeed('AS1a', 'topic', 'recite', false), {
          cards: [card('AS2a', 'topic', -HOUR)],
        }),
        MODE.recite,
      )
      await passRecite(s)
      await s.see('남은 카드 1')
      await s.click('정답 보기')
      await s.put({ cards: [card('AS2a', 'topic', 10 * DAY)] })
      await s.page.locator('button.rate-3').click()
      await s.page.getByRole('heading', { name: '복습 완료!' }).waitFor()
      await s.see(/이미 복습한 카드라 건너뜁니다/)
      await s.see(/^다음 복습: .+ 후$/)
    },
  },
  {
    ...stage,
    id: 'review-done',
    title: '복습 완료 장면(등불) + 다음 복습 문구',
    how: '낭송 카드 4장을 모두 좋음으로',
    run: async (s) => {
      await openReview(s, reviewSeed('AS1a', 'topic'), MODE.recite)
      for (let i = 0; i < 4; i++) await passRecite(s)
      await s.page.getByRole('heading', { name: '복습 완료!' }).waitFor()
      await s.see(/^다음 복습: .+ 후$/)
    },
  },
]
