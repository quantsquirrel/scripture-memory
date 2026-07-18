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
}

export function setTheme(t: Theme): void {
  if (t === 'auto') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, t)
  applyTheme(t)
}
