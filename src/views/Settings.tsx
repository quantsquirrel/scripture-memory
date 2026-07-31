import { useRef, useState } from 'react'

import { getTheme, setTheme, type Theme } from '../adapters/theme'
import {
  applySchedulerSettings,
  exportAll,
  importAll,
  resetAll,
  setExamMode as persistExamMode,
  setGoalBufferDays as persistGoalBufferDays,
  setGoalDate as persistGoalDate,
  setLastSyncAt as persistLastSyncAt,
  setSyncGistId as persistSyncGistId,
  setSyncToken as persistSyncToken,
  syncNow,
} from '../app'
import { useSettingsData } from './hooks'
import { AboutPanel, DataPanel, GoalPanel, SyncPanel, ThemePanel } from './settings/panels'

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function Settings() {
  const data = useSettingsData()
  const [msg, setMsg] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [gistId, setGistId] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const fileRef = useRef<HTMLInputElement>(null)

  if (!data) return <p className="muted">불러오는 중…</p>

  // 입력 중인 값이 있으면 그것을, 없으면 저장된 값을 보여준다
  const tokenValue = token ?? data.syncToken
  const gistIdValue = gistId ?? data.syncGistId

  const saveGoalDate = async (d: string) => {
    await persistGoalDate(d)
    await applySchedulerSettings() // 시험 모드 활성 판정이 목표일에 걸려 있음
    setMsg('목표일을 저장했습니다.')
  }

  const saveExamMode = async (on: boolean) => {
    await persistExamMode(on)
    await applySchedulerSettings()
    setMsg(on ? '시험 모드를 켰습니다.' : '시험 모드를 껐습니다.')
  }

  const saveBuffer = async (n: number) => {
    await persistGoalBufferDays(Math.min(30, Math.max(0, Math.floor(n))))
    setMsg('복습 정착 기간을 저장했습니다.')
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg('동기화 중…')
    try {
      await persistSyncToken(tokenValue.trim())
      await persistSyncGistId(gistIdValue.trim())
      const r = await syncNow({ token: tokenValue.trim(), gistId: gistIdValue.trim() })
      await persistLastSyncAt(new Date().toISOString())
      setSyncMsg(`동기화 완료 — 복습 ${r.reviews}건 · 카드 ${r.cards}장 · 학습 ${r.learning}건`)
    } catch (e) {
      setSyncMsg(`실패: ${message(e)}`)
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
      await importAll(JSON.parse(await file.text()) as unknown)
      setMsg('가져오기 완료.')
    } catch (e) {
      setMsg(`가져오기 실패: ${message(e)}`)
    }
  }

  const doReset = async () => {
    if (!window.confirm('모든 학습/복습 기록을 삭제합니다. 계속할까요?')) return
    await resetAll()
    setMsg('초기화했습니다.')
  }

  return (
    <div>
      <section className="panel">
        <h2>통계</h2>
        <p>
          총 복습 <strong>{data.reviews}</strong>회 · 암송 편입{' '}
          <strong>{data.graduated}</strong>
          구절
        </p>
      </section>

      <ThemePanel
        theme={theme}
        onChoose={(t) => {
          setTheme(t)
          setThemeState(t)
        }}
      />

      <GoalPanel
        goalDate={data.goalDate}
        bufferDays={data.bufferDays}
        examMode={data.examMode}
        onGoalDate={(d) => void saveGoalDate(d)}
        onBufferDays={(n) => void saveBuffer(n)}
        onExamMode={(on) => void saveExamMode(on)}
      />

      <SyncPanel
        token={tokenValue}
        gistId={gistIdValue}
        syncing={syncing}
        message={
          syncMsg ||
          (data.lastSyncAt
            ? `마지막 동기화: ${new Date(data.lastSyncAt).toLocaleString('ko-KR')}`
            : '')
        }
        onToken={setToken}
        onGistId={setGistId}
        onSync={() => void doSync()}
      />

      <DataPanel
        fileRef={fileRef}
        message={msg}
        onExport={() => void doExport()}
        onImport={(f) => void doImport(f)}
        onReset={() => void doReset()}
      />

      <AboutPanel />
    </div>
  )
}
