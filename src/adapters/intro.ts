/**
 * 소개 장면을 이 기기에서 이미 띄웠는가. 기기마다의 표시 여부라 테마(theme.ts)처럼 localStorage에
 * 두고, 저장소(IndexedDB)와 export 번들에는 싣지 않는다 — 백업을 옮겨도 따라가지 않는다.
 *
 * 저장소를 쓸 수 없는 환경(막힌 저장소·용량 초과)에서는 띄운 것으로 친다 — 표시를 적을 수 없는
 * 기기에서 소개가 열 때마다 다시 뜨지 않게, 그리고 읽기 실패가 앱을 멈추지 않게.
 */
const KEY = 'intro-seen'

export function introSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 표시를 적지 못해도 소개는 띄운다 — 다음 실행의 판정은 introSeen()이 맡는다
  }
}
