/**
 * 소개 장면의 시각표와 움직임 셈 — 정본 시안(ivan-intro-motion-v1.html)의 TL·이징·3장 일정을
 * 그대로 옮긴 것. 모든 값은 시각 t(초)만으로 정해진다: 같은 t면 같은 그림이다.
 */
import { required } from '../../domain/invariant'
import { recallAfter } from '../../domain/scheduler'
import { TEETH } from './script'

/** 시각표(초) — 시안의 TL과 같다 */
export const TL = {
  s1: {
    lampOn: [0.0, 0.55],
    shrink: [0.7, 1.3],
    stem: [0.9, 1.36],
    tail: [1.06, 1.54],
    sub: [1.36, 1.76],
    out: 2.15,
  },
  s2: {
    in: 2.4,
    travel: [2.3, 3.04],
    type: [3.08, 4.6],
    caretOff: [4.63, 4.77],
    lit: [4.67, 4.89],
    press: [4.99, 5.13],
    reveal: 5.17,
    rating: 5.47,
    suggest: [5.67, 5.95],
    note: 5.97,
    out: 7.95,
  },
  s3: {
    in: 8.32,
    travel: [7.98, 8.78],
    draw0: [8.82, 9.52],
    zoom: 0.34,
    draws: [0.48, 0.44, 0.42, 0.42, 0.48],
    note: 0.12,
    out: 15.2,
  },
  s4: { in: 15.5, travel: [15.24, 15.94] },
  end: 17.5,
} as const

export type Span = readonly [number, number]

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
export const prog = (t: number, [a, b]: Span): number => clamp((t - a) / (b - a))
export const progAt = (t: number, a: number, b: number): number => clamp((t - a) / (b - a))

/** CSS cubic-bezier와 같은 곡선 — 이분법으로 x에서 매개변수를 찾는다 */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 28; i++) {
      const v = sx(t)
      if (Math.abs(v - x) < 1e-5) break
      if (v < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}

/** 이징 — out·in은 tokens.css의 --ease-out·--ease-in과 같은 곡선 */
export const E = {
  out: bezier(0.16, 1, 0.3, 1),
  in: bezier(0.7, 0, 0.84, 0),
  inOut: bezier(0.65, 0, 0.35, 1),
  std: bezier(0.4, 0, 0.2, 1),
}

export interface Point {
  x: number
  y: number
}

/** 두 점 사이를 살짝 휘어 지나간다(이차 베지어, lift = 곡률) */
export function arc(p0: Point, p1: Point, u: number, lift: number): Point {
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const cx = mx - dy * lift
  const cy = my + dx * lift
  const v = 1 - u
  return {
    x: v * v * p0.x + 2 * v * u * cx + u * u * p1.x,
    y: v * v * p0.y + 2 * v * u * cy + u * u * p1.y,
  }
}

/** 복습한 뒤 days일의 기억률 — 앱 스케줄러의 망각 곡선 */
export const recall = recallAfter

const tooth = (k: number) => required(TEETH[k], `${String(k + 1)}회 복습`)

/** 3장 일정: 첫 이(齒)를 그리고, 복습마다 [창을 넓힘 → 다음 이를 그림] */
export interface Hop {
  k: number
  /** 창을 넓히기 시작 */
  z0: number
  /** 창을 다 넓힘 = 이를 그리기 시작 */
  z1: number
  /** 이를 다 그림 */
  d1: number
}

export const HOPS: readonly Hop[] = (() => {
  const hops: Hop[] = []
  let t: number = TL.s3.draw0[1]
  for (let k = 1; k < TEETH.length; k++) {
    const z0 = t
    const z1 = t + TL.s3.zoom
    const d1 = z1 + required(TL.s3.draws[k - 1], `${String(k)}번째 그리기 시간`)
    hops.push({ k, z0, z1, d1 })
    t = d1
  }
  return hops
})()

/** 3장 그리기가 끝나는 시각 */
export const S3_END: number = HOPS.at(-1)?.d1 ?? TL.s3.draw0[1]

/** k번째 이를 그릴 때 보이는 시간 창(날수) — 끝에 조금 여유를 둔다 */
export const winFor = (k: number): number => tooth(k).due * (k === 0 ? 1.25 : 1.16)

/** k번째 이가 끝나는 자리(다음 기한)의 기억률 */
export const endR = (k: number): number => {
  const T = tooth(k)
  return recall(T.due - T.start, T.stability)
}

export interface S3State {
  /** 보이는 시간 창(날수) */
  W: number
  /** 지금 그리는 이의 펜 끝(날수) */
  P: number
  /** 지금 그리는 이 */
  k: number
  lampDay: number
  lampR: number
  /** 숫자 묶음이 보이는 회차 */
  idx: number
  /** 이 회차의 복습이 시작된 시각(등불이 한 번 부푼다), 첫 회차는 -1 */
  pulse: number
}

export function s3State(t: number): S3State {
  const [a, b] = TL.s3.draw0
  const first = tooth(0)
  if (t <= b) {
    const u = E.inOut(progAt(t, a, b))
    return {
      W: winFor(0),
      P: lerp(0, first.due, u),
      k: 0,
      lampDay: first.due,
      lampR: endR(0),
      idx: 0,
      pulse: -1,
    }
  }
  for (const h of HOPS) {
    const prev = tooth(h.k - 1)
    const cur = tooth(h.k)
    if (t < h.z1) {
      const u = E.inOut(progAt(t, h.z0, h.z1))
      return {
        W: Math.exp(lerp(Math.log(winFor(h.k - 1)), Math.log(winFor(h.k)), u)),
        P: cur.start,
        k: h.k,
        lampDay: Math.exp(lerp(Math.log(prev.due), Math.log(cur.due), u)),
        lampR: lerp(endR(h.k - 1), endR(h.k), u),
        idx: h.k,
        pulse: h.z0,
      }
    }
    if (t < h.d1) {
      const u = E.inOut(progAt(t, h.z1, h.d1))
      return {
        W: winFor(h.k),
        P: lerp(cur.start, cur.due, u),
        k: h.k,
        lampDay: cur.due,
        lampR: endR(h.k),
        idx: h.k,
        pulse: h.z0,
      }
    }
  }
  const L = TEETH.length - 1
  return {
    W: winFor(L),
    P: tooth(L).due,
    k: L,
    lampDay: tooth(L).due,
    lampR: endR(L),
    idx: L,
    pulse: HOPS.at(-1)?.z0 ?? -1,
  }
}
