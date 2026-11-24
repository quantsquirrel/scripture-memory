/**
 * 브라우저 쪽 장치: 고정 장치(초기 스크립트), 시드 쓰기, 그림 직전의 안정화, 접근성 측정.
 * 앱 코드는 건드리지 않는다 — 모두 페이지 밖에서 브라우저 API로 한다.
 */
import type { Page } from '@playwright/test'

import type { Seed } from './seed'

export interface Fixtures {
  /** 앱이 테마를 고르는 방식 그대로: localStorage 'theme' (src/adapters/theme.ts) */
  theme: 'dark' | 'light' | 'auto'
  /** IndexedDB 열기를 멈춰 '불러오는 중…'에 머문다 */
  stall: boolean
}

/**
 * 모든 문서가 열릴 때 앱보다 먼저 돈다(context.addInitScript). Playwright가 이 함수를
 * 문자열로 옮기므로 바깥 변수를 쓰지 않는다.
 */
export function fixtures(f: Fixtures): void {
  try {
    if (f.theme === 'auto') localStorage.removeItem('theme')
    else localStorage.setItem('theme', f.theme)
  } catch {
    // 저장소가 막힌 문서(about:blank 등)
  }

  // 움직임은 처음부터 0초 — 애니메이션·전환이 곧바로 끝난 모습(fill-mode 그대로)으로 선다.
  // 끝까지 기다렸다 찍으면 애니메이션 동안 생긴 합성 레이어가 남아 카드 모서리 안티에일리어싱이
  // 실행마다 몇 픽셀씩 달랐다.
  // 초기 스크립트가 도는 때에는 <html>이 아직 없을 수 있다 — 생기는 순간 붙인다
  const still = document.createElement('style')
  still.textContent =
    '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
    'transition-duration:0s!important;transition-delay:0s!important}'
  const attach = (): boolean => {
    const root = document.documentElement as HTMLElement | null
    if (!root) return false
    root.appendChild(still)
    return true
  }
  if (!attach()) {
    const watch = new MutationObserver(() => {
      if (attach()) watch.disconnect()
    })
    watch.observe(document, { childList: true })
  }

  // 복습 큐 셔플(orderQueue)이 바꿔 놓지 않게 한다 — j = floor(r·(i+1)) = i라 자리가 그대로이고,
  // 큐는 due 순(가장 이른 카드가 첫 장)이 된다. 상태마다 첫 장을 시드로 정할 수 있다.
  Math.random = () => 0.999999

  // 연동 코드·기기 id를 실행마다 같게
  let n = 0
  const bytes = <T extends ArrayBufferView | null>(array: T): T => {
    if (array) {
      const u8 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
      for (let i = 0; i < u8.length; i++) u8[i] = (n++ * 73 + 41) & 255
    }
    return array
  }
  crypto.getRandomValues = bytes
  crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000'

  if (f.stall) {
    // idb의 openDB는 success·error 리스너로 끝을 기다린다 — 그 둘만 붙지 않게 해 영원히 기다리게 한다
    // 원래 메서드는 this 없이 꺼내 두고 apply로만 부른다
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      const req = open.apply(this, args)
      const add = req.addEventListener.bind(req)
      req.addEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject]) => {
        if (type !== 'success' && type !== 'error') add(type, ...rest)
      }
      return req
    }
  }

  // 한 번만 켜지는 장치(Session.arm): 다음 채점 커밋 트랜잭션(cards+reviews readwrite)에
  // - stale: 바로 앞에 다른 탭이 카드를 고쳐 쓴 것처럼 모든 카드의 due를 1초 당겨 둔다
  //          (같은 범위의 트랜잭션은 만든 순서대로 돈다 → 커밋이 바뀐 카드를 보고 거절한다)
  // - fail:  트랜잭션 자체가 열리지 않게 한다(저장 실패)
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const tx = IDBDatabase.prototype.transaction
  IDBDatabase.prototype.transaction = function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const [names, mode] = args
    const list = typeof names === 'string' ? [names] : Array.from(names)
    const commit = mode === 'readwrite' && list.includes('cards') && list.includes('reviews')
    if (commit && Reflect.get(window, '__captureFail') === true) {
      Reflect.set(window, '__captureFail', false)
      throw new DOMException('캡처: 저장 실패 흉내', 'UnknownError')
    }
    if (commit && Reflect.get(window, '__captureStale') === true) {
      Reflect.set(window, '__captureStale', false)
      const bump = tx.call(this, 'cards', 'readwrite')
      const cursorReq = bump.objectStore('cards').openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return
        const row = cursor.value as { card: { due: string } }
        row.card.due = new Date(Date.parse(row.card.due) - 1000).toISOString()
        cursor.update(row)
        cursor.continue()
      }
    }
    return tx.apply(this, args)
  }
}

/** 상태 정의가 화면에 가는 데 쓰는 손잡이 */
export class Session {
  constructor(
    readonly page: Page,
    /** 앱 주소 — 끝이 /scripture-memory/ */
    readonly base: string,
  ) {}

  /** 앱이 DB(tms-krv v2)를 만든 뒤 시드를 넣는다. 화면은 open()이 새로 읽는다 */
  async seed(s: Partial<Seed>): Promise<void> {
    await this.page.goto(this.base)
    await this.page.getByRole('heading', { name: '오늘의 복습' }).waitFor()
    await this.put(s)
  }

  /** 해시 경로를 새로고침으로 연다 — 모든 화면이 시드를 처음부터 읽는다 */
  async open(hash = '#/', ready = true): Promise<void> {
    const url = this.base + hash
    const loaded = this.page.url().startsWith(this.base)
    await this.page.goto(url)
    if (loaded) await this.page.reload()
    if (ready) {
      await this.page.waitForFunction(() => {
        const main = document.querySelector('main')
        return main !== null && main.childElementCount > 0 && !main.querySelector('.loading')
      })
    }
  }

  /** 저장소에 바로 쓴다 — 시드, 또는 다른 탭·기기가 쓴 것처럼 */
  async put(s: Partial<Seed>): Promise<void> {
    await this.page.evaluate(async (data) => {
      const db = await new Promise<IDBDatabase>((ok, no) => {
        const r = indexedDB.open('tms-krv')
        r.onsuccess = () => {
          ok(r.result)
        }
        r.onerror = () => {
          no(r.error ?? new Error('tms-krv 열기 실패'))
        }
      })
      const tx = db.transaction(['cards', 'reviews', 'learning', 'settings'], 'readwrite')
      for (const c of data.cards ?? []) tx.objectStore('cards').put(c)
      for (const r of data.reviews ?? []) tx.objectStore('reviews').add(r)
      for (const l of data.learning ?? []) tx.objectStore('learning').put(l)
      for (const s of data.settings ?? []) tx.objectStore('settings').put(s)
      await new Promise((ok, no) => {
        tx.oncomplete = ok
        tx.onerror = () => {
          no(tx.error ?? new Error('시드 쓰기 실패'))
        }
      })
      db.close()
    }, s)
  }

  /** 카드를 지운다 — 다른 탭에서 초기화하거나 사다리로 강등한 것처럼 */
  async deleteCards(keys: readonly string[] | 'all'): Promise<void> {
    await this.page.evaluate(async (which) => {
      const db = await new Promise<IDBDatabase>((ok, no) => {
        const r = indexedDB.open('tms-krv')
        r.onsuccess = () => {
          ok(r.result)
        }
        r.onerror = () => {
          no(r.error ?? new Error('tms-krv 열기 실패'))
        }
      })
      const tx = db.transaction('cards', 'readwrite')
      if (which === 'all') tx.objectStore('cards').clear()
      else for (const k of which) tx.objectStore('cards').delete(k)
      await new Promise((ok) => {
        tx.oncomplete = ok
      })
      db.close()
    }, keys)
  }

  /** 다음 채점 커밋 하나에 거는 장치(fixtures 참고) */
  async arm(what: 'stale' | 'fail'): Promise<void> {
    await this.page.evaluate(
      (flag) => {
        Reflect.set(window, flag, true)
      },
      what === 'stale' ? '__captureStale' : '__captureFail',
    )
  }

  button(name: string | RegExp) {
    return this.page.getByRole('button', { name, exact: typeof name === 'string' })
  }

  async click(name: string | RegExp): Promise<void> {
    await this.button(name).click()
  }

  /** 글자가 보일 때까지 — 상태 정의의 끝에서 그 상태가 맞는지 확인하는 데 쓴다 */
  async see(text: string | RegExp): Promise<void> {
    await this.page.getByText(text).first().waitFor()
  }
}

/**
 * 그림 직전의 안정화: 레이아웃을 한 번 강제해 필요한 글꼴 조각(unicode-range)이 요청되게 하고,
 * 로딩 중인 글꼴이 없을 때까지 기다린 뒤 두 프레임을 넘긴다.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      document.body.getBoundingClientRect()
      await document.fonts.ready
      const loading = Array.from(document.fonts).some((f) => f.status === 'loading')
      if (!loading && document.fonts.status === 'loaded') break
      await new Promise((r) => setTimeout(r, 30))
    }
    await new Promise((r) =>
      requestAnimationFrame(() => {
        requestAnimationFrame(r)
      }),
    )
  })
}

/**
 * 뷰포트 캡처 전 스크롤. how: 'top'(맨 위), 'focus'(포커스한 요소를 가운데로), 'keep'(그대로),
 * 그 밖에는 CSS 선택자(그 요소를 고정 헤더 바로 아래로)
 */
export async function position(page: Page, how: string): Promise<void> {
  if (how === 'keep') return
  await page.evaluate((sel) => {
    if (sel === 'top') {
      window.scrollTo(0, 0)
      return
    }
    const el = sel === 'focus' ? document.activeElement : document.querySelector(sel)
    if (!(el instanceof HTMLElement)) return
    if (sel === 'focus') {
      el.scrollIntoView({ block: 'center' })
      return
    }
    const header = document.querySelector('.app-header')
    const pinned =
      header !== null && ['sticky', 'fixed'].includes(getComputedStyle(header).position)
    const offset = pinned ? header.getBoundingClientRect().bottom : 0
    window.scrollTo(
      0,
      Math.round(el.getBoundingClientRect().top + window.scrollY - offset - 16),
    )
  }, how)
}

export interface Target {
  tag: string
  label: string
  w: number
  h: number
}

export interface Metric {
  /** 잰 대화형 요소 수 */
  checked: number
  /** 44×44px 미만 — e2e/a11y.spec.ts의 measureTargets와 같은 잣대 */
  small: Target[]
  /** 가로 넘침: scrollWidth > innerWidth */
  overflowX: boolean
  scrollWidth: number
  innerWidth: number
  /** 포커스 대표 캡처일 때만: 포커스한 요소와 그 링 */
  focus?: { label: string; visible: boolean; outline: string }
}

/** 화면에 보이는 대화형 요소의 렌더 크기, 가로 넘침, 포커스 링 */
export async function measure(page: Page, withFocus: boolean): Promise<Metric> {
  return page.evaluate(
    ({ min, withFocus }) => {
      const selector = 'a, button, input:not([type=hidden]), textarea, select, summary'
      const small: { tag: string; label: string; w: number; h: number }[] = []
      let checked = 0
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        checked++
        // 확장된 누름 영역(::after)까지 고려한다
        const after = getComputedStyle(el, '::after')
        const h = Math.max(r.height, parseFloat(after.height) || 0)
        const w = Math.max(r.width, parseFloat(after.minWidth) || 0)
        if (h < min - 0.5 || w < min - 0.5) {
          small.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 30),
            w: Math.round(w),
            h: Math.round(h),
          })
        }
      }
      const doc = document.documentElement
      const metric: {
        checked: number
        small: typeof small
        overflowX: boolean
        scrollWidth: number
        innerWidth: number
        focus?: { label: string; visible: boolean; outline: string }
      } = {
        checked,
        small,
        overflowX: doc.scrollWidth > window.innerWidth,
        scrollWidth: doc.scrollWidth,
        innerWidth: window.innerWidth,
      }
      const active = document.activeElement
      if (withFocus && active instanceof HTMLElement && active !== document.body) {
        const s = getComputedStyle(active)
        // 이름이 글자에 없는 입력란은 placeholder, 그것도 없으면 id로 부른다
        const text = active.innerText.trim()
        const name = text !== '' ? text : (active.getAttribute('placeholder') ?? active.id)
        metric.focus = {
          label: (active.getAttribute('aria-label') ?? name).trim().slice(0, 30),
          visible: active.matches(':focus-visible'),
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        }
      }
      return metric
    },
    { min: 44, withFocus },
  )
}
