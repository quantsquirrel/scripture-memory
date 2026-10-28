/** 화면 테마. 'auto'는 기기(OS)의 prefers-color-scheme를 따른다. */
export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'theme'

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

/** <html data-theme>를 세팅. auto면 속성을 제거해 CSS media query(OS 설정)로 되돌린다. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement
  if (t === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  syncThemeColor(t)
}

/**
 * 브라우저 주소창·상태바 색(<meta name="theme-color">)을 앱 배경에 맞춘다.
 * index.html은 OS 설정별로 두 장을 media로 나눠 둔다. 테마를 고정하면 OS가 무엇이든
 * 같은 색이어야 하므로 두 장 모두 고정 테마의 배경색으로 바꾸고, auto면 제 짝으로 되돌린다.
 * 색은 tokens.css의 --palette-*-bg에서 읽는다 — 값을 여기 다시 적지 않는다.
 */
function syncThemeColor(t: Theme): void {
  const css = getComputedStyle(document.documentElement)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? 'dark' : 'light'
    const color = css.getPropertyValue(`--palette-${t === 'auto' ? own : t}-bg`).trim()
    if (color !== '') meta.content = color
  }
}

export function setTheme(t: Theme): void {
  if (t === 'auto') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, t)
  applyTheme(t)
}
