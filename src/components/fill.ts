import type { CSSProperties } from 'react'

/**
 * 진행 막대 채움(.progress-fill)의 비율. 폭을 직접 바꾸지 않고 CSS 변수 하나를
 * 넘기면 progress.css가 transform으로 끌어낸다(폭 전환은 매 프레임 레이아웃을 다시 잰다).
 */
export function fillStyle(done: number, total: number): CSSProperties {
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  return { '--fill': String(ratio) } as CSSProperties
}
