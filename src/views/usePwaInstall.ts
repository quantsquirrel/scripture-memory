import { useEffect, useState } from 'react'

/**
 * 홈 화면 설치 안내.
 *
 * 크롬·엣지·안드로이드는 beforeinstallprompt를 주므로 그 이벤트를 붙잡아 두었다가
 * 버튼으로 띄운다. iOS 사파리는 이 이벤트가 없고 설치 API도 없어서, 공유 메뉴로
 * 직접 추가하라는 안내만 할 수 있다. 이미 설치된 앱(standalone)이거나 사용자가
 * 닫았으면 보이지 않는다.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallHint = 'prompt' | 'ios' | null

export function installHint(env: {
  standalone: boolean
  ios: boolean
  canPrompt: boolean
  dismissed: boolean
}): InstallHint {
  if (env.standalone || env.dismissed) return null
  if (env.canPrompt) return 'prompt'
  return env.ios ? 'ios' : null
}

const DISMISS_KEY = 'ivan-install-dismissed'

// 저장소가 막힌 환경(사생활 보호 모드 등)에서는 매번 다시 보일 뿐이다
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

// iPadOS 13+ 사파리는 데스크톱 맥으로 자신을 밝힌다 — 터치 지원으로 가려낸다
function isIos(): boolean {
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

export function usePwaInstall(): {
  hint: InstallHint
  install: () => void
  dismiss: () => void
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [standalone, setStandalone] = useState(isStandalone)
  const [ios] = useState(isIos)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setStandalone(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    hint: installHint({ standalone, ios, canPrompt: deferred !== null, dismissed }),
    // 붙잡은 이벤트는 한 번만 prompt()할 수 있다
    install: () => {
      if (!deferred) return
      setDeferred(null)
      void deferred.prompt()
    },
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, '1')
      } catch {
        // 이번 세션에서만 닫힌다
      }
      setDismissed(true)
    },
  }
}
