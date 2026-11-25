import { useRef, useState } from 'react'

import { getTheme, setTheme, type Theme } from '../adapters/theme'
import {
  exportAll,
  importAll,
  resetAll,
  setGoalBufferDays as persistGoalBufferDays,
  setGoalDate as persistGoalDate,
  setGoalScope as persistGoalScope,
  setLastSyncAt as persistLastSyncAt,
  setSyncGistId as persistSyncGistId,
  setSyncToken as persistSyncToken,
} from '../app'
import {
  applyPairingCode,
  generatePairingCode,
  type Pairing,
  pairingRelay,
} from '../app/pairing'
import { syncNow } from '../app/sync'
import { formatCode } from '../domain/pairingCode'
import { useSettingsData } from './hooks'
import {
  AboutPanel,
  DataPanel,
  GoalPanel,
  PairingPanel,
  type StatusNote,
  SyncPanel,
  ThemePanel,
} from './settings/panels'

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function Settings({ onRecalibrate }: { onRecalibrate: () => void }) {
  const data = useSettingsData()
  const [msg, setMsg] = useState<StatusNote | null>(null)
  const [resetMsg, setResetMsg] = useState<StatusNote | null>(null)
  const [goalMsg, setGoalMsg] = useState<StatusNote | null>(null)
  const [syncMsg, setSyncMsg] = useState<StatusNote | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [gistId, setGistId] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [pairBusy, setPairBusy] = useState<'create' | 'apply' | null>(null)
  const [pairInput, setPairInput] = useState('')
  const [pairCreateMsg, setPairCreateMsg] = useState<StatusNote | null>(null)
  const [pairMsg, setPairMsg] = useState<StatusNote | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!data) return <p className="muted loading">불러오는 중…</p>

  // 입력 중인 값이 있으면 그것을, 없으면 저장된 값을 보여준다
  const tokenValue = token ?? data.syncToken
  const gistIdValue = gistId ?? data.syncGistId

  const saveGoalScope = async (scope: string) => {
    await persistGoalScope(scope)
    setGoalMsg({ text: '목표 범위를 저장했습니다.' })
  }

  const saveGoalDate = async (d: string) => {
    await persistGoalDate(d)
    setGoalMsg({ text: '목표일을 저장했습니다.' })
  }

  const saveBuffer = async (n: number) => {
    await persistGoalBufferDays(Math.min(30, Math.max(0, Math.floor(n))))
    setGoalMsg({ text: '복습 정착 기간을 저장했습니다.' })
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg({ text: '동기화 중…' })
    try {
      await persistSyncToken(tokenValue.trim())
      await persistSyncGistId(gistIdValue.trim())
      const r = await syncNow({ token: tokenValue.trim(), gistId: gistIdValue.trim() })
      await persistLastSyncAt(new Date().toISOString())
      setSyncMsg({
        text: `동기화 완료: 복습 ${r.reviews}건, 카드 ${r.cards}장, 학습 ${r.learning}건`,
      })
    } catch (e) {
      setSyncMsg({ text: `실패: ${message(e)}`, error: true })
    } finally {
      setSyncing(false)
    }
  }

  const doCreatePairing = async () => {
    setPairBusy('create')
    setPairCreateMsg(null)
    setPairMsg(null)
    try {
      setPairing(await generatePairingCode())
    } catch (e) {
      setPairCreateMsg({ text: `코드 만들기 실패: ${message(e)}`, error: true })
    } finally {
      setPairBusy(null)
    }
  }

  const doCopyPairing = async () => {
    if (!pairing) return
    setPairMsg(null)
    try {
      await navigator.clipboard.writeText(formatCode(pairing.code))
      setPairCreateMsg({ text: '코드를 복사했습니다.' })
    } catch {
      setPairCreateMsg({
        text: '복사하지 못했습니다. 코드를 직접 옮겨 적어 주세요.',
        error: true,
      })
    }
  }

  const doApplyPairing = async () => {
    setPairBusy('apply')
    setPairCreateMsg(null)
    setPairMsg({ text: '다른 기기의 기록을 가져오는 중…' })
    try {
      const r = await applyPairingCode(pairInput)
      setPairInput('')
      setPairMsg({
        text: `연동 완료: 복습 ${r.reviews}건, 카드 ${r.cards}장, 학습 ${r.learning}건`,
      })
    } catch (e) {
      setPairMsg({ text: `연동 실패: ${message(e)}`, error: true })
    } finally {
      setPairBusy(null)
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
    setResetMsg(null)
    setMsg({ text: '백업 파일을 내려받았습니다.' })
  }

  const doImport = async (file: File) => {
    setResetMsg(null)
    try {
      await importAll(JSON.parse(await file.text()) as unknown)
      setMsg({ text: '가져오기 완료.' })
    } catch (e) {
      setMsg({ text: `가져오기 실패: ${message(e)}`, error: true })
    }
  }

  const doReset = async () => {
    if (!window.confirm('모든 학습/복습 기록을 삭제합니다. 계속할까요?')) return
    await resetAll()
    setMsg(null)
    setResetMsg({ text: '초기화했습니다.' })
  }

  return (
    <div>
      {/* 기록은 읽는 숫자라 카드에 담지 않고 바닥에 세운다 — 카드는 손으로 다루는 설정 묶음에만 */}
      <section className="ground">
        <h2>기록</h2>
        {/* 숫자 둘을 세로 헤어라인으로 가른다. 이름과 값 사이 공백은 "총 복습 4회"처럼
            한 문장으로 읽히게 남겨 둔다(화면 낭독기·e2e가 그렇게 읽는다) */}
        <dl className="figures">
          <div>
            <dt>암송 편입</dt>{' '}
            <dd>
              <strong className="stat-value">{data.graduated}</strong>구절
            </dd>
          </div>
          <div>
            <dt>총 복습</dt>{' '}
            <dd>
              <strong className="stat-value">{data.reviews}</strong>회
            </dd>
          </div>
        </dl>
      </section>

      <ThemePanel
        theme={theme}
        onChoose={(t) => {
          setTheme(t)
          setThemeState(t)
        }}
      />

      <GoalPanel
        goal={data.goal}
        status={goalMsg}
        onScope={(s) => void saveGoalScope(s)}
        onGoalDate={(d) => void saveGoalDate(d)}
        onBufferDays={(n) => void saveBuffer(n)}
      />

      <PairingPanel
        enabled={pairingRelay() !== null}
        pairing={pairing}
        busy={pairBusy}
        input={pairInput}
        createStatus={pairCreateMsg}
        applyStatus={pairMsg}
        onCreate={() => void doCreatePairing()}
        onCopy={() => void doCopyPairing()}
        onInput={setPairInput}
        onApply={() => void doApplyPairing()}
      />

      <SyncPanel
        token={tokenValue}
        gistId={gistIdValue}
        syncing={syncing}
        status={syncMsg}
        lastSyncLabel={
          data.lastSyncAt
            ? `마지막 동기화: ${new Date(data.lastSyncAt).toLocaleString('ko-KR')}`
            : ''
        }
        onToken={setToken}
        onGistId={setGistId}
        onSync={() => void doSync()}
      />

      <DataPanel
        fileRef={fileRef}
        backupStatus={msg}
        resetStatus={resetMsg}
        onExport={() => void doExport()}
        onImport={(f) => void doImport(f)}
        onReset={() => void doReset()}
        onRecalibrate={onRecalibrate}
      />

      <AboutPanel />
    </div>
  )
}
