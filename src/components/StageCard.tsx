import { type ReactNode, useEffect, useRef } from 'react'

/** 방향키 한 번에 움직이는 거리(px) — 브라우저가 줄 단위로 미는 크기와 같다 */
const LINE = 40
/** PageUp·PageDown은 보이는 창의 이만큼 — 넘어가기 전 마지막 줄이 다음 창에 남는다 */
const PAGE = 0.875

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'])

/**
 * 무대 카드 — 구절 하나를 마주하는 카드(`.panel.stage-card`).
 *
 * 카드는 화면 안에 머물고 긴 말씀은 카드 안에서 흐른다(base.css). 스크롤이 문서가 아니라
 * 카드 안에 있어서 생기는 두 가지를 여기서 맡는다. 둘 다 스크롤만 옮기고 포커스는 건드리지 않는다.
 *
 * 1. 같은 카드 안에서 내용이 갈리면(정답 공개, 채점, 본문 다시 보기 ↔ 보드) 새 내용이 처음부터
 *    보이게 맨 위로 되돌린다. 채점 결과가 그 자리에서 쟁반 아래로 내려가 있으면 결과와 정답이
 *    쟁반 위에 서도록 필요한 만큼만 내린다. 카드의 직계 자식이 갈릴 때만 반응한다 — 보드의
 *    엿보기, 쟁반 안의 실패 안내, 입력 중인 글자는 직계 자식을 바꾸지 않는다.
 * 2. 포커스가 카드 밖(body, 윗줄, 독)에 있어도 방향키·PageUp·PageDown·Home·End로 카드 안을
 *    오르내린다. 문서가 흐르던 때에는 브라우저가 해 주던 일이다. 포커스가 카드 안에 있으면
 *    브라우저가 카드를 밀고, 입력란 안의 방향키는 글자 사이를 옮기므로 끼어들지 않는다.
 *
 * 카드가 스크롤 영역이 아닐 때(높이 520px 미만 — 페이지가 흐른다)는 아무것도 하지 않는다.
 * 카드를 새로 놓아야 하면(다음 카드, 다음 단계) 부모가 `key`를 바꾼다.
 */
export function StageCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const card = ref.current
    if (!card) return

    const scrolls = () =>
      getComputedStyle(card).overflowY !== 'visible' && card.scrollHeight > card.clientHeight
    const footHeight = () =>
      card.querySelector<HTMLElement>(':scope > .stage-foot')?.offsetHeight ?? 0
    // 카드 윗변에서 잰 자리 — offsetTop은 나타나는 움직임(transform)에 흔들리지 않는다
    const topOf = (el: HTMLElement) =>
      el.offsetParent === card ? el.offsetTop : el.offsetTop - card.offsetTop

    const settle = () => {
      if (!scrolls()) return
      card.scrollTop = 0
      const result = card.querySelector<HTMLElement>(
        ':scope > .diff-score, :scope > .diff-view',
      )
      if (!result) return
      const pad = parseFloat(getComputedStyle(card).paddingTop)
      const seen = card.clientHeight - footHeight()
      // 장절 입력의 결과 배지는 뒤따르는 정답까지(카드의 끝까지) 보여야 하고,
      // 타이핑 결과는 점수 한 줄이 보이면 그 아래는 읽으며 내린다
      const score = result.querySelector<HTMLElement>('.diff-score') ?? result
      const down =
        score === result
          ? card.scrollHeight - card.clientHeight
          : topOf(score) + score.offsetHeight + pad - seen
      // 결과가 카드 윗단 위로 올라가도록 내리지는 않는다
      card.scrollTop = Math.max(0, Math.min(down, topOf(result) - pad))
    }

    const onKey = (e: KeyboardEvent) => {
      if (!KEYS.has(e.key) || e.defaultPrevented) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!scrolls()) return
      const at = document.activeElement
      if (at instanceof HTMLElement) {
        if (card.contains(at) || at.isContentEditable) return
        if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement) return
        if (at instanceof HTMLSelectElement) return
      }
      const page = Math.max(LINE, (card.clientHeight - footHeight()) * PAGE)
      const top = card.scrollTop
      const to: Record<string, number> = {
        ArrowDown: top + LINE,
        ArrowUp: top - LINE,
        PageDown: top + page,
        PageUp: top - page,
        Home: 0,
        End: card.scrollHeight,
      }
      e.preventDefault()
      card.scrollTop = to[e.key] ?? top
    }

    const observer = new MutationObserver(settle)
    observer.observe(card, { childList: true })
    document.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={ref} className="panel stage-card">
      {children}
    </div>
  )
}
