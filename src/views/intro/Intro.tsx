import './intro.css'

import { useId, useLayoutEffect, useRef } from 'react'

import { DiffView } from '../../components/DiffView'
import { LAMP_CORE_R, LAMP_HALO } from '../../components/LampMark'
import { RatingChoices } from '../../components/RatingBar'
import { BRAND_SUB, Wordmark, WORDMARK_DOT, WORDMARK_VIEWBOX } from '../../components/Wordmark'
import { required } from '../../domain/invariant'
import { DEFAULT_RETENTION } from '../../domain/scheduler'
import { Prompt } from '../review/Answer'
import { MODE_LABEL } from '../review/CardFace'
import { GRADE_ACTION, TYPING_LABEL } from '../review/modes'
import {
  arc,
  clamp,
  E,
  HOPS,
  lerp,
  type Point,
  prog,
  progAt,
  recall,
  S3_END,
  type S3State,
  s3State,
  TL,
} from './motion'
import {
  COPY,
  EXTRA,
  FORECAST,
  GHOST_STABILITY,
  GRADED,
  MISSED,
  R_MIN,
  SUGGESTED,
  TEETH,
  TICKS,
  TYPED,
  VERSE,
} from './script'

export interface IntroProps {
  /** 장면을 닫고 홈으로 — '시작하기', 끝 장면의 Esc */
  onClose: () => void
}

/* ── 장면 판 [배치] — 시안과 같은 값 ── */
/** 장면 판의 설계 높이. 화면이 이보다 낮으면 판을 통째로 줄이고, 높으면 BOARD_MAX까지 늘린다 */
const BOARD = 700
const BOARD_MAX = 820
/** 등불 원판의 기준 지름 — 크기는 이것에 대한 배율(transform)로만 바꾼다 */
const LAMP_BASE = 20
/** 그래프 위 등불의 지름 */
const DOT_D = 10
/** 그래프 판: 오른쪽 눈금 글자 자리, 위·아래 여백 */
const CHART = { gutter: 44, top: 10, bottom: 30 }

/** 후광 고리 — LampMark와 같은 반지름 비·불투명도 */
const HALOS = LAMP_HALO.map(([r, o]) => ({ k: r / LAMP_CORE_R, o }))

const CHARS = Array.from(TYPED)

/** 타이핑 시각 [배치]: 띄어쓰기 앞뒤로 조금 쉬고, 글자마다 조금씩 다르게 */
const CHAR_TIMES: readonly number[] = (() => {
  const w = CHARS.map((c, i) =>
    c === ' ' ? 1.9 : 1 + 0.35 * Math.sin(i * 2.3) * Math.sin(i * 0.7),
  )
  const total = w.reduce((a, b) => a + b, 0)
  const [a, b] = TL.s2.type
  let acc = 0
  return w.map((x) => {
    acc += x
    return a + ((acc - x) / total) * (b - a)
  })
})()

/** 4장 작은 그래프(로그 시간축) — 여섯 번의 복습이 고르게 보이도록 */
const SPARK = (() => {
  const W = 72
  const H = 36
  const maxD = 2200
  const X = (d: number) => (Math.log1p(d) / Math.log1p(maxD)) * W
  const Y = (r: number) => 2 + ((1 - r) / (1 - R_MIN)) * (H - 4)
  let ivan = ''
  for (const T of TEETH) {
    for (let i = 0; i <= 24; i++) {
      const day = T.start + (T.due - T.start) * (i / 24)
      ivan += `${ivan ? 'L' : 'M'}${X(day).toFixed(2)} ${Y(recall(day - T.start, T.stability)).toFixed(2)}`
    }
  }
  // 복습하지 않은 선은 3장 그래프와 같이 첫 복습 기한에서 갈라진다
  const g0 = required(TEETH[0], '1회').due
  let ghost = ''
  for (let i = 0; i <= 40; i++) {
    const day = g0 * Math.pow(maxD / g0, i / 40)
    ghost += `${ghost ? 'L' : 'M'}${X(day).toFixed(2)} ${Y(recall(day, GHOST_STABILITY)).toFixed(2)}`
  }
  return { W, H, hairY: Y(DEFAULT_RETENTION).toFixed(2), ivan, ghost }
})()

const noop = () => undefined

/**
 * 첫 실행 소개 — 두 축(축자 객관 채점 → FSRS 간격 반복)이 하나로 이어지는 17.5초 장면.
 * 정본 시안(ivan-intro-motion-v1.html)의 장면·문구·시각표를 앱 부품으로 다시 짠 것이다.
 *
 * React는 장면의 마크업을 한 번 그리고, 재생은 시각 t 하나로 매 프레임 transform·opacity와
 * 그래프 SVG 경로만 적는다(re-render 없음). 모든 값은 t만으로 정해진다. 금색은 장면을 건너다니는
 * 등불 하나다 — 워드마크의 점, 타이핑 커서, 채점 버튼, 제안 칸, 그래프 위의 점, 다시 워드마크의 점.
 *
 * 낭독기는 장면을 읽지 않는다(장면은 inert): 대화 상자의 이름과 두 축 요약 한 문단, 건너뛰기와
 * '시작하기'만 닿는다. 움직임 줄이기를 켠 기기에는 움직임 없이 마지막 장면만 보인다.
 */
export function Intro({ onClose }: IntroProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const summaryId = useId()

  useLayoutEffect(() => {
    closeRef.current = onClose
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    return play(root, () => {
      closeRef.current()
    })
  }, [])

  return (
    <div
      ref={rootRef}
      className="intro"
      role="dialog"
      aria-modal="true"
      aria-label={COPY.label}
      aria-describedby={summaryId}
      tabIndex={-1}
    >
      <header className="intro-topbar">
        <button type="button" className="btn intro-skip" data-part="skip" data-fx="">
          {COPY.skip}
        </button>
      </header>

      <div className="intro-viewport">
        <div className="intro-frame" data-part="frame">
          <p className="sr-only" id={summaryId}>
            {COPY.summary}
          </p>

          {/* 1장 — 등불이 켜져 워드마크 i의 점이 된다 */}
          <section className="intro-scene intro-s1" data-part="s1" inert aria-hidden="true">
            <div className="intro-wm" data-part="wm1" data-fx="">
              <Wordmark dot={false} />
            </div>
            <p className="intro-s1-sub" data-part="s1-sub" data-fx="">
              {BRAND_SUB}
            </p>
          </section>

          {/* 2장 — 축자 객관 채점: 앱의 타이핑 감사 카드 */}
          <section className="intro-scene intro-s2" data-part="s2" inert aria-hidden="true">
            <h2 className="intro-title" data-part="s2-title" data-fx="">
              {COPY.s2Title}
            </h2>
            <p className="intro-lede" data-part="s2-lede" data-fx="">
              {COPY.s2Lede[0]}
              <br />
              {COPY.s2Lede[1]}
            </p>
            <div className="panel intro-card" data-part="s2-card" data-fx="">
              <p className="card-head">
                <span className="mode-tag">{MODE_LABEL.typing}</span>
              </p>
              <Prompt direction="ref" verse={VERSE} />
              <div className="intro-work">
                <div className="intro-typing" data-part="s2-typing" data-fx="">
                  <p className="muted small">{TYPING_LABEL}</p>
                  <div className="typing-input" data-part="s2-input">
                    {CHARS.map((c, i) => (
                      <span key={i} className="intro-ch">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="intro-grade" data-part="s2-grade" data-fx="">
                    <button type="button" className="btn btn-primary" disabled>
                      {GRADE_ACTION}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary intro-grade-lit"
                      data-part="s2-grade-lit"
                    >
                      {GRADE_ACTION}
                    </button>
                  </div>
                </div>
                <div data-part="s2-graded">
                  <DiffView grade={GRADED} target={VERSE.text} />
                  <div className="intro-rating" data-part="s2-rating" data-fx="">
                    <RatingChoices intervals={FORECAST.preview} onRate={noop} />
                    <div className="intro-suggest" data-part="s2-suggest">
                      <RatingChoices
                        intervals={FORECAST.preview}
                        suggested={SUGGESTED}
                        onRate={noop}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="intro-note" data-part="s2-note" data-fx="">
              {COPY.s2Note}
            </p>
          </section>

          {/* 3장 — FSRS 간격 반복: 앱 스케줄러의 예상치 */}
          <section className="intro-scene intro-s3" data-part="s3" inert aria-hidden="true">
            <h2 className="intro-title" data-part="s3-title" data-fx="">
              {COPY.s3Title}
            </h2>
            <p className="intro-lede" data-part="s3-lede" data-fx="">
              {COPY.s3Lede[0]}
              <br />
              {COPY.s3Lede[1]}
            </p>
            <div className="intro-chart" data-part="chart" data-fx="">
              <svg data-part="chart-svg" focusable="false">
                <line className="intro-hair" data-part="l-ret" />
                <line className="intro-hair" data-part="l-axis" />
                <g>
                  {TICKS.map(([day]) => (
                    <line key={day} className="intro-hair" data-tick-line="" />
                  ))}
                </g>
                <path className="intro-ghost" data-part="p-ghost" />
                <path className="intro-ivan" data-part="p-ivan" />
              </svg>
              <span className="intro-lab" data-part="y100">
                {COPY.y100}
              </span>
              <span className="intro-lab" data-part="y-ret">
                {COPY.yRetention}
              </span>
              <span className="intro-lab" data-part="x0">
                {COPY.x0}
              </span>
              <span className="intro-lab" data-part="ghost-lab">
                {COPY.ghost}
              </span>
              {TICKS.map(([day, label]) => (
                <span key={day} className="intro-lab" data-tick-lab="">
                  {label}
                </span>
              ))}
            </div>
            <dl className="figures intro-readout" data-part="readout" data-fx="">
              <div>
                <dt>{COPY.readoutHeads[0]}</dt>
                <dd data-part="ro-n">
                  {COPY.readoutN.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>{COPY.readoutHeads[1]}</dt>
                <dd data-part="ro-score">
                  {TEETH.map((x, i) => (
                    <span key={i} className={`intro-tone-${x.tone}`}>
                      {x.mark} {x.score}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>{COPY.readoutHeads[2]}</dt>
                <dd data-part="ro-rating">
                  {TEETH.map((x, i) => (
                    <span key={i} className={`intro-tone-${x.tone}`}>
                      {x.rating}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>{COPY.readoutHeads[3]}</dt>
                <dd data-part="ro-next">
                  {COPY.readoutNext.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="intro-note" data-part="s3-note" data-fx="">
              {COPY.s3Note}
            </p>
            <p className="intro-foot" data-part="s3-foot" data-fx="">
              {COPY.s3Foot}
            </p>
          </section>

          {/* 4장 — 두 축을 한 장에 */}
          <section className="intro-scene intro-s4" data-part="s4">
            <div className="intro-s4-body" inert aria-hidden="true">
              <div className="intro-s4-top">
                <div className="intro-wm" data-part="wm4" data-fx="">
                  <Wordmark dot={false} />
                </div>
                <h2 className="intro-hero" data-part="s4-title" data-fx="">
                  {COPY.s4Title}
                </h2>
                <p className="intro-course" data-part="s4-course" data-fx="">
                  {COPY.s4Course}
                </p>
              </div>
              <ul className="intro-axes">
                <li data-part="s4-a1" data-fx="">
                  <span className="intro-axis-viz verse">
                    <span className="diff-miss">{MISSED.join('')}</span>
                    <span className="diff-extra">{EXTRA.join('')}</span>
                  </span>
                  <div>
                    <p className="intro-axis-name">{COPY.axis1Name}</p>
                    <p className="intro-axis-desc">{COPY.axis1Desc}</p>
                  </div>
                </li>
                <li data-part="s4-a2" data-fx="">
                  <span className="intro-axis-viz">
                    <svg
                      viewBox={`0 0 ${String(SPARK.W)} ${String(SPARK.H)}`}
                      focusable="false"
                    >
                      <line
                        className="intro-hair"
                        x1="0"
                        x2={SPARK.W}
                        y1={SPARK.hairY}
                        y2={SPARK.hairY}
                      />
                      <path className="intro-spark-ghost" d={SPARK.ghost} />
                      <path className="intro-spark-ivan" d={SPARK.ivan} />
                    </svg>
                  </span>
                  <div>
                    <p className="intro-axis-name">{COPY.axis2Name}</p>
                    <p className="intro-axis-desc">{COPY.axis2Desc}</p>
                  </div>
                </li>
              </ul>
              <p className="callout intro-link" data-part="s4-link" data-fx="">
                {COPY.link}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary intro-cta"
              data-part="cta"
              data-fx=""
            >
              {COPY.start}
            </button>
          </section>
        </div>
      </div>

      <div className="intro-lamp" data-part="lamp" aria-hidden="true">
        {HALOS.map(({ k }) => (
          <span key={k} data-halo="" style={halfOffset} />
        ))}
        <span data-part="lamp-core" style={halfOffset} />
      </div>
    </div>
  )
}

/** 등불 원판: 기준 지름의 원을 가운데에 둔다(크기는 배율로) */
const halfOffset = {
  left: -LAMP_BASE / 2,
  top: -LAMP_BASE / 2,
  width: LAMP_BASE,
  height: LAMP_BASE,
} as const

type Styled = HTMLElement | SVGElement

interface Dot extends Point {
  /** 점의 지름 */
  d: number
}

interface Layout {
  /** 판의 배율(화면이 낮으면 1 미만) */
  s: number
  a1: Dot
  /** 1장에서 등불이 켜지는 자리 — 워드마크 가운데 조금 위 */
  a1c: Point
  a4: Dot
  caret: Point[]
  caretH: number
  pill: Point
  chart: { x: number; y: number; w: number; h: number; pw: number; ph: number }
  tickLab: number[]
  ghostLab: number
}

/**
 * 재생기 — 장면의 DOM에 시각 t의 그림을 적는다. 정리 함수를 돌려준다.
 * 시안의 render(t)를 그대로 옮겼다: 같은 t면 같은 자리·같은 불투명도다.
 */
function play(root: HTMLElement, close: () => void): () => void {
  const found = new Map<string, Element>()
  const find = (name: string): Element => {
    const hit =
      found.get(name) ??
      required(root.querySelector(`[data-part="${name}"]`), `소개 장면의 ${name}`)
    found.set(name, hit)
    return hit
  }
  const part = (name: string): HTMLElement => {
    const e = find(name)
    if (!(e instanceof HTMLElement)) throw new Error(`소개 장면의 ${name}이 HTML 요소가 아니다`)
    return e
  }
  const svgPart = (name: string): SVGElement => {
    const e = find(name)
    if (!(e instanceof SVGElement)) throw new Error(`소개 장면의 ${name}이 SVG 요소가 아니다`)
    return e
  }
  const all = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)]

  const frame = part('frame')
  const viewport = required(root.querySelector<HTMLElement>('.intro-viewport'), '장면 칸')
  const skip = part('skip')
  const cta = part('cta')
  const lamp = part('lamp')
  const core = part('lamp-core')
  const halos = all('[data-halo]').map((el, i) => ({ el, ...required(HALOS[i], '후광') }))
  const charEls = all('.intro-ch')
  const stem1 = required(part('wm1').querySelector<SVGRectElement>('rect'), '1장 기둥')
  const stem4 = required(part('wm4').querySelector<SVGRectElement>('rect'), '4장 기둥')
  const graded = part('s2-graded')
  const score = required(graded.querySelector<HTMLElement>('.diff-score'), '채점 점수')
  const words = required(graded.querySelector<HTMLElement>('.diff-words'), '채점 본문')
  const suggest = part('s2-suggest')
  const pill = required(suggest.querySelector<HTMLElement>('.rate-suggest'), '제안 표지')
  const chartEl = part('chart')
  const svg = svgPart('chart-svg')
  const lRet = svgPart('l-ret')
  const lAxis = svgPart('l-axis')
  const pIvan = svgPart('p-ivan')
  const pGhost = svgPart('p-ghost')
  const tickLines = [...root.querySelectorAll<SVGLineElement>('[data-tick-line]')]
  const tickLabs = all('[data-tick-lab]')
  const ghostLab = part('ghost-lab')
  const ro = ['ro-n', 'ro-score', 'ro-rating', 'ro-next'].map((k) => [
    ...part(k).querySelectorAll<HTMLElement>('span'),
  ])
  const el = (k: string) => part(k)
  const tail1 = required(el('wm1').querySelector<HTMLElement>('.brand-tail'), '1장 van')
  const tail4 = required(el('wm4').querySelector<HTMLElement>('.brand-tail'), '4장 van')

  let skipGone = false
  const M: Layout = {
    s: 1,
    a1: { x: 0, y: 0, d: 0 },
    a1c: { x: 0, y: 0 },
    a4: { x: 0, y: 0, d: 0 },
    caret: [],
    caretH: 0,
    pill: { x: 0, y: 0 },
    chart: { x: 0, y: 0, w: 0, h: 0, pw: 0, ph: 0 },
    tickLab: [],
    ghostLab: 0,
  }

  /** 판의 화면 자리 — 재는 때(시작·화면 크기 바뀜)만 바뀌므로 매 프레임 다시 읽지 않는다 */
  let frameAt = { left: 0, top: 0 }

  /* ── 배치 측정: 움직임을 걷어 낸 판 위의 자리로 재고, 화면 좌표는 판의 배율로 옮긴다 ── */
  function measure() {
    // 화면이 판보다 높으면 판을 늘려(최대 BOARD_MAX) 가운데에 놓고, 낮으면 판을 통째로 줄인다.
    // 쓸 수 있는 높이는 윗줄과 아래 안전 영역을 뺀 장면 칸이다
    const avail = viewport.clientHeight - 8
    const H = avail >= BOARD ? Math.min(avail, BOARD_MAX) : BOARD
    M.s = avail >= BOARD ? 1 : avail / BOARD
    frame.style.height = `${String(H)}px`
    frame.style.transform = M.s < 1 ? `scale(${M.s.toFixed(4)})` : ''
    frame.style.marginBottom = M.s < 1 ? `${(-H * (1 - M.s)).toFixed(1)}px` : ''

    root.classList.add('is-measuring')
    const fr = frame.getBoundingClientRect()
    const box = (e: Element) => {
      const r = e.getBoundingClientRect()
      return { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height }
    }
    const wmDot = (wm: HTMLElement): Dot => {
      const i = box(required(wm.querySelector('svg'), '워드마크 i'))
      return {
        x: i.x + i.w * (WORDMARK_DOT.cx / WORDMARK_VIEWBOX.width),
        y: i.y + i.h * ((WORDMARK_VIEWBOX.height + WORDMARK_DOT.cy) / WORDMARK_VIEWBOX.height),
        d: i.h * ((2 * WORDMARK_DOT.r) / WORDMARK_VIEWBOX.height),
      }
    }
    const wm1 = el('wm1')
    M.a1 = wmDot(wm1)
    const mark = box(required(wm1.querySelector('.brand-wordmark'), '워드마크'))
    // 켜지는 자리: 워드마크 가운데 조금 위 — 'van' 글자보다 높아서 내려앉을 때 글자와 겹치지 않는다
    M.a1c = { x: mark.x + mark.w / 2, y: M.a1.y - 16 }
    M.a4 = wmDot(el('wm4'))
    // 커서 자리: i글자를 친 뒤의 오른쪽 끝(첫 글자 전에는 왼쪽 끝)
    M.caret = []
    for (let i = 0; i <= charEls.length; i++) {
      const c = box(required(charEls[Math.max(0, i - 1)], `${String(i)}번째 글자`))
      M.caret.push({ x: i === 0 ? c.x : c.x + c.w, y: c.y + c.h / 2 })
    }
    M.caretH = parseFloat(getComputedStyle(el('s2-input')).fontSize) * 1.22
    const p = box(pill)
    M.pill = { x: p.x + p.w / 2, y: p.y + p.h / 2 - p.h * 0.55 }
    const c = box(chartEl)
    M.chart = {
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      pw: c.w - CHART.gutter,
      ph: c.h - CHART.top - CHART.bottom,
    }
    svg.setAttribute('viewBox', `0 0 ${String(M.chart.w)} ${String(M.chart.h)}`)
    M.tickLab = tickLabs.map((t) => t.offsetWidth)
    M.ghostLab = ghostLab.offsetWidth
    root.classList.remove('is-measuring')
    const at = frame.getBoundingClientRect()
    frameAt = { left: at.left, top: at.top }
  }

  const CX = (day: number, W: number) => (day / W) * M.chart.pw
  const CY = (r: number) => CHART.top + ((1 - r) / (1 - R_MIN)) * M.chart.ph
  const toScreen = (q: Point): Point => ({
    x: frameAt.left + q.x * M.s,
    y: frameAt.top + q.y * M.s,
  })
  const chartLamp = (st: S3State): Point => ({
    x: M.chart.x + CX(st.lampDay, st.W),
    y: M.chart.y + CY(st.lampR),
  })

  function fx(e: Styled, o: number, x = 0, y = 0) {
    e.style.opacity = o.toFixed(3)
    // 제자리면 인라인 transform을 비운다 — 끝 장면의 버튼이 앱의 누름(:active 1px)을 그대로 받게
    const still = Math.abs(x) < 0.005 && Math.abs(y) < 0.005
    e.style.transform = still ? '' : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    e.style.visibility = o < 0.002 ? 'hidden' : 'visible'
  }
  // 놓이는 움직임: 6px 아래에서 떠오르며 나타나고, 나갈 때는 위로 6px 물러나며 사라진다
  function appear(e: Styled, t: number, at: number, out = Infinity, dur = 0.46, rise = 6) {
    const kin = E.out(progAt(t, at, at + dur))
    const kout = Number.isFinite(out) ? E.in(progAt(t, out, out + 0.34)) : 0
    fx(e, kin * (1 - kout), 0, (1 - kin) * rise - kout * rise)
  }
  const show = (e: Styled, on: boolean) => {
    e.style.visibility = on ? 'visible' : 'hidden'
  }

  function setLamp(x: number, y: number, sx: number, sy: number, o: number, hk = 0, ho = 0) {
    lamp.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    lamp.style.opacity = o.toFixed(3)
    lamp.style.visibility = o < 0.002 ? 'hidden' : 'visible'
    core.style.transform = `scale(${(sx / LAMP_BASE).toFixed(4)}, ${(sy / LAMP_BASE).toFixed(4)})`
    for (const h of halos) {
      h.el.style.transform = `scale(${((hk * h.k) / LAMP_BASE).toFixed(4)})`
      h.el.style.opacity = (h.o * ho).toFixed(3)
    }
  }

  /** 시각 t의 장면을 그린다. 모든 값은 t만으로 정해진다 */
  function render(t: number) {
    const s = M.s

    // 1장
    {
      const T = TL.s1
      const out = E.in(progAt(t, T.out, T.out + 0.38))
      const stem = E.out(prog(t, T.stem))
      stem1.style.transform = `scaleY(${Math.max(0.0001, stem).toFixed(4)})`
      stem1.style.opacity = stem > 0.001 ? '1' : '0'
      const tail = E.out(prog(t, T.tail))
      fx(tail1, tail * (1 - out), (1 - tail) * -10, 0)
      fx(el('wm1'), 1 - out, 0, -8 * out)
      appear(el('s1-sub'), t, T.sub[0], T.out, 0.5)
      show(el('s1'), t <= T.out + 0.4)
    }

    // 2장
    {
      const T = TL.s2
      show(el('s2'), !(t < T.in - 0.01 || t > T.out + 0.4))
      appear(el('s2-title'), t, T.in, T.out)
      appear(el('s2-lede'), t, T.in + 0.08, T.out)
      appear(el('s2-card'), t, T.in + 0.16, T.out)
      charEls.forEach((c, i) => {
        c.style.opacity = t >= (CHAR_TIMES[i] ?? Infinity) ? '1' : '0'
      })
      // 채점 버튼: 꺼진 등불 → 켜진 등불 → 누름
      const lit = E.std(prog(t, T.lit))
      el('s2-grade-lit').style.opacity = lit.toFixed(3)
      const press = Math.sin(Math.PI * prog(t, T.press))
      const rev = E.out(progAt(t, T.reveal, T.reveal + 0.22))
      fx(el('s2-grade'), 1, 0, press)
      fx(el('s2-typing'), 1 - rev, 0, 0)
      appear(score, t, T.reveal, Infinity, 0.22, 0)
      appear(words, t, T.reveal + 0.04, Infinity, 0.26, 0)
      appear(el('s2-rating'), t, T.rating, Infinity, 0.42, 6)
      const sg = E.out(prog(t, T.suggest))
      suggest.style.opacity = sg.toFixed(3)
      pill.style.transform = `translate(-50%, -55%) scale(${lerp(0.6, 1, sg).toFixed(3)})`
      appear(el('s2-note'), t, T.note, T.out)
    }

    // 3장
    const st = s3State(t)
    {
      const T = TL.s3
      show(el('s3'), !(t < T.in - 0.01 || t > T.out + 0.4))
      appear(el('s3-title'), t, T.in, T.out)
      appear(el('s3-lede'), t, T.in + 0.08, T.out)
      appear(chartEl, t, T.in + 0.16, T.out)
      appear(el('readout'), t, T.in + 0.24, T.out)
      appear(el('s3-note'), t, S3_END + T.note, T.out)
      appear(el('s3-foot'), t, S3_END + T.note + 0.1, T.out)

      const C = M.chart
      lRet.setAttribute('x1', '0')
      lRet.setAttribute('x2', String(C.pw))
      lRet.setAttribute('y1', String(CY(DEFAULT_RETENTION)))
      lRet.setAttribute('y2', String(CY(DEFAULT_RETENTION)))
      const by = C.h - CHART.bottom + 8
      lAxis.setAttribute('x1', '0')
      lAxis.setAttribute('x2', String(C.pw))
      lAxis.setAttribute('y1', String(by))
      lAxis.setAttribute('y2', String(by))

      // 복습한 선
      let d = ''
      for (let j = 0; j <= st.k; j++) {
        const Tj = required(TEETH[j], `${String(j + 1)}회`)
        const endDay = j < st.k ? Tj.due : st.P
        const span = endDay - Tj.start
        const N = 40
        for (let i = 0; i <= N; i++) {
          const u = i / N
          const day = Tj.start + span * u * u
          d += `${d ? 'L' : 'M'}${CX(day, st.W).toFixed(2)} ${CY(recall(day - Tj.start, Tj.stability)).toFixed(2)}`
        }
      }
      pIvan.setAttribute('d', d)
      // 복습하지 않은 선: 첫 복습 기한부터 갈라진다
      let g = ''
      const g0 = required(TEETH[0], '1회').due
      if (st.P > g0 + 1e-6) {
        const N = 60
        for (let i = 0; i <= N; i++) {
          const day = g0 * Math.pow(st.P / g0, i / N)
          g += `${g ? 'L' : 'M'}${CX(day, st.W).toFixed(2)} ${CY(recall(day, GHOST_STABILITY)).toFixed(2)}`
        }
      }
      pGhost.setAttribute('d', g)

      // 눈금: 창이 넓어지면 왼쪽으로 밀려 들어가고, 너무 붙으면 감춘다
      let lastX = C.pw + 99
      for (let i = TICKS.length - 1; i >= 0; i--) {
        const [day] = required(TICKS[i], '눈금')
        const x = CX(day, st.W)
        let o = clamp((C.pw - 8 - x) / 24) * clamp((x - 34) / 30)
        if (lastX - x < 46) o = 0
        if (o > 0.05) lastX = x
        const line = required(tickLines[i], '눈금 선')
        line.setAttribute('x1', String(x))
        line.setAttribute('x2', String(x))
        line.setAttribute('y1', String(by - 4))
        line.setAttribute('y2', String(by))
        line.style.opacity = String(o)
        const lab = required(tickLabs[i], '눈금 글자')
        lab.style.opacity = o.toFixed(3)
        lab.style.transform = `translate3d(${(x - (M.tickLab[i] ?? 0) / 2).toFixed(2)}px, ${(by + 8).toFixed(2)}px, 0)`
      }
      el('x0').style.transform = `translate3d(0, ${(by + 8).toFixed(2)}px, 0)`
      el('y100').style.transform =
        `translate3d(${String(C.pw + 10)}px, ${(CY(1) - 6).toFixed(2)}px, 0)`
      el('y-ret').style.transform =
        `translate3d(${String(C.pw + 10)}px, ${(CY(DEFAULT_RETENTION) - 6).toFixed(2)}px, 0)`
      // 끝에 남는 값: 복습하지 않으면 남는 기억률
      const lastDue = required(TEETH.at(-1), '마지막 복습').due
      const go = E.out(progAt(t, S3_END - 0.1, S3_END + 0.4))
      const gx = CX(lastDue, st.W)
      const gy = CY(recall(lastDue, GHOST_STABILITY))
      ghostLab.style.opacity = go.toFixed(3)
      ghostLab.style.transform = `translate3d(${(gx - M.ghostLab).toFixed(2)}px, ${(gy + 10).toFixed(2)}px, 0)`

      // 숫자 묶음: 복습할 때마다 값이 아래에서 올라와 바뀐다
      const changeAt = [T.in + 0.24, ...HOPS.map((h) => h.z0)]
      for (const spans of ro) {
        spans.forEach((sp, i) => {
          const at = changeAt[i] ?? Infinity
          const next = changeAt[i + 1]
          const kin = i === 0 ? 1 : E.out(progAt(t, at, at + 0.3))
          const kout = next !== undefined ? E.std(progAt(t, next, next + 0.18)) : 0
          sp.style.opacity = (kin * (1 - kout)).toFixed(3)
          sp.style.transform = `translate3d(0, ${((1 - kin) * 8 - kout * 6).toFixed(2)}px, 0)`
        })
      }
    }

    // 4장
    const T4 = TL.s4
    const ctaAt = T4.in + 1.46
    {
      show(el('s4'), t >= T4.in - 0.2)
      const stem = E.out(progAt(t, T4.travel[1] - 0.1, T4.travel[1] + 0.36))
      stem4.style.transform = `scaleY(${Math.max(0.0001, stem).toFixed(4)})`
      stem4.style.opacity = stem > 0.001 ? '1' : '0'
      const tail = E.out(progAt(t, T4.travel[1], T4.travel[1] + 0.46))
      fx(tail4, tail, (1 - tail) * -8, 0)
      fx(el('wm4'), 1)
      appear(el('s4-title'), t, T4.in + 0.56)
      appear(el('s4-course'), t, T4.in + 0.68)
      appear(el('s4-a1'), t, T4.in + 0.9)
      appear(el('s4-a2'), t, T4.in + 1.04)
      appear(el('s4-link'), t, T4.in + 1.22)
      appear(cta, t, ctaAt, Infinity, 0.42, 6)
      // 건너뛰기는 '시작하기'가 나타날 때 함께 물러나며 넘겨준다 — 누를 것이 늘 하나는 보인다
      const handed = E.out(progAt(t, ctaAt, ctaAt + 0.42))
      fx(skip, 1 - handed)
      const gone = handed > 0.5
      if (gone !== skipGone) {
        skipGone = gone
        skip.style.pointerEvents = gone ? 'none' : ''
        skip.tabIndex = gone ? -1 : 0
        if (gone && document.activeElement === skip) cta.focus()
      }
    }

    // 등불: 장면을 건너다니는 하나뿐인 금색
    {
      const A1 = toScreen(M.a1)
      const d1 = M.a1.d * s
      const T1 = TL.s1
      const T2 = TL.s2
      const T3 = TL.s3
      if (t < T2.travel[0]) {
        // 화면 가운데에서 켜진 등불이 작아지며 i의 점 자리로 내려앉는다
        const on = E.out(prog(t, T1.lampOn))
        const shrink = E.inOut(prog(t, T1.shrink))
        const big = lerp(lerp(2.3, 3.3, on), 1, shrink)
        const C1 = toScreen(M.a1c)
        setLamp(
          lerp(C1.x, A1.x, shrink),
          lerp(C1.y, A1.y, shrink),
          d1 * big,
          d1 * big,
          on,
          d1 * big,
          on * (1 - shrink),
        )
      } else if (t < T2.travel[1]) {
        const u = E.inOut(prog(t, T2.travel))
        const c0 = toScreen(required(M.caret[0], '첫 커서'))
        const p = arc(A1, c0, u, -0.22)
        const k = E.std(progAt(t, T2.travel[0] + 0.25, T2.travel[1]))
        setLamp(p.x, p.y, lerp(d1, 2 * s, k), lerp(d1, M.caretH * s, k), 1)
      } else if (t < T2.caretOff[1]) {
        let n = 0
        while (n < CHAR_TIMES.length && t >= (CHAR_TIMES[n] ?? Infinity)) n++
        const c = toScreen(required(M.caret[n], `${String(n)}번째 커서`))
        const off = prog(t, T2.caretOff)
        setLamp(c.x + 1.5 * s, c.y, 2 * s, M.caretH * s, 1 - off)
      } else if (t < T3.travel[0]) {
        setLamp(0, 0, 1, 1, 0)
      } else if (t < T3.travel[1]) {
        const u = E.inOut(prog(t, T3.travel))
        const p0 = toScreen(M.pill)
        const p1 = toScreen(chartLamp(s3State(T3.draw0[0])))
        const p = arc(p0, p1, u, 0.16)
        const dd = DOT_D * s * lerp(0.7, 1, u)
        setLamp(p.x, p.y, dd, dd, E.out(progAt(t, T3.travel[0], T3.travel[0] + 0.12)))
      } else if (t < T4.travel[0]) {
        const p = toScreen(chartLamp(st))
        const pk = st.pulse > 0 ? Math.sin(Math.PI * progAt(t, st.pulse, st.pulse + 0.34)) : 0
        const dd = DOT_D * s * (1 + 0.45 * pk)
        setLamp(p.x, p.y, dd, dd, 1, dd, 0.9 * pk)
      } else {
        const u = E.inOut(prog(t, T4.travel))
        const p0 = toScreen(chartLamp(s3State(T3.out)))
        const A4 = toScreen(M.a4)
        const p = arc(p0, A4, u, 0.2)
        const dd = lerp(DOT_D * s, M.a4.d * s, u)
        setLamp(p.x, p.y, dd, dd, 1)
      }
    }
  }

  /* ── 재생 ── */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // 움직임 줄이기: 움직이지 않고 마지막 장면(두 축 요약)만 보인다
  let now = reduced ? TL.end : 0
  let last = 0
  let raf = 0
  let alive = true
  /** 글꼴을 받고 자리를 쟀다(그리기 시작했다) */
  let ready = false
  /** 재생 중이다 — 끝 장면에 닿거나 건너뛰면 멈춘다 */
  let running = false

  const paint = () => {
    render(now)
  }
  const stopFrames = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  // 재생을 이어 간다. 탭이 숨어 있으면 보일 때까지 기다린다 — 숨은 동안의 시간을 장면에 더하지 않는다
  const resume = () => {
    if (!alive || !running || raf !== 0 || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const finish = () => {
    running = false
    stopFrames()
    now = TL.end
    // 그리기 전(글꼴을 받는 중)에 건너뛰면 끝 장면은 준비되는 대로 선다(start)
    if (!ready) return
    paint()
    cta.focus()
  }
  function tick(ts: number) {
    raf = 0
    if (!alive || !running) return
    now = Math.min(TL.end, now + Math.max(0, ts - last) / 1000)
    last = ts
    if (now >= TL.end) {
      finish()
      return
    }
    paint()
    raf = requestAnimationFrame(tick)
  }

  const start = () => {
    if (!alive) return
    measure()
    paint()
    ready = true
    root.setAttribute('data-ready', '')
    if (now >= TL.end) {
      cta.focus()
      return
    }
    running = true
    resume()
  }

  const onSkip = () => {
    finish()
  }
  const onStart = () => {
    close()
  }
  // 장면이 떠 있는 동안 키는 장면 것이다 — 뒤 화면(inert)의 키 처리기에 닿지 않게 창에서 먼저 받아
  // 멈춘다(누름·Tab 같은 브라우저 기본 동작은 그대로). Esc는 재생 중에는 건너뛰기, 끝 장면에서는 '시작하기'.
  // 길게 눌러 되풀이되는 Esc는 받지 않는다 — 끝 장면을 보지 못한 채 닫히지 않게
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Tab') {
      // 포커스는 대화 상자 안에서 돈다 — 뒤 화면은 inert라, 놓아두면 Tab이 문서 밖(body)으로 샌다
      e.preventDefault()
      const stops = [skip, cta].filter(
        (b) => b.tabIndex >= 0 && getComputedStyle(b).visibility === 'visible',
      )
      const at = stops.findIndex((b) => b === document.activeElement)
      const next = e.shiftKey
        ? stops[at <= 0 ? stops.length - 1 : at - 1]
        : stops[(at + 1) % stops.length]
      next?.focus()
      return
    }
    if (e.key !== 'Escape' || e.isComposing) return
    e.preventDefault()
    if (e.repeat) return
    if (now < TL.end) finish()
    else close()
  }
  const onResize = () => {
    if (!ready) return
    measure()
    paint()
  }
  const onVisibility = () => {
    if (document.hidden) stopFrames()
    else resume()
  }

  skip.addEventListener('click', onSkip)
  cta.addEventListener('click', onStart)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  root.focus()
  void document.fonts.ready.then(start)

  return () => {
    alive = false
    cancelAnimationFrame(raf)
    skip.removeEventListener('click', onSkip)
    cta.removeEventListener('click', onStart)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
