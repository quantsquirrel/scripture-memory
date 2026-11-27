/** 워드마크 곁의 보조 문구 — 앱 머리와 소개 장면이 함께 쓴다 */
export const BRAND_SUB = '개역한글 말씀암송'

/**
 * i의 점(등불) — viewBox 좌표. 좌표 1단위 = 0.001em, y=0이 기준선, viewBox 위끝은 -774다.
 * 소개 장면은 이 값으로 점의 자리를 재어 날아온 등불을 거기에 내려앉힌다.
 */
export const WORDMARK_DOT = { cx: 128.5, cy: -702, r: 72 } as const
export const WORDMARK_VIEWBOX = { width: 257, height: 774 } as const

/**
 * Ivan 워드마크: i는 앱 아이콘의 i를 그대로 줄인 SVG 마크다 — 등불 점(악센트 금색)을 기둥 정중앙에
 * 올린다(DESIGN.md Overview의 시각 은유). 좌표 1단위 = 0.001em, y=0이 기준선이다.
 * - 기둥: 'van'(Pretendard Bold)의 i와 같은 굵기 144·글자 폭 257. 기준선에서 x높이 530까지
 *   서되, 둥근 끝이 짧아 보이지 않게 'o'처럼 위아래로 10씩 넘친다.
 * - 점: 지름 = 기둥 굵기, 점과 기둥 사이 90(굵기의 0.62배) — 둘 다 아이콘 비율. 후광은 없다.
 *
 * dot=false는 점 없이 그린다 — 소개 장면에서는 장면을 건너다니는 등불이 그 점이 된다.
 */
export function Wordmark({ dot = true }: { dot?: boolean }) {
  return (
    <span aria-hidden="true" className="brand-wordmark">
      <svg
        className="brand-i-icon"
        viewBox={`0 -${WORDMARK_VIEWBOX.height} ${WORDMARK_VIEWBOX.width} ${WORDMARK_VIEWBOX.height}`}
        aria-hidden="true"
        focusable="false"
      >
        {dot && (
          <circle
            cx={WORDMARK_DOT.cx}
            cy={WORDMARK_DOT.cy}
            r={WORDMARK_DOT.r}
            fill="var(--color-accent)"
          />
        )}
        <rect x="56.5" y="-540" width="144" height="550" rx="72" fill="currentColor" />
      </svg>
      <span className="brand-tail">van</span>
    </span>
  )
}
