/**
 * 캡처 폴더로 만드는 HTML 한 장: 폴더 하나면 모아 보기, 둘이면 전후 비교.
 * 그림은 상대 경로로 걸어 파일로 바로 열린다. 바탕은 중립 회색 — 그림이 주인공이다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { Manifest, ManifestState, Metrics } from './run'
import type { Metric, Target } from './session'

const esc = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )

/** 한 상태 안의 그림 차례: 다크 폰·라이트 폰·다크 360·라이트 360·다크 PC·라이트 PC */
const KEY_ORDER = [
  'dark-phone',
  'light-phone',
  'dark-small',
  'light-small',
  'dark-pc',
  'light-pc',
]

const KEY_LABEL: Record<string, string> = {
  'dark-phone': '다크 · 폰 390',
  'light-phone': '라이트 · 폰 390',
  'dark-small': '다크 · 360×640',
  'light-small': '라이트 · 360×640',
  'dark-pc': '다크 · PC 1280',
  'light-pc': '라이트 · PC 1280',
}

interface Folder {
  /** 폴더 절대 경로 */
  dir: string
  /** 페이지에서 본 상대 경로 */
  href: string
  manifest: Manifest
  metrics: Metrics
}

function load(dir: string, from: string): Folder {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest
  const file = join(dir, 'metrics.json')
  const metrics = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Metrics) : {}
  return { dir, href: relative(from, dir) || '.', manifest, metrics }
}

/** 상태의 그림 열쇠(전체 화면 그림 제외)를 정해진 차례로 */
function keysOf(states: (ManifestState | undefined)[]): string[] {
  const keys = new Set<string>()
  for (const s of states) {
    for (const f of s?.shots ?? []) if (!f.endsWith('-full.png')) keys.add(f.slice(0, -4))
  }
  return KEY_ORDER.filter((k) => keys.has(k))
}

function metricBadges(m: Metric | undefined): string {
  if (!m) return ''
  const out: string[] = []
  if (m.small.length > 0) {
    const names = m.small.map((t) => `${t.label || t.tag} ${String(t.w)}×${String(t.h)}`)
    out.push(
      `<span class="bad" title="${esc(names.join('\n'))}">44px 미만 ${String(m.small.length)}</span>`,
    )
  }
  if (m.overflowX) {
    const by = `${String(rightOf(m) - m.innerWidth)}px${m.overflowAt ? ` (${m.overflowAt})` : ''}`
    out.push(`<span class="bad">가로 넘침 ${esc(by)}</span>`)
  }
  if (m.focus) {
    out.push(
      m.focus.visible
        ? `<span>포커스 링 ${esc(m.focus.outline)}</span>`
        : `<span class="bad">포커스 링 안 보임 (${esc(m.focus.outline)})</span>`,
    )
  }
  return out.join(' ')
}

/** 그림 한 장. full이면 전체 화면 그림을 높이 제한 상자에 넣는다. 파일이 없으면 그렇다고 적는다 */
function figure(
  f: Folder,
  state: ManifestState,
  key: string,
  opts: { full?: boolean } = {},
): string {
  const file = `${key}${opts.full ? '-full' : ''}.png`
  const src = `${f.href}/${state.id}/${file}`
  const label = `${KEY_LABEL[key] ?? key}${opts.full ? ' · 전체 화면' : ''}`
  const cls = `${key.endsWith('-pc') ? 'pc' : 'phone'}${opts.full ? ' full' : ''}`
  if (!existsSync(join(f.dir, state.id, file))) {
    return `<figure class="${cls}"><div class="missing bad">그림 없음 (${esc(file)})</div><figcaption>${label}</figcaption></figure>`
  }
  const fullLink =
    !opts.full && state.shots.includes(`${key}-full.png`)
      ? ` · <a href="${esc(`${f.href}/${state.id}/${key}-full.png`)}" target="_blank">전체 화면</a>`
      : ''
  return `<figure class="${cls}"><a href="${esc(src)}" target="_blank"><img loading="lazy" src="${esc(src)}" alt=""></a><figcaption>${label}${fullLink} ${metricBadges(f.metrics[state.id]?.[key])}</figcaption></figure>`
}

/** 실패·페이지 오류 줄 */
function failures(s: ManifestState | undefined, side: string): string {
  const lines = [...(s?.errors ?? []), ...(s?.pageErrors ?? [])]
  return lines.map((e) => `<div class="bad">${esc(side)}실패: ${esc(e)}</div>`).join('')
}

const STYLE = `
:root { color-scheme: light; --bg: #ececec; --card: #f8f8f8; --line: #cfcfcf; --text: #1d1d1d; --muted: #666; --bad: #b3261e; --new: #0b57d0; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
header.top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 10px 16px; }
header.top h1 { margin: 0; font-size: 17px; }
header.top nav { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
main { padding: 0 16px 64px; max-width: 1800px; }
h2 { margin: 32px 0 4px; font-size: 20px; }
.note { margin: 4px 0 12px; white-space: pre-wrap; }
.lead { display: grid; gap: 8px; margin: 16px 0; }
.lead div { background: var(--card); border: 1px solid var(--line); padding: 10px 12px; white-space: pre-wrap; }
.lead b { display: block; }
.muted { color: var(--muted); }
section.state, details.state { background: var(--card); border: 1px solid var(--line); margin: 12px 0; padding: 10px 12px; }
details.state { margin: 4px 0; padding: 4px 12px; }
section.state h3 { margin: 0; font-size: 15px; }
section.state h3 code { font-weight: 600; }
.shots { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-top: 8px; }
figure { margin: 0; }
figure.phone img { width: 260px; }
figure.pc img { width: 520px; }
figure.full > a { display: block; max-height: 900px; overflow-y: auto; }
figure img { display: block; border: 1px solid var(--line); background: #fff; max-width: 100%; }
figcaption { font-size: 12px; color: var(--muted); margin-top: 2px; max-width: 520px; }
.missing { width: 260px; padding: 40px 8px; border: 1px dashed var(--bad); text-align: center; }
.pair { display: grid; grid-template-columns: auto auto; gap: 12px; justify-content: start; margin-top: 10px; }
.pair > div > b { font-size: 12px; }
.bad { color: var(--bad); font-weight: 600; }
.new { color: var(--new); font-weight: 600; }
details > summary { cursor: pointer; color: var(--muted); }
ul.reg { margin: 4px 0; padding-left: 20px; }
@media (max-width: 700px) { figure.pc img { width: 100%; } figure.phone img { width: 160px; } .pair { grid-template-columns: 1fr 1fr; } }
`

function page(title: string, nav: string, body: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><header class="top"><h1>${esc(title)}</h1><nav>${nav}</nav></header><main>${body}</main></body></html>
`
}

function screensOf(states: ManifestState[], names: Record<string, string>): [string, string][] {
  const seen = new Set(states.map((s) => s.screen))
  return Object.entries(names).filter(([k]) => seen.has(k))
}

const short = (sha: string | null): string => (sha ? sha.slice(0, 7) : '커밋 모름')

/** 폴더 하나 → 전 화면을 한 장에 놓은 모아 보기(<dir>/index.html) */
export function writeGallery(dir: string): string {
  const f = load(dir, dir)
  const { manifest } = f
  const screens = screensOf(manifest.states, manifest.screens)
  const nav = screens.map(([k, name]) => `<a href="#${k}">${esc(name)}</a>`).join('')
  const shots = manifest.states.reduce((n, s) => n + s.shots.length, 0)
  const when = new Date(manifest.fixedNow).toLocaleString('ko-KR', {
    timeZone: manifest.timezone,
  })
  let body = `<p class="muted">커밋 ${esc(short(manifest.commit))}${manifest.dirty ? ' (커밋 안 된 변경 포함)' : ''} · 고정 시각 ${esc(when)} (${esc(manifest.timezone)}) · 상태 ${String(manifest.states.length)}개 · 그림 ${String(shots)}장</p>`
  for (const [screen, name] of screens) {
    body += `<h2 id="${screen}">${esc(name)}</h2>`
    for (const s of manifest.states.filter((x) => x.screen === screen)) {
      const figs = keysOf([s])
        .map((k) => figure(f, s, k))
        .join('')
      body += `<section class="state" id="${esc(s.id)}"><h3><code>${esc(s.id)}</code> ${esc(s.title)}</h3><div class="muted">${esc(s.how)}</div>${failures(s, '')}<div class="shots">${figs}</div></section>`
    }
  }
  body += `<h2 id="uncaptured">찍지 못하는 상태</h2><ul>${manifest.uncaptured.map((u) => `<li><b>${esc(u.what)}</b> — ${esc(u.why)}</li>`).join('')}</ul>`
  const out = join(dir, 'index.html')
  writeFileSync(
    out,
    page(
      `Ivan 캡처 · ${short(manifest.commit)}`,
      `${nav}<a href="#uncaptured">찍지 못하는 상태</a>`,
      body,
    ),
  )
  return out
}

/** 가장 멀리 나간 오른쪽 끝 — 예전 측정값(overflowRight 없음)은 scrollWidth로 */
const rightOf = (m: Metric): number => Math.max(m.overflowRight ?? 0, m.scrollWidth)

const size = (t: Target): string => `${String(t.w)}×${String(t.h)}`

/**
 * 두 metrics.json에서 나빠진 항목만. 전에 그 상태나 그 폭이 없으면 빈 기준과 견준다
 * (새 상태·새 폭의 문제도 빠뜨리지 않는다).
 * - 44px 미만 타깃: tag|이름으로 묶어 개수가 늘면 늘어난 것, 짝지은 타깃(작은 것부터)이 더 작아지면 그것
 * - 가로 넘침: 새로 생겼거나, 이미 넘치던 폭이 더 커짐
 * - 포커스 링: 그려진 링이 사라짐(전 없음이면 안 보이는 것 자체)
 * - 대화형 요소 수가 줄어듦(의도인지 확인할 것)
 */
export function regressions(before: Metrics, after: Metrics): string[] {
  const out: string[] = []
  for (const [id, shots] of Object.entries(after)) {
    for (const [key, m] of Object.entries(shots)) {
      const b = before[id]?.[key]
      const at = `${id} ${key}${b ? '' : ' (전 없음)'}`
      const group = (list: readonly Target[]) => {
        const map = new Map<string, Target[]>()
        for (const t of list) {
          const k = `${t.tag}|${t.label}`
          map.set(k, [...(map.get(k) ?? []), t])
        }
        for (const v of map.values()) v.sort((x, y) => x.w * x.h - y.w * y.h)
        return map
      }
      const old = group(b?.small ?? [])
      for (const [k, now] of group(m.small)) {
        const was = old.get(k) ?? []
        now.forEach((t, i) => {
          const prev = was[i]
          const name = `${t.tag} "${t.label}"`
          if (!prev) out.push(`${at}: 44px 미만 새로 생김 — ${name} ${size(t)}`)
          else if (t.w < prev.w - 0.5 || t.h < prev.h - 0.5) {
            out.push(`${at}: 44px 미만 타깃이 더 작아짐 — ${name} ${size(prev)} → ${size(t)}`)
          }
        })
      }
      const over = rightOf(m) - m.innerWidth
      const overBefore = b?.overflowX ? rightOf(b) - b.innerWidth : 0
      if (m.overflowX && !b?.overflowX) {
        out.push(
          `${at}: 가로 넘침 새로 생김 — ${String(over)}px${m.overflowAt ? ` (${m.overflowAt})` : ''}`,
        )
      } else if (m.overflowX && over > overBefore + 0.5) {
        out.push(`${at}: 가로 넘침이 커짐 — ${String(overBefore)}px → ${String(over)}px`)
      }
      if (m.focus && !m.focus.visible && (!b || b.focus?.visible === true)) {
        out.push(`${at}: 포커스 링이 안 보임 — ${m.focus.outline}`)
      } else if (!m.focus && b?.focus) {
        out.push(`${at}: 포커스를 잡지 못함(포커스 대표 캡처에 포커스한 요소가 없다)`)
      }
      if (b && m.checked < b.checked) {
        out.push(
          `${at}: 대화형 요소가 줄어듦 ${String(b.checked)} → ${String(m.checked)} (의도인지 확인)`,
        )
      }
    }
  }
  return out
}

/** 메모 파일: '# 무엇이 바뀌었나' '# 볼 것' '# 잘 된 모습' 세 칸과 '## <화면 또는 상태 id>' 칸 */
export function readNotes(file: string | null): Map<string, string> {
  const notes = new Map<string, string>()
  if (file === null) return notes
  let key: string | null = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const h = /^#{1,2}\s+(.+?)\s*$/.exec(line)
    if (h?.[1] !== undefined) {
      key = h[1]
      notes.set(key, '')
    } else if (key !== null) {
      notes.set(key, `${notes.get(key) ?? ''}${line}\n`)
    }
  }
  for (const [k, v] of notes) notes.set(k, v.trim())
  return notes
}

const bytes = (file: string): Buffer | null => (existsSync(file) ? readFileSync(file) : null)

/** 두 파일이 같은가 — 둘 다 없으면 같다 */
function same(a: string, b: string): boolean {
  const x = bytes(a)
  const y = bytes(b)
  return x === null || y === null ? x === y : x.equals(y)
}

export interface CompareSummary {
  out: string
  /** 상태·테마·폭 하나를 한 쌍으로 센다(뷰포트 그림과 전체 그림을 함께) */
  changed: number
  unchanged: number
  /** 한쪽 그림 파일이 없는 쌍 */
  missing: number
  oneSided: number
  failed: number
  regressions: string[]
}

/** 폴더 둘 → 전후 비교 페이지 */
export function writeCompare(
  beforeDir: string,
  afterDir: string,
  notes: Map<string, string>,
  out: string,
): CompareSummary {
  const before = load(beforeDir, dirname(out))
  const after = load(afterDir, dirname(out))
  const bState = new Map(before.manifest.states.map((s) => [s.id, s]))
  const aState = new Map(after.manifest.states.map((s) => [s.id, s]))
  const all = [...after.manifest.states, ...before.manifest.states]
  const ids = [...new Set(all.map((s) => s.id))]
  const screens = screensOf(all, { ...before.manifest.screens, ...after.manifest.screens })
  const regs = regressions(before.metrics, after.metrics)
  const sum = { changed: 0, unchanged: 0, missing: 0, oneSided: 0, failed: 0 }

  let sections = ''
  for (const [screen, name] of screens) {
    let html = ''
    const beforeOnly: ManifestState[] = []
    for (const id of ids) {
      const b = bState.get(id)
      const a = aState.get(id)
      const s = a ?? b
      if (s?.screen !== screen) continue
      const head = `<h3><code>${esc(id)}</code> ${esc(s.title)}</h3>`
      const note = notes.get(id)
      const noteHtml = note ? `<p class="note">${esc(note)}</p>` : ''
      const fail = failures(b, '전 ') + failures(a, '뒤 ')
      if (fail !== '') sum.failed++
      if (!a && b) {
        // 이번에 찍지 않은 상태(--only) — 접은 목록으로 모은다
        sum.oneSided++
        beforeOnly.push(b)
        continue
      }
      if (a && !b) {
        sum.oneSided++
        const figs = keysOf([a])
          .map((k) => figure(after, a, k))
          .join('')
        html += `<section class="state" id="${esc(id)}">${head}<div class="new">뒤에만 있음(새 상태)</div>${fail}${noteHtml}<div class="shots">${figs}</div></section>`
        continue
      }
      if (!a || !b) continue
      let rows = ''
      const quiet: string[] = []
      for (const k of keysOf([b, a])) {
        const file = (f: Folder, full: boolean) =>
          join(f.dir, id, `${k}${full ? '-full' : ''}.png`)
        const hasB = existsSync(file(before, false))
        const hasA = existsSync(file(after, false))
        if (!hasA || !hasB) {
          sum.missing++
          rows += `<div class="pair"><div><b>전</b>${figure(before, b, k)}</div><div><b>뒤</b>${figure(after, a, k)}</div></div>`
          continue
        }
        const top = same(file(before, false), file(after, false))
        const full = same(file(before, true), file(after, true))
        if (top && full) {
          sum.unchanged++
          quiet.push(KEY_LABEL[k] ?? k)
          continue
        }
        sum.changed++
        // 첫 화면이 같고 아래쪽만 바뀌었으면 전체 그림을 나란히 놓는다
        const asFull = top && !full
        const tag = asFull
          ? '<div class="new">첫 화면은 같고 아래쪽이 바뀜 — 전체 그림</div>'
          : ''
        rows += `${tag}<div class="pair"><div><b>전</b>${figure(before, b, k, { full: asFull })}</div><div><b>뒤</b>${figure(after, a, k, { full: asFull })}</div></div>`
      }
      if (rows === '' && fail === '') {
        const figs = keysOf([a])
          .map((k) => figure(after, a, k))
          .join('')
        html += `<details class="state" id="${esc(id)}"><summary><code>${esc(id)}</code> 변화 없음 — ${esc(s.title)}</summary><div class="shots">${figs}</div></details>`
      } else {
        const q =
          quiet.length > 0 ? `<div class="muted">변화 없음: ${esc(quiet.join(', '))}</div>` : ''
        html += `<section class="state" id="${esc(id)}">${head}${fail}${noteHtml}${rows}${q}</section>`
      }
    }
    if (beforeOnly.length > 0) {
      const list = beforeOnly
        .map((s) => {
          const k = keysOf([s])[0]
          const link = k
            ? ` · <a href="${esc(`${before.href}/${s.id}/${k}.png`)}" target="_blank">전 그림</a>`
            : ''
          return `<li><code>${esc(s.id)}</code> ${esc(s.title)}${link}</li>`
        })
        .join('')
      html += `<details class="state"><summary>이번에 찍지 않은 상태 ${String(beforeOnly.length)}개 (전에만 있음)</summary><ul>${list}</ul></details>`
    }
    const screenNote = notes.get(screen)
    sections += `<h2 id="${screen}">${esc(name)}</h2>${screenNote ? `<p class="note">${esc(screenNote)}</p>` : `<p class="note muted">이 화면의 메모 없음 (메모 파일의 ## ${screen})</p>`}${html}`
  }

  const lead = ['무엇이 바뀌었나', '볼 것', '잘 된 모습']
    .map(
      (k) =>
        `<div><b>${k}</b>${esc(notes.get(k) ?? '') || '<span class="muted">메모 없음 (--notes)</span>'}</div>`,
    )
    .join('')
  const regHtml =
    regs.length === 0
      ? '<p>접근성 측정값에서 나빠진 항목 없음</p>'
      : `<ul class="reg">${regs.map((r) => `<li class="bad">${esc(r)}</li>`).join('')}</ul>`
  const side = (f: Folder) =>
    `${esc(short(f.manifest.commit))}${f.manifest.dirty ? ' + 커밋 안 된 변경' : ''} (${esc(f.href)})`
  const counts = [
    `바뀐 쌍 ${String(sum.changed)}`,
    `같은 쌍 ${String(sum.unchanged)}`,
    ...(sum.missing > 0
      ? [`<span class="bad">그림 없는 쌍 ${String(sum.missing)}</span>`]
      : []),
    `한쪽에만 있는 상태 ${String(sum.oneSided)}`,
    ...(sum.failed > 0 ? [`<span class="bad">실패한 상태 ${String(sum.failed)}</span>`] : []),
  ].join(' · ')
  const body = `<p class="muted">전 ${side(before)} → 뒤 ${side(after)} · ${counts} <span class="muted">(쌍 = 상태 하나의 테마·폭 하나, 전체 그림 포함)</span></p>
<div class="lead">${lead}</div><h2 id="a11y">접근성 측정값</h2>${regHtml}${sections}`
  const nav = screens.map(([k, n]) => `<a href="#${k}">${esc(n)}</a>`).join('')
  writeFileSync(
    out,
    page(
      `Ivan 전후 비교 · ${short(before.manifest.commit)} → ${short(after.manifest.commit)}`,
      `<a href="#a11y">접근성</a>${nav}`,
      body,
    ),
  )
  return { out, ...sum, regressions: regs }
}
