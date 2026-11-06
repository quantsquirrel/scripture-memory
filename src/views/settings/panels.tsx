import { type RefObject, useEffect, useState } from 'react'

import type { Theme } from '../../adapters/theme'
import type { Pairing } from '../../app/pairing'
import { COLLECTIONS } from '../../data/verses'
import { type GoalInfo, goalVerseIds } from '../../domain/goal'
import { CODE_TTL_MS, formatCode, normalizeCode } from '../../domain/pairingCode'

const THEME_OPTIONS: readonly [Theme, string][] = [
  ['auto', '자동'],
  ['light', '라이트'],
  ['dark', '다크'],
]

export function ThemePanel({
  theme,
  onChoose,
}: {
  theme: Theme
  onChoose: (t: Theme) => void
}) {
  return (
    <section className="panel">
      <h2>화면 테마</h2>
      <div className="seg-row" role="group" aria-label="화면 테마">
        {THEME_OPTIONS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={theme === v}
            className={`seg${theme === v ? ' active' : ''}`}
            onClick={() => {
              onChoose(v)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        '자동'은 기기(OS)의 다크/라이트 설정을 따릅니다. 라이트나 다크를 고르면 OS 설정과
        무관하게 이 기기에서 항상 유지됩니다.
      </p>
    </section>
  )
}

/** 목표 범위 선택지 — 학습 순서상 앞 과정을 모두 포함하는 누적 범위 */
const GOAL_SCOPE_OPTIONS = COLLECTIONS.map((c) => ({
  key: c.key,
  label: `${c.short}까지 (${goalVerseIds(c.key).size}구절)`,
}))

function goalSummary(goal: GoalInfo): string {
  if (goal.past)
    return '목표일이 지났습니다. 앞으로 올 날짜를 고르면 일일 목표가 다시 켜집니다.'
  if (goal.remaining === 0) return `${goal.scopeLabel}까지 모두 외웠습니다. 범위를 넓혀 보세요.`
  return `D-${goal.daysLeft}, 남은 ${goal.remaining}/${goal.total}구절, 하루 ${goal.requiredPace.toFixed(1)}구절 필요`
}

export function GoalPanel({
  goal,
  onScope,
  onGoalDate,
  onBufferDays,
}: {
  goal: GoalInfo
  onScope: (scope: string) => void
  onGoalDate: (d: string) => void
  onBufferDays: (n: number) => void
}) {
  const { goalDate, bufferDays } = goal
  return (
    <section className="panel">
      <h2>암송 목표</h2>
      <label className="muted small" htmlFor="goal-scope">
        목표 범위
      </label>
      <select
        id="goal-scope"
        className="ref-input"
        value={goal.scope}
        onChange={(e) => {
          onScope(e.target.value)
        }}
      >
        {GOAL_SCOPE_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="muted small" htmlFor="goal-date">
        목표일
      </label>
      <input
        id="goal-date"
        className="ref-input"
        type="date"
        value={goalDate}
        onChange={(e) => {
          onGoalDate(e.target.value)
        }}
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
        onChange={(e) => {
          onBufferDays(Number(e.target.value))
        }}
      />
      <p>{goalSummary(goal)}</p>
      <p className="muted small">
        목표 범위는 학습 순서대로 앞 과정을 모두 포함합니다. 목표일은 시험·대회를 준비할 때 쓰는
        선택 도구입니다. 시험(목표일)에 암송할 수 있으려면 외운 뒤 복습으로 굳힐 시간이
        필요하므로, 새 구절 학습은 목표일 {bufferDays}일 전까지 끝내는 것으로 일일 목표를
        계산하고 남은 기간은 복습만 합니다. 목표일이 지나면 D-day 페이싱은 사라지고, FSRS가 복습
        간격을 늘려 가는 유지 모드로 돌아갑니다. 평상시에는 목표일 없이 그대로 두면 됩니다.
      </p>
    </section>
  )
}

/** 남은 초. 새 코드가 오면 첫 틱 전까지는 TTL로 눌러 둔다 (이전 시각이 남아 있어서). */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until === null) return
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [until])
  if (until === null) return 0
  return Math.ceil(Math.max(0, Math.min(CODE_TTL_MS, until - now)) / 1000)
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function PairingPanel({
  enabled,
  pairing,
  busy,
  input,
  message,
  onCreate,
  onCopy,
  onInput,
  onApply,
}: {
  enabled: boolean
  pairing: Pairing | null
  busy: 'create' | 'apply' | null
  input: string
  message: string
  onCreate: () => void
  onCopy: () => void
  onInput: (v: string) => void
  onApply: () => void
}) {
  const left = useSecondsLeft(pairing?.expiresAt ?? null)
  return (
    <section className="panel">
      <h2>간편 기기 연동 (6자리 코드)</h2>
      <p className="muted small">
        계정 없이 코드 하나로 다른 기기(맥·윈도우·아이폰·갤럭시)의 암송 기록을 가져옵니다.
      </p>
      {!enabled && (
        <p className="muted small">
          이 빌드에는 연동 서버 주소가 설정되지 않아 쓸 수 없습니다.
        </p>
      )}

      <h3>내 기기 코드 만들기</h3>
      {pairing && left > 0 && (
        <div className="pair-code-box">
          <output
            className="pair-code"
            aria-label={`연동 코드 ${pairing.code.split('').join(' ')}`}
          >
            {formatCode(pairing.code)}
          </output>
          <p className="muted small">{mmss(left)} 뒤 만료, 한 번만 쓸 수 있습니다</p>
          <button className="btn" onClick={onCopy}>
            코드 복사
          </button>
        </div>
      )}
      {pairing && left === 0 && (
        <p className="muted small">코드가 만료되었습니다. 새로 만들어 주세요.</p>
      )}
      {/* 설정 화면에는 오늘의 주 행동이 없다 — 금색 버튼(등불)을 켜지 않는다 */}
      <button
        className="btn"
        disabled={!enabled || busy !== null}
        aria-busy={busy === 'create'}
        onClick={onCreate}
      >
        {busy === 'create' ? '코드 만드는 중…' : pairing ? '새 코드 만들기' : '코드 만들기'}
      </button>

      <h3>다른 기기 코드 입력</h3>
      <label className="muted small" htmlFor="pair-input">
        다른 기기에 표시된 코드
      </label>
      <input
        id="pair-input"
        className="ref-input pair-input"
        disabled={!enabled}
        placeholder="ABC-DEF"
        maxLength={7}
        value={input}
        onChange={(e) => {
          onInput(e.target.value.toUpperCase())
        }}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        className="btn"
        disabled={!enabled || busy !== null || normalizeCode(input) === null}
        aria-busy={busy === 'apply'}
        onClick={onApply}
      >
        {busy === 'apply' ? '연동 중…' : '연동하기'}
      </button>
      {message && (
        <p className="muted small" role="status">
          {message}
        </p>
      )}
      <p className="muted small">
        코드를 입력한 기기에만 합쳐집니다. 복습 기록은 합집합, 카드·학습 상태는 더 진행된
        쪽으로, 암송 목표는 나중에 바꾼 쪽으로. 양쪽을 똑같이 맞추려면 반대 방향으로도 한 번 더
        하세요. 코드를 만든 뒤에 한 복습은 그 코드에 들어가지 않습니다.
      </p>
    </section>
  )
}

export function SyncPanel({
  token,
  gistId,
  syncing,
  message,
  onToken,
  onGistId,
  onSync,
}: {
  token: string
  gistId: string
  syncing: boolean
  message: string
  onToken: (v: string) => void
  onGistId: (v: string) => void
  onSync: () => void
}) {
  return (
    <details className="tech-details">
      <summary>고급: GitHub Gist 동기화 (개발자용)</summary>
      <label className="muted small" htmlFor="sync-token">
        GitHub 토큰 (gist 권한만)
      </label>
      <input
        id="sync-token"
        className="ref-input"
        type="password"
        placeholder="GitHub 토큰 (gist 권한만)"
        value={token}
        onChange={(e) => {
          onToken(e.target.value)
        }}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <label className="muted small" htmlFor="sync-gist">
        Gist ID
      </label>
      <input
        id="sync-gist"
        className="ref-input"
        placeholder="Gist ID"
        value={gistId}
        onChange={(e) => {
          onGistId(e.target.value)
        }}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        className="btn"
        disabled={syncing || !token.trim() || !gistId.trim()}
        onClick={onSync}
      >
        {syncing ? '동기화 중…' : '지금 동기화'}
      </button>
      {message && <p className="muted small">{message}</p>}
      <p className="muted small">
        복습 기록은 합집합으로, 카드·학습 상태는 더 진행된 쪽으로, 암송 목표는 나중에 바꾼
        쪽으로 병합됩니다. 토큰은 이 기기(IndexedDB)에만 저장됩니다. 공부 시작 전과 후에 한 번씩
        눌러 주세요.
      </p>
    </details>
  )
}

export function DataPanel({
  fileRef,
  message,
  onExport,
  onImport,
  onReset,
  onRecalibrate,
}: {
  fileRef: RefObject<HTMLInputElement | null>
  message: string
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  onRecalibrate: () => void
}) {
  return (
    <section className="panel">
      <h2>데이터 및 학습</h2>
      <button className="btn" onClick={onRecalibrate}>
        말씀 상태 개정 <span className="btn-note">(Recalibrate)</span>
      </button>
      <p className="muted small">
        오래 쉬어 카드가 밀렸을 때, 구절마다 본문을 한 번 떠올려 보고 상태를 다시 정리합니다.
      </p>
      {/* 백업 두 버튼은 전폭으로 세운다 — 반쪽 폭에서는 320px 화면에서 "내보내기 (JSON)"이 꺾였다 */}
      <h3>백업</h3>
      <button className="btn" onClick={onExport}>
        내보내기 <span className="btn-note">(JSON)</span>
      </button>
      <button
        className="btn"
        onClick={() => {
          fileRef.current?.click()
        }}
      >
        가져오기
      </button>
      {/* 되돌릴 수 없는 행동은 구분선 아래로 떼어 둔다 — 백업 버튼 옆에서 잘못 누르지 않게 */}
      <div className="danger-zone">
        <button className="btn btn-danger" onClick={onReset}>
          초기화
        </button>
        <p className="muted small">모든 학습·복습 기록을 이 기기에서 지웁니다.</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        aria-label="백업 파일 가져오기"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImport(f)
          e.target.value = ''
        }}
      />
      {message && <p className="muted small">{message}</p>}
    </section>
  )
}

export function AboutPanel() {
  return (
    <section className="ground">
      <h2>정보</h2>
      <dl className="about-list">
        <div>
          <dt>본문</dt>
          <dd>
            성경전서 개역한글판(1961). 저작재산권 보호기간 만료(2011.12.31)로 퍼블릭 도메인이며,
            대한성서공회 온라인 본문에서 추출·검증했습니다. 저작인격권은 소멸하지 않으므로
            출처를 밝히고 본문을 고치지 않습니다 — 옛 표기와 문장부호를 그대로 둡니다.
          </dd>
        </div>
        <div>
          <dt>구성</dt>
          <dd>
            네비게이토 암송 과정 495구절: 그리스도인의 확신(5확신) 5구절 → 그리스도인의
            생활지침(8동행) 8구절 → 주제별 성경암송 60구절 → 제자의 도(DEP242) 242구절 → 주제별
            성경암송 시리즈 180구절.
          </dd>
        </div>
        <div>
          <dt>스케줄링</dt>
          <dd>FSRS (ts-fsrs, 목표 기억율 90%).</dd>
        </div>
        <div>
          <dt>낭송 규칙</dt>
          <dd>주제 → 장절 → 말씀 → 장절.</dd>
        </div>
      </dl>
    </section>
  )
}
