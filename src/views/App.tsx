import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'

import { introSeen, markIntroSeen } from '../adapters/intro'
import { store } from '../app'
import { isBlankDevice } from '../app/queries'
import { SettleShield } from '../components/SettleShield'
import { BRAND_SUB, Wordmark } from '../components/Wordmark'
import { Browse } from './Browse'
import { Home } from './Home'
import { InstallBanner } from './InstallBanner'
import type { IntroProps } from './intro/Intro'
import { Learn } from './Learn'
import { Recalibrate } from './Recalibrate'
import { Review } from './Review'
import { type Route, SCREEN_TITLES, TABS, toHash, useRoute } from './router'
import { Settings } from './Settings'
import { TabIcon } from './TabIcon'

export default function App() {
  const { route, navigate } = useRoute()
  const intro = useIntro()

  return (
    <>
      {/* 소개가 떠 있는 동안 뒤의 앱은 누를 수도 읽을 수도 없다 — aria-hidden은 inert를 모르는 브라우저의 낭독기 몫 */}
      <div
        className="app"
        inert={intro.Scene !== null}
        aria-hidden={intro.Scene !== null ? true : undefined}
      >
        <header className="app-header">
          {/* 워드마크의 기하는 components/Wordmark.tsx */}
          <h1 className="brand" aria-label="Ivan">
            <Wordmark />
          </h1>
          <span className="brand-sub muted small">{BRAND_SUB}</span>
          {/* 모바일은 워드마크 대신 지금 화면의 이름을 보인다 — 탭이 아이콘뿐이라 글자로 된 위치 단서가 이것 하나다 */}
          <p className="screen-title">{SCREEN_TITLES[route.name]}</p>

          {/*
            한 요소가 폭에 따라 자리를 바꾼다: 모바일은 화면 아래 떠 있는 아이콘 독,
            PC(769px 이상)는 헤더 오른쪽의 아이콘+이름 탭. 헤더 안에 두는 이유는 PC에서
            워드마크와 한 줄에 놓기 위해서다 — 모바일의 position: fixed는 헤더 위치와 무관하다.
          */}
          <nav className="tab-nav" aria-label="주요 화면">
            {TABS.map((tab) => {
              const current = route.name === tab.name
              return (
                <a
                  key={tab.name}
                  href={toHash({ name: tab.name })}
                  className={current ? 'active' : ''}
                  aria-current={current ? 'page' : undefined}
                  aria-label={tab.label}
                >
                  <TabIcon name={tab.name} />
                  <span className="tab-label">{tab.label}</span>
                </a>
              )
            })}
          </nav>
        </header>

        <InstallBanner />

        {/*
          이전에는 <main key={epoch}>로 뷰 전체를 강제 리마운트해 데이터를 갱신했다.
          이제 저장소 리비전을 구독하는 훅이 데이터만 다시 읽으므로, 스크롤 위치와
          입력 중인 텍스트가 유지된다.
        */}
        <main>
          <ViewFor route={route} navigate={navigate} onReplayIntro={intro.open} />
        </main>

        {/* 같은 자리를 연달아 누른 둘째 누름이 방금 나타난 버튼에 떨어지지 않게 하는 가림막 */}
        <SettleShield />
      </div>
      {intro.Scene && (
        <intro.Scene
          onClose={() => {
            intro.close()
            navigate({ name: 'home' })
          }}
        />
      )}
    </>
  )
}

/** 장면 조각을 받는다 — 받지 못하면(조각이 캐시에도 네트워크에도 없으면) 소개 없이 둔다 */
const loadIntro = (): Promise<ComponentType<IntroProps> | null> =>
  import('./intro/Intro').then(
    (m) => m.Intro,
    () => null,
  )

/**
 * 소개 장면 — 처음 실행할 때 한 번 저절로 뜨고, 설정의 '소개 다시 보기'로 다시 연다.
 * 장면(컴포넌트·CSS·시각표)은 따로 떨어진 조각이라 열 때만 받는다 — 첫 화면에 남는 것은 이
 * 판정뿐이다. 저절로 뜨는 조건은 이 기기에서 띄운 적이 없고(adapters/intro.ts) 기록이 하나도
 * 없을 때(isBlankDevice)이며, 뜨는 순간 표시를 적는다 — 중간에 닫아도 다시 저절로 뜨지 않는다.
 * 조각을 받는 사이에 기록이 생겼거나(백업 가져오기·연동) 다른 화면으로 갔으면 띄우지 않는다.
 * 장면이 떠 있는 동안 뒤의 앱은 inert라 포커스·낭독기가 닿지 않는다.
 */
function useIntro() {
  const [Scene, setScene] = useState<ComponentType<IntroProps> | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const open = useCallback(() => {
    void loadIntro().then((Intro) => {
      if (Intro && mounted.current) setScene(() => Intro)
    })
  }, [])

  useEffect(() => {
    if (introSeen()) return
    let live = true
    const route = window.location.hash
    const still = () => live && !introSeen() && window.location.hash === route
    void (async () => {
      if (!(await isBlankDevice(store)) || !still()) return
      const Intro = await loadIntro()
      // 조각을 받는 동안 바뀐 것이 없는지 한 번 더 본다
      if (!Intro || !still() || !(await isBlankDevice(store)) || !still()) return
      markIntroSeen()
      setScene(() => Intro)
    })().catch(() => {
      // 기록을 읽지 못하면 소개 없이 둔다 — 소개는 핵심 기능이 아니다
    })
    return () => {
      live = false
    }
  }, [])

  const close = useCallback(() => {
    setScene(null)
  }, [])

  return { Scene, open, close }
}

function ViewFor({
  route,
  navigate,
  onReplayIntro,
}: {
  route: Route
  navigate: (route: Route) => void
  onReplayIntro: () => void
}) {
  switch (route.name) {
    case 'home':
      return (
        <Home
          onReview={() => {
            navigate({ name: 'review' })
          }}
          onLearn={(verseId) => {
            navigate({ name: 'learn', verseId })
          }}
          onBrowse={() => {
            navigate({ name: 'browse' })
          }}
          onRecalibrate={() => {
            navigate({ name: 'recalibrate' })
          }}
        />
      )
    case 'review':
      return (
        <Review
          onExit={() => {
            navigate({ name: 'home' })
          }}
        />
      )
    case 'learn':
      return (
        // 구절이 바뀌면(다음 구절 버튼) Learn을 리마운트해 이전 구절의 채점
        // 상태(grade/attempt/peeks)가 새 구절의 화면을 오염시키지 않게 한다.
        // 같은 경로라도 verseId가 다르면 리마운트되어 사다리를 처음부터 시작한다.
        <Learn
          key={route.verseId}
          verseId={route.verseId}
          onExit={() => {
            navigate({ name: 'home' })
          }}
          onReview={() => {
            navigate({ name: 'review' })
          }}
          onLearn={(verseId) => {
            navigate({ name: 'learn', verseId })
          }}
        />
      )
    case 'browse':
      return (
        <Browse
          onLearn={(verseId) => {
            navigate({ name: 'learn', verseId })
          }}
        />
      )
    case 'settings':
      return (
        <Settings
          onRecalibrate={() => {
            navigate({ name: 'recalibrate' })
          }}
          onReplayIntro={onReplayIntro}
        />
      )
    case 'recalibrate':
      return (
        <Recalibrate
          onExit={() => {
            navigate({ name: 'home' })
          }}
        />
      )
  }
}
