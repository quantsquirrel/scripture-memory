import { useEffect, useRef } from 'react'

/** 누른 자리 밑의 누를 것이 바뀐 뒤 이 시간(ms) 동안 그 자리는 누름을 받지 않는다 */
const SETTLE_MS = 400

/** 연달아 누른 두 누름이 서로 어긋나는 폭(px). 누른 점과, 거기서 이만큼 떨어진 사방의 네 점 밑을 본다 */
const SLOP = 12
const PROBES = [
  [0, 0],
  [SLOP, 0],
  [-SLOP, 0],
  [0, SLOP],
  [0, -SLOP],
] as const

const PRESSABLE = 'button, a[href], input, select, textarea, summary'

/** 한 점 밑의 누를 것과 그 글 — 같은 요소라도 글이 바뀌었으면 다른 버튼이다 */
function pressableAt(x: number, y: number): { el: Element; text: string } | null {
  const el = document.elementFromPoint(x, y)?.closest(PRESSABLE)
  return el ? { el, text: el.textContent } : null
}

/**
 * 같은 자리를 연달아 누른 둘째 누름이 방금 나타난 버튼에 떨어지지 않게 하는 가림막.
 *
 * 쟁반이 화면 아래 같은 자리에 붙어 있어서, 버튼을 누르면 그 자리에 다음 버튼이 선다('정답 보기'
 * 자리에 등급 칸, 홈의 금색 버튼 자리에 무대의 첫 버튼). 같은 자리를 연달아 누르면 둘째 누름이
 * 방금 나타난 버튼에 떨어져, 보지 않은 답에 등급이 기록되거나 단계가 넘어갔다.
 *
 * 포인터를 누를 때 그 자리 밑에 있던 것을 적어 두고, 누르거나 뗀 뒤 SETTLE_MS 동안 화면이 바뀔
 * 때마다 그 자리 밑을 다시 본다. 누를 것이 달라져 있으면(새 버튼이 섰거나, 화면이 밀려 다른 버튼이
 * 왔거나, 같은 버튼의 글이 바뀌었으면) 그 자리에 보이지 않는 가림막을 세우고 그때부터 SETTLE_MS
 * 뒤에 거둔다. 그 자리의 누름은 가림막이 받아서 버린다 — 쟁반 뒤의 보드 칸이나 입력란에도 닿지
 * 않는다. 가림막을 누르면 SETTLE_MS를 새로 센다.
 *
 * 막지 않는 것: 다른 자리의 누름, 누른 그 버튼이 그대로 남아 있을 때 다시 누르는 것(펼치고 접는 줄),
 * 누를 것이 없어진 자리(엿본 어절), 키보드와 낭독기의 누름, 누른 적 없이 바뀐 화면.
 * 채점·판정·저장과 키 처리는 건드리지 않는다. 타이머만 쓰므로 움직임 줄이기와 무관하다.
 * 크기와 겹침 순서는 base.css에 있다.
 */
export function SettleShield() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const shield = ref.current
    if (!shield) return

    let timer = 0
    // 마지막으로 누른 자리(화면 좌표)와, 누르는 순간 그 둘레의 다섯 점 밑에 있던 것
    let x = 0
    let y = 0
    let before: ReturnType<typeof pressableAt>[] = []

    const observer = new MutationObserver(() => {
      if (!shield.hidden) return
      const changed = PROBES.some(([dx, dy], i) => {
        const now = pressableAt(x + dx, y + dy)
        const was = before[i]
        return now !== null && (now.el !== was?.el || now.text !== was.text)
      })
      if (!changed) return
      shield.style.left = `${String(x)}px`
      shield.style.top = `${String(y)}px`
      shield.hidden = false
      arm()
    })
    const close = () => {
      observer.disconnect()
      shield.hidden = true
    }
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(close, SETTLE_MS)
    }
    const watch = () => {
      // 같은 대상을 다시 지켜봐도 겹쳐 걸리지 않는다
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })
      arm()
    }
    const onDown = (e: PointerEvent) => {
      // 가림막이 받은 누름은 자리를 새로 잡지 않는다. 다른 자리를 누르면 가림막을 거두고 거기서 다시 본다
      if (e.target !== shield) {
        shield.hidden = true
        x = e.clientX
        y = e.clientY
        before = PROBES.map(([dx, dy]) => pressableAt(x + dx, y + dy))
      }
      watch()
    }
    // 버튼은 손을 뗄 때 눌린다 — 오래 누르고 있다 떼어도 화면이 바뀌는 것을 보게, 뗄 때 다시 센다.
    // 가림막이 서 있는 동안에는 세지 않는다(가림막의 시간은 화면이 바뀐 때와 가림막에 닿은 때부터 센다)
    const onUp = () => {
      if (shield.hidden) watch()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
      window.clearTimeout(timer)
      close()
    }
  }, [])

  return <div ref={ref} className="settle-shield" aria-hidden="true" hidden />
}
