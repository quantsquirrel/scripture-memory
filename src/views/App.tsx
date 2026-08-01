import { useEffect } from 'react'

import { applySchedulerSettings } from '../app'
import { Browse } from './Browse'
import { Home } from './Home'
import { useRevision } from './hooks'
import { Learn } from './Learn'
import { Review } from './Review'
import { type Route, TABS, toHash, useRoute } from './router'
import { Settings } from './Settings'
import { Stats } from './Stats'

export default function App() {
  const { route, navigate } = useRoute()
  const revision = useRevision()

  // 시험 모드 설정 → 스케줄러 목표 기억률. 설정이 바뀌면 리비전이 올라 재적용된다.
  useEffect(() => {
    void applySchedulerSettings()
  }, [revision])

  return (
    <div className="app">
      <header className="app-header">
        <h1>말씀암송</h1>
        <span className="muted small">주제별 성경암송 · 개역한글</span>
      </header>

      {/*
        이전에는 <main key={epoch}>로 뷰 전체를 강제 리마운트해 데이터를 갱신했다.
        이제 저장소 리비전을 구독하는 훅이 데이터만 다시 읽으므로, 스크롤 위치와
        입력 중인 텍스트가 유지된다.
      */}
      <main>
        <ViewFor route={route} navigate={navigate} />
      </main>

      <nav className="bottom-nav" aria-label="주요 화면">
        {TABS.map((tab) => {
          const current = route.name === tab.name
          return (
            <a
              key={tab.name}
              href={toHash({ name: tab.name } as Route)}
              className={current ? 'active' : ''}
              aria-current={current ? 'page' : undefined}
            >
              {tab.label}
            </a>
          )
        })}
      </nav>
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
    case 'stats':
      return <Stats />
    case 'settings':
      return <Settings />
  }
}
