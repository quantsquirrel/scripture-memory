/**
 * 캡처 폴더로 만드는 HTML 한 장: 폴더 하나면 모아 보기, 둘이면 전후 비교.
 * 그림은 상대 경로로 걸어 파일로 바로 열린다. 바탕은 중립 회색 — 그림이 주인공이다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { Manifest, ManifestState, Metrics } from './run'
import type { Metric } from './session'

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

function load(dir: string): { manifest: Manifest; metrics: Metrics } {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest
  const file = join(dir, 'metrics.json')
  const metrics = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Metrics) : {}
  return { manifest, metrics }
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
  if (m.overflowX) out.push('<span class="bad">가로 넘침</span>')
  if (m.focus) {
    out.push(
      m.focus.visible
        ? `<span>포커스 링 ${esc(m.focus.outline)}</span>`
        : '<span class="bad">포커스 링 안 보임</span>',
    )
  }
  return out.join(' ')
}

/** 그림 한 장(+전체 화면 그림 링크) */
function figure(
  base: string,
  state: ManifestState,
  key: string,
  m: Metric | undefined,
): string {
  const src = `${base}/${state.id}/${key}.png`
  const full = state.shots.includes(`${key}-full.png`)
    ? ` · <a href="${esc(`${base}/${state.id}/${key}-full.png`)}" target="_blank">전체 화면</a>`
    : ''
  const cls = key.endsWith('-pc') ? 'pc' : 'phone'
  return `<figure class="${cls}"><a href="${esc(src)}" target="_blank"><img loading="lazy" src="${esc(src)}" alt=""></a><figcaption>${KEY_LABEL[key] ?? key}${full} ${metricBadges(m)}</figcaption></figure>`
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
.lead div { background: var(--card); border: 1px solid var(--line); padding: 10px 12px; }
.lead b { display: block; }
.muted { color: var(--muted); }
section.state { background: var(--card); border: 1px solid var(--line); margin: 12px 0; padding: 10px 12px; }
section.state h3 { margin: 0; font-size: 15px; }
section.state h3 code { font-weight: 600; }
.shots { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-top: 8px; }
figure { margin: 0; }
figure.phone img { width: 260px; }
figure.pc img { width: 520px; }
figure img { display: block; border: 1px solid var(--line); background: #fff; max-width: 100%; }
figcaption { font-size: 12px; color: var(--muted); margin-top: 2px; max-width: 520px; }
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
  const { manifest, metrics } = load(dir)
  const screens = screensOf(manifest.states, manifest.screens)
  const nav = screens.map(([k, name]) => `<a href="#${k}">${esc(name)}</a>`).join('')
  const shots = manifest.states.reduce((n, s) => n + s.shots.length, 0)
  let body = `<p class="muted">커밋 ${esc(short(manifest.commit))}${manifest.dirty ? ' (커밋 안 된 변경 포함)' : ''} · 고정 시각 ${esc(new Date(manifest.fixedNow).toLocaleString('ko-KR', { timeZone: manifest.timezone }))} (${esc(manifest.timezone)}) · 상태 ${String(manifest.states.length)}개 · 그림 ${String(shots)}장</p>`
  for (const [screen, name] of screens) {
    body += `<h2 id="${screen}">${esc(name)}</h2>`
    for (const s of manifest.states.filter((x) => x.screen === screen)) {
      const errs = (s.errors ?? []).map((e) => `<div class="bad">${esc(e)}</div>`).join('')
      const figs = keysOf([s])
        .map((k) => figure('.', s, k, metrics[s.id]?.[k]))
        .join('')
      body += `<section class="state" id="${esc(s.id)}"><h3><code>${esc(s.id)}</code> ${esc(s.title)}</h3><div class="muted">${esc(s.how)}</div>${errs}<div class="shots">${figs}</div></section>`
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

/** 두 metrics.json에서 나빠진 항목만: 새로 생긴 44px 미만 타깃, 새 가로 넘침, 사라진 포커스 링 */
export function regressions(before: Metrics, after: Metrics): string[] {
  const out: string[] = []
  for (const [id, shots] of Object.entries(after)) {
    for (const [key, m] of Object.entries(shots)) {
      const b = before[id]?.[key]
      if (!b) continue
      const old = new Set(b.small.map((t) => `${t.tag}|${t.label}`))
      for (const t of m.small) {
        if (!old.has(`${t.tag}|${t.label}`)) {
          out.push(
            `${id} ${key}: 44px 미만 새로 생김 — ${t.tag} "${t.label}" ${String(t.w)}×${String(t.h)}`,
          )
        }
      }
      if (m.overflowX && !b.overflowX) {
        out.push(
          `${id} ${key}: 가로 넘침 새로 생김 (${String(m.scrollWidth)} > ${String(m.innerWidth)})`,
        )
      }
      if (b.focus?.visible === true && m.focus?.visible !== true) {
        out.push(`${id} ${key}: 포커스 링이 사라짐`)
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

const same = (a: string, b: string): boolean =>
  existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b))

export interface CompareSummary {
  out: string
  changed: number
  unchanged: number
  oneSided: number
  regressions: string[]
}

/** 폴더 둘 → 전후 비교 페이지 */
export function writeCompare(
  beforeDir: string,
  afterDir: string,
  notes: Map<string, string>,
  out: string,
): CompareSummary {
  const before = load(beforeDir)
  const after = load(afterDir)
  const rb = relative(dirname(out), beforeDir) || '.'
  const ra = relative(dirname(out), afterDir) || '.'
  const bState = new Map(before.manifest.states.map((s) => [s.id, s]))
  const aState = new Map(after.manifest.states.map((s) => [s.id, s]))
  const ids = [
    ...new Set([...after.manifest.states, ...before.manifest.states].map((s) => s.id)),
  ]
  const all = [...after.manifest.states, ...before.manifest.states]
  const screens = screensOf(all, { ...before.manifest.screens, ...after.manifest.screens })
  const regs = regressions(before.metrics, after.metrics)
  let changed = 0
  let unchanged = 0
  let oneSided = 0

  let sections = ''
  for (const [screen, name] of screens) {
    let html = ''
    for (const id of ids) {
      const b = bState.get(id)
      const a = aState.get(id)
      const s = a ?? b
      if (s?.screen !== screen) continue
      const head = `<h3><code>${esc(id)}</code> ${esc(s.title)}</h3>`
      const note = notes.get(id)
      const noteHtml = note ? `<p class="note">${esc(note)}</p>` : ''
      if (!a || !b) {
        oneSided++
        const where = a ? '뒤에만 있음' : '전에만 있음'
        const figs = keysOf([s])
          .map((k) => figure(a ? ra : rb, s, k, (a ? after : before).metrics[id]?.[k]))
          .join('')
        html += `<section class="state" id="${esc(id)}">${head}<div class="new">${where}</div>${noteHtml}<div class="shots">${figs}</div></section>`
        continue
      }
      let rows = ''
      const quiet: string[] = []
      for (const k of keysOf([b, a])) {
        const pb = join(beforeDir, id, `${k}.png`)
        const pa = join(afterDir, id, `${k}.png`)
        const fb = join(beforeDir, id, `${k}-full.png`)
        const fa = join(afterDir, id, `${k}-full.png`)
        const fullSame = existsSync(fb) === existsSync(fa) && (!existsSync(fb) || same(fb, fa))
        if (same(pb, pa) && fullSame) {
          unchanged++
          quiet.push(KEY_LABEL[k] ?? k)
          continue
        }
        changed++
        rows += `<div class="pair"><div><b>전</b>${figure(rb, b, k, before.metrics[id]?.[k])}</div><div><b>뒤</b>${figure(ra, a, k, after.metrics[id]?.[k])}</div></div>`
      }
      if (rows === '') {
        html += `<details class="state"><summary><code>${esc(id)}</code> 변화 없음 — ${esc(s.title)}</summary></details>`
      } else {
        const q =
          quiet.length > 0 ? `<div class="muted">변화 없음: ${esc(quiet.join(', '))}</div>` : ''
        html += `<section class="state" id="${esc(id)}">${head}${noteHtml}${rows}${q}</section>`
      }
    }
    const screenNote = notes.get(screen)
    sections += `<h2 id="${screen}">${esc(name)}</h2>${screenNote ? `<p class="note">${esc(screenNote)}</p>` : '<p class="note muted">이 화면의 메모 없음 (메모 파일의 ## ' + screen + ')</p>'}${html}`
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
  const body = `<p class="muted">전 ${esc(short(before.manifest.commit))}${before.manifest.dirty ? ' + 커밋 안 된 변경' : ''} (${esc(rb)}) → 뒤 ${esc(short(after.manifest.commit))}${after.manifest.dirty ? ' + 커밋 안 된 변경' : ''} (${esc(ra)}) · 바뀐 그림 ${String(changed)} · 같은 그림 ${String(unchanged)} · 한쪽에만 있는 상태 ${String(oneSided)}</p>
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
  return { out, changed, unchanged, oneSided, regressions: regs }
}
