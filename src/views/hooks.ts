import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { loadMeditation, store } from '../app'
import type { MeditationData } from '../app/meditation'
import {
  type BrowseData,
  type HomeData,
  loadBrowse,
  loadHome,
  loadReviewQueue,
  loadSettings,
  loadStats,
  type SettingsData,
  type StatsData,
} from '../app/queries'
import { openLadder } from '../app/review'
import { getRevision, subscribeRevision } from '../app/revision'
import { loadFullText } from '../data/fullText'
import { VERSE_BY_ID, VERSE_PASSAGES } from '../data/verses'
import type { StoredCard } from '../domain/card'
import type { LadderStep } from '../domain/ladder'
import { type FullText, type Passage, textOf } from '../domain/scripture'

/**
 * 저장소 리비전 구독. 쓰기가 끝나면 숫자가 올라가고, 이 훅을 쓰는 뷰만
 * 데이터를 다시 읽는다 — 컴포넌트를 리마운트하지 않으므로 스크롤·입력 상태가
 * 유지된다 (이전 App.tsx의 `<main key={epoch}>` 해킹을 대체).
 */
export function useRevision(): number {
  return useSyncExternalStore(subscribeRevision, getRevision, getRevision)
}

/**
 * 조회 훅들. 재조회 조건은 리비전 하나뿐이고, 뒤늦게 도착한 응답이 최신 데이터를
 * 덮어쓰지 않도록 언마운트·재실행 시 버린다. 각 훅이 모듈 최상위 loader만
 * 참조하므로 의존성 배열이 정직하다 (suppress 없음).
 */
export function useHomeData(): HomeData | null {
  const revision = useRevision()
  const [data, setData] = useState<HomeData | null>(null)
  useEffect(() => {
    let alive = true
    void loadHome(store).then((v) => {
      if (alive) setData(v)
    })
    return () => {
      alive = false
    }
  }, [revision])
  return data
}

export function useStatsSummary(): StatsData | null {
  const revision = useRevision()
  const [data, setData] = useState<StatsData | null>(null)
  useEffect(() => {
    let alive = true
    void loadStats(store).then((v) => {
      if (alive) setData(v)
    })
    return () => {
      alive = false
    }
  }, [revision])
  return data
}

/**
 * 오늘의 묵상. 리비전을 구독하므로 QT 본문을 고쳐 적으면 곧바로 다시 고른다.
 */
export function useMeditation(): MeditationData | null {
  const revision = useRevision()
  const [data, setData] = useState<MeditationData | null>(null)
  useEffect(() => {
    let alive = true
    void loadMeditation().then((v) => {
      if (alive) setData(v)
    })
    return () => {
      alive = false
    }
  }, [revision])
  return data
}

/**
 * 장절 표기 → 본문. 495구절이 먼저이고 전문이 나중이다.
 *
 * 전문(4.5MB)을 기다리지 않고 곧바로 쓸 수 있는 조회기를 돌려준다 — 그동안에도
 * 495에 있는 자리는 본문이 나오고, 전문이 도착하면 나머지가 채워진다. 묵상
 * 화면의 첫 페인트를 4.5MB 파싱 뒤로 미루지 않기 위한 것이므로, 이걸
 * `loadMeditation()`의 Promise.all에 끼워 넣지 말 것.
 */
export function useVerseTexts(): (label: string) => Passage | null {
  const [full, setFull] = useState<FullText | null>(null)
  useEffect(() => {
    let alive = true
    void loadFullText().then((t) => {
      if (alive) setFull(t)
    })
    return () => {
      alive = false
    }
  }, [])
  return useMemo(
    () => (label: string) => textOf({ corpus: VERSE_PASSAGES, full }, label),
    [full],
  )
}

export function useBrowseData(): BrowseData | null {
  const revision = useRevision()
  const [data, setData] = useState<BrowseData | null>(null)
  useEffect(() => {
    let alive = true
    void loadBrowse(store).then((v) => {
      if (alive) setData(v)
    })
    return () => {
      alive = false
    }
  }, [revision])
  return data
}

export function useSettingsData(): SettingsData | null {
  const revision = useRevision()
  const [data, setData] = useState<SettingsData | null>(null)
  useEffect(() => {
    let alive = true
    void loadSettings(store).then((v) => {
      if (alive) setData(v)
    })
    return () => {
      alive = false
    }
  }, [revision])
  return data
}

/** 본문을 찾을 수 없는 카드는 출제할 수 없다 (다른 버전 백업에서 온 구절 id) */
const isReviewable = (verseId: string): boolean => VERSE_BY_ID[verseId] !== undefined

/**
 * 복습 큐. 리비전으로 자동 재조회하지 않는다 — 매 채점이 리비전을 올리므로
 * 자동 재조회는 카드를 넘기는 중에 큐를 갈아치운다. 큐 교체는 세션이 소진된
 * 시점에 Review 뷰가 명시적으로 요청한다.
 */
export function useDueCards(): {
  queue: StoredCard[] | null
  refill: () => Promise<StoredCard[]>
} {
  const [queue, setQueue] = useState<StoredCard[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadReviewQueue(store, isReviewable).then((cards) => {
      if (alive) setQueue(cards)
    })
    return () => {
      alive = false
    }
  }, [])
  const refill = async (): Promise<StoredCard[]> => {
    const next = await loadReviewQueue(store, isReviewable)
    setQueue(next)
    return next
  }
  return { queue, refill }
}

/**
 * 학습 사다리의 현재 단계. 구절이 바뀌면 이전 구절의 단계를 잠깐이라도 보여주지
 * 않도록, 단계와 그것이 속한 구절 id를 함께 들고 다니며 불일치하면 로딩으로 본다
 * (효과 안에서 동기적으로 setState하지 않기 위한 형태다).
 */
export function useLearnProgress(verseId: string): {
  step: LadderStep | null
  setStep: (step: LadderStep) => void
} {
  const [loaded, setLoaded] = useState<{ verseId: string; step: LadderStep } | null>(null)
  useEffect(() => {
    let alive = true
    void openLadder(store, verseId).then((step) => {
      if (alive) setLoaded({ verseId, step })
    })
    return () => {
      alive = false
    }
  }, [verseId])
  return {
    step: loaded?.verseId === verseId ? loaded.step : null,
    setStep: (step) => {
      setLoaded({ verseId, step })
    },
  }
}
