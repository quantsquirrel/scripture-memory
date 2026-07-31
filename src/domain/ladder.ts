import { type Direction, DIRECTIONS } from './card'

/**
 * 학습 사다리. 이전에는 LearnProgress.step이 number(0~3)이고 전이 규칙이
 * Learn.tsx에 흩어져 있었다 — 어떤 단계에서 어떤 조작이 합법인지가 JSX 조건문에만
 * 있었다는 뜻이다. 여기서는 (단계, 사건) 쌍을 판별 유니온으로 못박아, 불법 조합은
 * 타입 수준에서 만들 수조차 없게 한다.
 */
export type LadderStep = 'intro' | 'firstLetter' | 'typing' | 'graduated'

/** 낭송 순서(주제→장절→말씀→장절)와 단계 라벨 */
export const STEP_TITLE: Record<LadderStep, string> = {
  intro: '본문 익히기',
  firstLetter: '첫글자 복원',
  typing: '타이핑 검증',
  graduated: '졸업',
}

/** 사다리 진행 상태의 영속 형태 */
export interface LearnProgress {
  verseId: string
  step: LadderStep
  updatedAt: string
}

/** 첫글자 단계 통과 기준 — 엿보기 2회 이하 */
export const MAX_PEEKS_TO_PASS = 2

/**
 * 사다리에 보낼 수 있는 명령 전체 목록.
 *
 * 이 유니온에 없는 (단계, 사건) 조합은 컴파일되지 않는다:
 * - `{ step: 'graduated', event: 'recited' }` — graduated를 step으로 갖는 멤버가 없다
 * - `{ step: 'intro', event: 'graded', perfect: true }` — intro는 'graded'를 받지 않는다
 * - `{ step: 'firstLetter', event: 'attempted' }` — peeks 없이는 만들 수 없다
 */
export type LadderCommand =
  | { step: 'intro'; event: 'recited' }
  /** 이미 다른 컬렉션에서 암송한 중복 구절은 첫글자를 건너뛴다 */
  | { step: 'intro'; event: 'skipToTyping' }
  | { step: 'firstLetter'; event: 'attempted'; peeks: number }
  | { step: 'firstLetter'; event: 'retry' }
  | { step: 'typing'; event: 'graded'; perfect: boolean }
  | { step: 'typing'; event: 'retry' }

export type StayReason = 'peeksExceeded' | 'notPerfect' | 'restart'

export type LadderOutcome =
  /** 같은 단계에 머문다 (재도전) */
  | { kind: 'stay'; step: LadderStep; reason: StayReason }
  | { kind: 'move'; step: LadderStep }
  /**
   * 졸업. 3방향 카드 생성은 이 결과의 일부이지 별도 호출이 아니다 —
   * 사다리를 통과하지 않고 카드가 생기는 경로를 만들지 않기 위해서다.
   */
  | { kind: 'graduate'; step: 'graduated'; directions: readonly Direction[] }

export function advance(cmd: LadderCommand): LadderOutcome {
  switch (cmd.step) {
    case 'intro':
      return { kind: 'move', step: cmd.event === 'skipToTyping' ? 'typing' : 'firstLetter' }
    case 'firstLetter':
      if (cmd.event === 'retry') return { kind: 'stay', step: 'firstLetter', reason: 'restart' }
      return cmd.peeks <= MAX_PEEKS_TO_PASS
        ? { kind: 'move', step: 'typing' }
        : { kind: 'stay', step: 'firstLetter', reason: 'peeksExceeded' }
    case 'typing':
      if (cmd.event === 'retry') return { kind: 'stay', step: 'typing', reason: 'restart' }
      return cmd.perfect
        ? { kind: 'graduate', step: 'graduated', directions: DIRECTIONS }
        : { kind: 'stay', step: 'typing', reason: 'notPerfect' }
  }
}

/**
 * 사다리를 다시 열 때의 시작 단계. 진행 기록이 없으면 처음부터,
 * 이미 졸업한 구절은 타이핑 검증부터 재훈련한다 (v1 동작: min(step, 2)).
 */
export function resumeStep(step: LadderStep | undefined): LadderStep {
  if (step === undefined) return 'intro'
  return step === 'graduated' ? 'typing' : step
}

export function isGraduated(p: { step: LadderStep }): boolean {
  return p.step === 'graduated'
}

/** 시작했지만 졸업하지 않은 상태 (v1의 step > 0 && step < 3) */
export function isInProgress(p: { step: LadderStep }): boolean {
  return p.step === 'firstLetter' || p.step === 'typing'
}

const LEGACY_ORDER: readonly LadderStep[] = ['intro', 'firstLetter', 'typing', 'graduated']

/**
 * v1 저장 형식의 숫자 단계 → 사다리 단계.
 * 범위를 벗어난 값은 졸업으로 올린다: v1에서 step은 단조 증가였고 3 이상은
 * 모두 '복습 큐 편입'을 뜻했다.
 */
export function stepFromLegacy(n: number): LadderStep {
  if (n <= 0) return 'intro'
  return LEGACY_ORDER[n] ?? 'graduated'
}

export function stepToLegacy(step: LadderStep): number {
  return LEGACY_ORDER.indexOf(step)
}

/** 진행 단계의 사람용 표기 (1/4 ~ 4/4) */
export function stepOrdinal(step: LadderStep): { nth: number; total: number } {
  return { nth: stepToLegacy(step) + 1, total: LEGACY_ORDER.length }
}
