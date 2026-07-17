import { useState } from 'react'
import { Browse } from './views/Browse'
import { Home } from './views/Home'
import { Learn } from './views/Learn'
import { Review } from './views/Review'
import { Settings } from './views/Settings'

type View =
  | { name: 'home' }
  | { name: 'review' }
  | { name: 'learn'; verseId: string }
  | { name: 'browse' }
  | { name: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [epoch, setEpoch] = useState(0)

  const go = (v: View) => {
    setView(v)
    setEpoch((e) => e + 1) // 뷰 재마운트로 데이터 갱신
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>말씀암송</h1>
        <span className="muted small">주제별 성경암송 · 개역한글</span>
      </header>

      <main key={epoch}>
        {view.name === 'home' && (
          <Home
            onReview={() => go({ name: 'review' })}
            onLearn={(verseId) => go({ name: 'learn', verseId })}
            onBrowse={() => go({ name: 'browse' })}
          />
        )}
        {view.name === 'review' && <Review onExit={() => go({ name: 'home' })} />}
        {view.name === 'learn' && (
          <Learn
            verseId={view.verseId}
            onExit={() => go({ name: 'home' })}
            onReview={() => go({ name: 'review' })}
            onLearn={(verseId) => go({ name: 'learn', verseId })}
          />
        )}
        {view.name === 'browse' && (
          <Browse onLearn={(verseId) => go({ name: 'learn', verseId })} />
        )}
        {view.name === 'settings' && <Settings onChanged={() => setEpoch((e) => e + 1)} />}
      </main>

      <nav className="bottom-nav">
        {(
          [
            ['home', '홈'],
            ['review', '복습'],
            ['browse', '목록'],
            ['settings', '설정'],
          ] as const
        ).map(([name, label]) => (
          <button
            key={name}
            className={view.name === name ? 'active' : ''}
            onClick={() => go({ name } as View)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
