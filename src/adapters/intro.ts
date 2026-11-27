/**
 * 소개 장면을 이 기기에서 이미 띄웠는가. 기기마다의 표시 여부라 테마(theme.ts)처럼 localStorage에
 * 두고, 저장소(IndexedDB)와 export 번들에는 싣지 않는다 — 백업을 옮겨도 따라가지 않는다.
 */
const KEY = 'intro-seen'

export function introSeen(): boolean {
  return localStorage.getItem(KEY) !== null
}

export function markIntroSeen(): void {
  localStorage.setItem(KEY, '1')
}
