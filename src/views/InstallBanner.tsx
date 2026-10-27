import { usePwaInstall } from './usePwaInstall'

export function InstallBanner() {
  const { hint, install, dismiss } = usePwaInstall()
  if (!hint) return null
  return (
    <aside className="install-banner" aria-label="앱 설치 안내">
      {hint === 'prompt' ? (
        <button className="btn btn-primary" onClick={install}>
          <span aria-hidden="true">📲</span> 홈 화면에 앱 설치하기
        </button>
      ) : (
        <p className="small">사파리 하단 [공유] → [홈 화면에 추가]로 설치하세요</p>
      )}
      <button className="btn" aria-label="설치 안내 닫기" onClick={dismiss}>
        닫기
      </button>
    </aside>
  )
}
