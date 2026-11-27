/**
 * 전 화면·전 상태 캡처. 사용법은 README.md.
 *
 *   npx vite-node scripts/capture/run.ts --out <폴더> [--only home,review-recite] [--jobs 4]
 *                                        [--root <worktree>] [--url <주소> [--relay-url <주소>]]
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { type Browser, chromium, type Page } from '@playwright/test'

import { RELAY_URL, SCREENS, type StateDef } from './define'
import { writeGallery } from './report'
import { NOW } from './seed'
import {
  type Fixtures,
  fixtures,
  measure,
  type Metric,
  park,
  position,
  Session,
  settle,
} from './session'
import { STATES, UNCAPTURED } from './states'

export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  small: { width: 360, height: 640 },
  pc: { width: 1280, height: 800 },
} as const
type ViewportName = keyof typeof VIEWPORTS

const TIMEZONE = 'Asia/Seoul'
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

export interface ManifestState {
  id: string
  screen: string
  title: string
  how: string
  viewports: string[]
  shots: string[]
  commit: string | null
  errors?: string[]
  pageErrors?: string[]
}

export interface Manifest {
  tool: string
  commit: string | null
  dirty: boolean
  target: string
  fixedNow: string
  timezone: string
  themes: readonly string[]
  viewports: typeof VIEWPORTS
  screens: Record<string, string>
  states: ManifestState[]
  uncaptured: readonly { what: string; why: string }[]
}

export type Metrics = Record<string, Record<string, Metric>>

interface Args {
  out: string
  only: string[]
  jobs: number
  root: string
  url: string | null
  relayUrl: string | null
  commit: string | null
  list: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, env: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : process.env[env]
  }
  const list = argv.includes('--list')
  const out = get('out', 'CAPTURE_OUT')
  if (!list && (out === undefined || out === '')) {
    console.error('출력 폴더가 필요하다: --out <폴더> (또는 CAPTURE_OUT)')
    process.exit(2)
  }
  return {
    out: resolve(out ?? '.'),
    only: (get('only', 'CAPTURE_ONLY') ?? '').split(',').filter((p) => p !== ''),
    jobs: Number(get('jobs', 'CAPTURE_JOBS') ?? 4),
    root: resolve(get('root', 'CAPTURE_ROOT') ?? '.'),
    url: get('url', 'CAPTURE_URL') ?? null,
    relayUrl: get('relay-url', 'CAPTURE_RELAY_URL') ?? null,
    commit: get('commit', 'CAPTURE_COMMIT') ?? null,
    list,
  }
}

/** 상태 하나가 찍히는 폭: 폰 클래스(390, 무대면 360도)와 PC */
function viewportsOf(state: StateDef): ViewportName[] {
  if (state.pcOnly) return ['pc']
  return state.stage ? ['phone', 'small', 'pc'] : ['phone', 'pc']
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function freePort(): Promise<number> {
  return new Promise((ok, no) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      srv.close(() => {
        if (addr && typeof addr === 'object') ok(addr.port)
        else no(new Error('빈 포트를 찾지 못했다'))
      })
    })
  })
}

function exec(root: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((ok, no) => {
    const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
    const child = spawn(process.execPath, [vite, ...args], { cwd: root, env, stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code === 0) ok()
      else no(new Error(`vite ${args.join(' ')} 실패 (${String(code)})`))
    })
  })
}

async function waitUp(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // 아직 뜨는 중
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${url}이 뜨지 않는다`)
}

/**
 * worktree를 빌드해 빈 포트의 vite preview로 띄운다 — 기본 빌드와 연동 서버 주소를 넣은 빌드.
 * 둘 다 임시 폴더에 빌드하고 끝나면 지운다(대상 worktree의 dist/를 건드리지 않는다).
 */
async function serve(root: string): Promise<{ base: string; relay: string; stop: () => void }> {
  const appDir = mkdtempSync(join(tmpdir(), 'ivan-capture-app-'))
  const relayDir = mkdtempSync(join(tmpdir(), 'ivan-capture-relay-'))
  const children: ChildProcess[] = []
  const stop = () => {
    for (const c of children) c.kill()
    rmSync(appDir, { recursive: true, force: true })
    rmSync(relayDir, { recursive: true, force: true })
  }
  const env = { ...process.env }
  delete env['VITE_PAIRING_RELAY_URL']
  const build = (outDir: string, extra: NodeJS.ProcessEnv) =>
    exec(root, ['build', '--logLevel', 'warn', '--outDir', outDir, '--emptyOutDir'], {
      ...env,
      ...extra,
    })
  const up = async (outDir: string): Promise<string> => {
    const port = await freePort()
    const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
    const args = ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']
    const child = spawn(process.execPath, [vite, ...args, '--outDir', outDir], {
      cwd: root,
      env,
    })
    children.push(child)
    const base = `http://127.0.0.1:${String(port)}/scripture-memory/`
    await waitUp(base)
    return base
  }
  try {
    await build(appDir, {})
    await build(relayDir, { VITE_PAIRING_RELAY_URL: RELAY_URL })
    return { base: await up(appDir), relay: await up(relayDir), stop }
  } catch (e) {
    stop()
    throw e
  }
}

interface Job {
  state: StateDef
  theme: Theme
  phone: boolean
}

interface Collected {
  shots: string[]
  metrics: Record<string, Metric>
  errors: string[]
  pageErrors: string[]
}

// 래스터를 결정적으로: 이것 없이는 DPR 1(PC) 그림의 테두리·모서리 안티에일리어싱이 실행마다
// 몇~수십 픽셀씩 달랐다(부분 래스터·GPU 래스터가 그리는 차례에 따라 갈렸다)
const RASTER_ARGS = [
  '--disable-partial-raster',
  '--disable-gpu-rasterization',
  '--disable-lcd-text',
  '--force-color-profile=srgb',
]

const SHOT = { animations: 'disabled', caret: 'hide' } as const

const scrollHeight = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollHeight)

/**
 * 한 화면에 다 안 들어가면 전체 그림도 찍는다. Playwright의 fullPage는 쓰지 않는다 — 폰 흉내
 * (터치·hover: none)를 풀어 버려 그 그림과 뒤의 그림이 데스크톱 스타일로 찍혔다. 대신 뷰포트를
 * 페이지 높이로 늘린다(높이에 기대는 레이아웃이 따라 늘면 한 번 더) 찍고 되돌린다.
 */
async function fullShot(
  page: Page,
  size: { width: number; height: number },
  dir: string,
  key: string,
): Promise<boolean> {
  let height = await scrollHeight(page)
  if (height <= size.height + 1) return false
  for (let i = 0; i < 5; i++) {
    await page.setViewportSize({ width: size.width, height })
    const next = await scrollHeight(page)
    if (next <= height) break
    height = next
  }
  await position(page, 'top')
  await settle(page)
  await page.screenshot({ ...SHOT, path: join(dir, `${key}-full.png`) })
  await page.setViewportSize(size)
  return true
}

async function capture(
  browser: Browser,
  job: Job,
  base: string,
  dir: string,
  into: Collected,
): Promise<void> {
  const { state, theme, phone } = job
  const context = await browser.newContext({
    viewport: phone ? VIEWPORTS.phone : VIEWPORTS.pc,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    serviceWorkers: 'block',
    timezoneId: TIMEZONE,
    locale: 'ko-KR',
    colorScheme: theme,
    reducedMotion: 'no-preference',
    ...(state.ios ? { userAgent: IOS_UA } : {}),
  })
  try {
    await context.clock.setFixedTime(NOW)
    // 앱 오리진 밖으로는 아무것도 나가지 않는다(연동·Gist는 상태 정의가 page.route로 받는다)
    const origin = new URL(base).origin
    await context.route(
      (url) => url.origin !== origin,
      (route) => route.abort(),
    )
    const fx: Fixtures = {
      theme: state.autoTheme ? 'auto' : theme,
      stall: state.stall === true,
    }
    await context.addInitScript(fixtures, fx)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', (e) => into.pageErrors.push(`${theme}: ${e.message}`))
    if (state.contrast) await page.emulateMedia({ contrast: 'more' })
    await state.run(new Session(page, base))
    // 누른 자리에 남은 마우스는 자동 조작의 흔적이다 — 일부러 올린 상태가 아니면 치우고 찍는다
    if (!state.hover) await park(page)
    for (const vp of viewportsOf(state).filter((v) => (v === 'pc') !== phone)) {
      const size = VIEWPORTS[vp]
      await page.setViewportSize(size)
      const view = state.view ?? 'top'
      // 글꼴이 다 실려 레이아웃이 선 뒤에 스크롤할 자리를 잰다 — 먼저 재면 페이지 높이가 바뀌어
      // 스크롤 끝 위치가 실행마다 달랐다(learn-intro-duplicate PC)
      await settle(page)
      await position(page, view)
      await settle(page)
      const key = `${theme}-${vp}`
      await page.screenshot({ ...SHOT, path: join(dir, `${key}.png`) })
      into.shots.push(`${key}.png`)
      into.metrics[key] = await measure(page, state.screen === 'focus')
      // 마우스 올림('keep')은 뷰포트를 늘리면 마우스 아래 요소가 바뀌어 전체 그림을 찍지 않는다
      if (view !== 'keep' && (await fullShot(page, size, dir, key))) {
        into.shots.push(`${key}-full.png`)
      }
    }
  } catch (e) {
    into.errors.push(
      `${theme}-${phone ? 'phone' : 'pc'}: ${e instanceof Error ? e.message : String(e)}`,
    )
  } finally {
    await context.close()
  }
}

async function pool<T>(items: readonly T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i]
      if (item !== undefined) await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, n) }, worker))
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback
}

function printList(): void {
  console.log('| id | 화면 | 상태 | 도달 방법 | 폭 |')
  console.log('| --- | --- | --- | --- | --- |')
  for (const s of STATES) {
    const cells = [s.id, SCREENS[s.screen], s.title, s.how, viewportsOf(s).join('·')]
    console.log(`| ${cells.map((c) => c.replaceAll('|', '\\|')).join(' | ')} |`)
  }
  console.log('\n찍지 못하는 상태\n')
  for (const u of UNCAPTURED) console.log(`- ${u.what}: ${u.why}`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.list) {
    printList()
    return
  }
  const ids = new Set(STATES.map((s) => s.id))
  if (ids.size !== STATES.length) throw new Error('상태 id가 겹친다')
  const states = STATES.filter(
    (s) => args.only.length === 0 || args.only.some((p) => s.id.startsWith(p)),
  )
  if (states.length === 0) throw new Error(`--only ${args.only.join(',')}에 맞는 상태가 없다`)

  const started = Date.now()
  const local = args.url === null
  const commit = local ? git(args.root, ['rev-parse', 'HEAD']) : args.commit
  const dirty = local && git(args.root, ['status', '--porcelain']) !== ''
  const server = local
    ? await serve(args.root)
    : { base: args.url ?? '', relay: args.relayUrl, stop: () => undefined }
  const results = new Map<string, Collected>()
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ args: RASTER_ARGS })
    const launched = browser
    mkdirSync(args.out, { recursive: true })
    for (const s of states) {
      rmSync(join(args.out, s.id), { recursive: true, force: true })
      mkdirSync(join(args.out, s.id))
      results.set(s.id, { shots: [], metrics: {}, errors: [], pageErrors: [] })
    }
    const jobs: Job[] = states.flatMap((state) =>
      THEMES.flatMap((theme) =>
        [true, false]
          .filter((phone) => viewportsOf(state).some((v) => (v === 'pc') !== phone))
          .map((phone) => ({ state, theme, phone })),
      ),
    )
    const left = new Map(states.map((s) => [s.id, jobs.filter((j) => j.state === s).length]))
    let done = 0
    await pool(jobs, args.jobs, async (job) => {
      const into = results.get(job.state.id)
      if (!into) return
      const base = job.state.build === 'relay' ? server.relay : server.base
      if (base === null) {
        into.errors.push('연동 서버 주소를 넣은 빌드가 없다(--relay-url)')
      } else {
        await capture(launched, job, base, join(args.out, job.state.id), into)
      }
      const rest = (left.get(job.state.id) ?? 1) - 1
      left.set(job.state.id, rest)
      if (rest === 0) {
        done++
        const bad = into.errors.length + into.pageErrors.length > 0
        const mark = bad ? '실패' : '완료'
        console.log(`[${String(done)}/${String(states.length)}] ${mark} ${job.state.id}`)
        for (const e of [...into.errors, ...into.pageErrors]) console.log(`    ${e}`)
      }
    })
  } finally {
    await browser?.close()
    server.stop()
  }

  const manifestFile = join(args.out, 'manifest.json')
  const metricsFile = join(args.out, 'metrics.json')
  const before = readJson<Manifest | null>(manifestFile, null)
  const metrics = readJson<Metrics>(metricsFile, {})
  // 목록에서 빠진 상태 id(이름을 바꿨거나 지운 상태)는 예전 그림·측정값과 함께 걷어 낸다
  const known = new Set(STATES.map((s) => s.id))
  for (const s of before?.states ?? []) {
    if (known.has(s.id)) continue
    // metrics.json은 아래에서 매니페스트에 남은 상태만 다시 쓴다
    rmSync(join(args.out, s.id), { recursive: true, force: true })
  }
  const entries = new Map(
    (before?.states ?? []).filter((s) => known.has(s.id)).map((s) => [s.id, s]),
  )
  for (const s of states) {
    const r = results.get(s.id)
    if (!r) continue
    r.shots.sort()
    entries.set(s.id, {
      id: s.id,
      screen: s.screen,
      title: s.title,
      how: s.how,
      viewports: viewportsOf(s),
      shots: r.shots,
      commit,
      ...(r.errors.length > 0 ? { errors: r.errors.sort() } : {}),
      ...(r.pageErrors.length > 0 ? { pageErrors: [...new Set(r.pageErrors)].sort() } : {}),
    })
    metrics[s.id] = Object.fromEntries(
      Object.entries(r.metrics).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  const order = new Map(STATES.map((s, i) => [s.id, i]))
  const manifest: Manifest = {
    tool: 'scripts/capture',
    commit,
    dirty,
    target: local ? `build:${args.root}` : (args.url ?? ''),
    fixedNow: NOW.toISOString(),
    timezone: TIMEZONE,
    themes: THEMES,
    viewports: VIEWPORTS,
    screens: SCREENS,
    states: [...entries.values()].sort(
      (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
    ),
    uncaptured: UNCAPTURED,
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`)
  const sortedMetrics = Object.fromEntries(
    manifest.states.flatMap((s) => (metrics[s.id] ? [[s.id, metrics[s.id]]] : [])),
  )
  writeFileSync(metricsFile, `${JSON.stringify(sortedMetrics, null, 1)}\n`)
  writeGallery(args.out)

  const shots = [...results.values()].reduce((n, r) => n + r.shots.length, 0)
  const failed = [...results.entries()].filter(
    ([, r]) => r.errors.length + r.pageErrors.length > 0,
  )
  const secs = Math.round((Date.now() - started) / 1000)
  console.log(`\n상태 ${String(states.length)}개, 그림 ${String(shots)}장, ${String(secs)}초`)
  console.log(`모아 보기: ${join(args.out, 'index.html')}`)
  if (failed.length > 0) {
    console.log(`실패 ${String(failed.length)}개: ${failed.map(([id]) => id).join(', ')}`)
    process.exitCode = 1
  }
}

await main()
