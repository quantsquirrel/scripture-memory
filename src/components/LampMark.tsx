/** 후광 고리 — 바깥에서 안으로 겹칠수록 진해져 번짐이 계단 없이 이어진다 */
const HALO: readonly (readonly [radius: number, opacity: number])[] = [
  [31, 0.04],
  [26, 0.06],
  [21, 0.09],
  [16.5, 0.16],
]

/**
 * 등불 — 워드마크 i의 점과 같은 모양(금색 점 + 옅은 후광). 복습을 마치거나
 * 구절을 졸업한 자리에 하나만 켠다. 그라디언트 대신 투명도가 다른 동심원을
 * 겹쳐 번짐을 그린다(DESIGN.md: 그라디언트로 깊이를 만들지 않는다). 장식이므로 읽지 않는다.
 */
export function LampMark() {
  return (
    <svg className="lamp" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {HALO.map(([r, opacity]) => (
        <circle key={r} cx="32" cy="32" r={r} fill="var(--color-accent)" opacity={opacity} />
      ))}
      <circle cx="32" cy="32" r="11.5" fill="var(--color-accent)" />
    </svg>
  )
}
