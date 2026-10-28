import { Browse } from './Browse'
import { Home } from './Home'
import { InstallBanner } from './InstallBanner'
import { Learn } from './Learn'
import { Recalibrate } from './Recalibrate'
import { Review } from './Review'
import { type Route, SCREEN_TITLES, TABS, toHash, useRoute } from './router'
import { Settings } from './Settings'
import { TabIcon } from './TabIcon'

export default function App() {
  const { route, navigate } = useRoute()

  return (
    <div className="app">
      <header className="app-header">
        {/* 워드마크: i를 SVG 벡터 마크로 그려 등불 점(악센트 금색)을 기둥 정중앙에 올린다 — DESIGN.md Overview의 시각 은유 */}
        <h1 className="brand" aria-label="Ivan">
          <span aria-hidden="true" className="brand-wordmark">
            <svg
              className="brand-i-icon"
              viewBox="0 0 10 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="5" cy="4.5" r="3" fill="var(--color-accent)" />
              <circle cx="5" cy="4.5" r="5.5" fill="var(--color-accent)" opacity="0.25" />
              <rect x="3.2" y="10.5" width="3.6" height="13.5" rx="1.8" fill="currentColor" />
            </svg>
            <span className="brand-tail">van</span>
          </span>
        </h1>
        <span className="brand-sub muted small">말씀암송 · 개역한글</span>
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
        <ViewFor route={route} navigate={navigate} />
      </main>
    </div>
  )
}

function ViewFor({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
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
