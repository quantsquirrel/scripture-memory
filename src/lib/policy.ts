import type { Direction, ReviewMode } from './types'

/**
 * 복습 모드 선택 정책.
 * - 말씀→장절 방향은 항상 장절 입력(객관 채점).
 * - 어린 카드(reps<3)는 첫글자 훈련으로 축자 회상을 강제.
 * - 이후 5회마다 한 번 타이핑 감사(word-perfect audit).
 * - 그 외에는 소리 내어 낭송 후 자가 채점.
 */
export function reviewMode(direction: Direction, reps: number): ReviewMode {
  if (direction === 'text') return 'refInput'
  if (reps < 3) return 'firstLetter'
  if ((reps + 1) % 5 === 0) return 'typing'
  return 'recite'
}
