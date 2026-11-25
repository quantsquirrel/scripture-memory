import { Chevron } from '../components/Chevron'
import { usePwaInstall } from './usePwaInstall'

export function InstallBanner() {
  const { hint, install, dismiss } = usePwaInstall()
  if (!hint) return null
  return (
    <aside className="install-banner" aria-label="앱 설치 안내">
      {/* 화면마다 위에 붙는 안내라서 금색(등불)을 쓰지 않는다 — 홈의 복귀 안내와 같은 우물 한 줄 */}
      {hint === 'prompt' ? (
        <button type="button" className="install-action" onClick={install}>
          <span>홈 화면에 앱 설치하기</span>
          <Chevron dir="right" />
        </button>
      ) : (
        <p className="install-text small">
          사파리 하단 [공유] → <span className="nowrap">[홈 화면에 추가]로</span> 설치하세요
        </p>
      )}
      <button
        type="button"
        className="btn-ghost install-dismiss"
        aria-label="설치 안내 닫기"
        onClick={dismiss}
      >
        닫기
      </button>
    </aside>
  )
}
