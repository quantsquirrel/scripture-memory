/**
 * 꺾쇠 — 뒤로 가기(왼쪽)와 "누르면 들어간다"(오른쪽)의 표지. 탭 아이콘과 같은
 * 1.75px 둥근 선이라 한 벌의 아이콘으로 읽힌다. 글자 화살표(← →)는 서체마다
 * 굵기·높이가 달라 버튼 이름과 어긋났다. 장식이므로 읽지 않는다.
 */
export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      className="chevron"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={dir === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
    </svg>
  )
}
