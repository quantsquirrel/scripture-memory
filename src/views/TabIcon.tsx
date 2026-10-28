import type { ReactNode } from 'react'

import type { TabName } from './router'

/**
 * 탭 아이콘. 모바일 독에서는 그림만 보이므로 이름은 링크의 aria-label이 맡고
 * (PC에서는 이름이 옆에 함께 보인다), 그림 자체는 스크린리더에서 숨긴다. 색은 currentColor라 활성 탭의 accent를
 * 그대로 따른다.
 */
const PATHS: Record<TabName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 8.8V20h4.5v-6h4v6h4.5V8.8" />
    </>
  ),
  review: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 3.5V8H8" />
    </>
  ),
  browse: (
    <>
      <path d="M9 6h11.5M9 12h11.5M9 18h11.5" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M9.46 5.26 10.11 2.69 13.89 2.69 14.54 5.26 14.97 5.44 17.25 4.08 19.92 6.75 18.56 9.03 18.74 9.46 21.31 10.11 21.31 13.89 18.74 14.54 18.56 14.97 19.92 17.25 17.25 19.92 14.97 18.56 14.54 18.74 13.89 21.31 10.11 21.31 9.46 18.74 9.03 18.56 6.75 19.92 4.08 17.25 5.44 14.97 5.26 14.54 2.69 13.89 2.69 10.11 5.26 9.46 5.44 9.03 4.08 6.75 6.75 4.08 9.03 5.44Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
}

export function TabIcon({ name }: { name: TabName }) {
  return (
    <svg
      className="tab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
