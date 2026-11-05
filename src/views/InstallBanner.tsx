import { usePwaInstall } from './usePwaInstall'

export function InstallBanner() {
  const { hint, install, dismiss } = usePwaInstall()
  if (!hint) return null
  return (
    <aside className="install-banner" aria-label="앱 설치 안내">
      {/* 화면마다 위에 붙는 안내라서 금색(등불)을 쓰지 않는다 — 그 화면의 주 행동과 겹친다 */}
      {hint === 'prompt' ? (
        <button className="btn btn-install" onClick={install}>
          홈 화면에 앱 설치하기
        </button>
      ) : (
        <p className="small">사파리 하단 [공유] → [홈 화면에 추가]로 설치하세요</p>
      )}
      <button className="btn-ghost" aria-label="설치 안내 닫기" onClick={dismiss}>
        닫기
      </button>
    </aside>
  )
}
