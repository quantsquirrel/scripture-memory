import { useEffect, useRef, useState } from 'react'
import {
  exportAll,
  getAllLearning,
  getSetting,
  importAll,
  resetAll,
  reviewCount,
  setSetting,
} from '../lib/db'
import { DEFAULT_GOAL_DATE, DEFAULT_REVIEW_BUFFER_DAYS } from '../lib/goal'
import { syncNow } from '../lib/sync'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const THEME_OPTIONS: [Theme, string][] = [
  ['auto', '자동'],
  ['light', '라이트'],
  ['dark', '다크'],
]

export function Settings({ onChanged }: { onChanged: () => void }) {
  const [stats, setStats] = useState<{ reviews: number; graduated: number } | null>(null)
  const [msg, setMsg] = useState('')
  const [goalDate, setGoalDate] = useState(DEFAULT_GOAL_DATE)
  const [bufferDays, setBufferDays] = useState(DEFAULT_REVIEW_BUFFER_DAYS)
  const [token, setToken] = useState('')
  const [gistId, setGistId] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const fileRef = useRef<HTMLInputElement>(null)

  const chooseTheme = (t: Theme) => {
    setTheme(t)
    setThemeState(t)
  }

  useEffect(() => {
    void Promise.all([
      reviewCount(),
      getAllLearning(),
      getSetting<string>('goalDate'),
      getSetting<number>('goalBufferDays'),
      getSetting<string>('syncToken'),
      getSetting<string>('syncGistId'),
      getSetting<string>('lastSyncAt'),
    ]).then(([r, l, g, buf, t, gid, last]) => {
      setStats({ reviews: r, graduated: l.filter((x) => x.step >= 3).length })
      if (g) setGoalDate(g)
      if (buf !== undefined) setBufferDays(buf)
      if (t) setToken(t)
      if (gid) setGistId(gid)
      if (last) setSyncMsg(`마지막 동기화: ${new Date(last).toLocaleString('ko-KR')}`)
    })
  }, [msg])

  const saveGoal = async (d: string) => {
    setGoalDate(d)
    await setSetting('goalDate', d)
    setMsg('목표일을 저장했습니다.')
    onChanged()
  }

  const saveBuffer = async (n: number) => {
    const v = Math.min(30, Math.max(0, Math.floor(n)))
    setBufferDays(v)
    await setSetting('goalBufferDays', v)
    setMsg('복습 정착 기간을 저장했습니다.')
    onChanged()
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg('동기화 중…')
    try {
      await setSetting('syncToken', token.trim())
      await setSetting('syncGistId', gistId.trim())
      const r = await syncNow({ token: token.trim(), gistId: gistId.trim() })
      const now = new Date().toISOString()
      await setSetting('lastSyncAt', now)
      setSyncMsg(
        `동기화 완료 — 복습 ${r.reviews}건 · 카드 ${r.cards}장 · 학습 ${r.learning}건`,
      )
      onChanged()
    } catch (e) {
      setSyncMsg(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  const doExport = async () => {
    const bundle = await exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tms-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('백업 파일을 내려받았습니다.')
  }

  const doImport = async (file: File) => {
    try {
      await importAll(JSON.parse(await file.text()))
      setMsg('가져오기 완료.')
      onChanged()
    } catch (e) {
      setMsg(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doReset = async () => {
    if (!window.confirm('모든 학습/복습 기록을 삭제합니다. 계속할까요?')) return
    await resetAll()
    setMsg('초기화했습니다.')
    onChanged()
  }

  return (
    <div>
      <section className="panel">
        <h2>통계</h2>
        {stats && (
          <p>
            총 복습 <strong>{stats.reviews}</strong>회 · 암송 편입{' '}
            <strong>{stats.graduated}</strong>구절
          </p>
        )}
      </section>

      <section className="panel">
        <h2>화면 테마</h2>
        <div className="seg-row">
          {THEME_OPTIONS.map(([v, label]) => (
            <button
              key={v}
              className={`seg${theme === v ? ' active' : ''}`}
              onClick={() => chooseTheme(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small">
          '자동'은 기기(OS)의 다크/라이트 설정을 따릅니다. 라이트나 다크를 고르면 OS
          설정과 무관하게 이 기기에서 항상 유지됩니다.
        </p>
      </section>

      <section className="panel">
        <h2>암송 목표일</h2>
        <input
          className="ref-input"
          type="date"
          value={goalDate}
          onChange={(e) => void saveGoal(e.target.value)}
        />
        <label className="muted small" htmlFor="buffer-days">
          복습 정착 기간 (일)
        </label>
        <input
          id="buffer-days"
          className="ref-input"
          type="number"
          min={0}
          max={30}
          value={bufferDays}
          onChange={(e) => void saveBuffer(Number(e.target.value))}
        />
        <p className="muted small">
          시험(목표일)에 암송할 수 있으려면 외운 뒤 복습으로 굳힐 시간이 필요합니다. 새
          구절 학습은 목표일 {bufferDays}일 전까지 끝내는 것으로 일일 목표를 계산하고,
          남은 기간은 복습만 합니다. 목표일 이후에는 FSRS가 알아서 복습 간격을 늘려 유지
          모드로 전환됩니다.
        </p>
      </section>

      <section className="panel">
        <h2>기기 간 동기화 (GitHub Gist)</h2>
        <input
          className="ref-input"
          type="password"
          placeholder="GitHub 토큰 (gist 권한만)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <input
          className="ref-input"
          placeholder="Gist ID"
          value={gistId}
          onChange={(e) => setGistId(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="btn btn-primary"
          disabled={syncing || !token.trim() || !gistId.trim()}
          onClick={() => void doSync()}
        >
          {syncing ? '동기화 중…' : '지금 동기화'}
        </button>
        {syncMsg && <p className="muted small">{syncMsg}</p>}
        <p className="muted small">
          복습 기록은 합집합으로, 카드·학습 상태는 더 진행된 쪽으로 병합됩니다. 토큰은
          이 기기(IndexedDB)에만 저장됩니다. 공부 시작 전과 후에 한 번씩 눌러 주세요.
        </p>
      </section>

      <section className="panel">
        <h2>데이터</h2>
        <div className="btn-row">
          <button className="btn" onClick={() => void doExport()}>
            내보내기 (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            가져오기
          </button>
          <button className="btn btn-danger" onClick={() => void doReset()}>
            초기화
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
            e.target.value = ''
          }}
        />
        {msg && <p className="muted small">{msg}</p>}
      </section>

      <section className="panel">
        <h2>정보</h2>
        <p className="muted small">
          본문: 성경전서 개역한글판(1961). 저작재산권 보호기간 만료(2011.12.31)로
          퍼블릭 도메인이며, 대한성서공회 온라인 본문에서 추출·검증했습니다.
          <br />
          구성: 네비게이토 암송 과정 495구절 — 그리스도인의 확신(5확신) 5구절 →
          그리스도인의 생활지침(8동행) 8구절 → 주제별 성경암송 60구절 → 제자의
          도(DEP242) 242구절 → 주제별 성경암송 시리즈 180구절.
          <br />
          스케줄링: FSRS (ts-fsrs, 목표 기억율 90%).
          <br />
          낭송 규칙: 주제 → 장절 → 말씀 → 장절.
        </p>
      </section>
    </div>
  )
}
