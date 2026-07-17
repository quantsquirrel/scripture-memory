import { useEffect, useRef, useState } from 'react'
import { exportAll, getAllLearning, importAll, resetAll, reviewCount } from '../lib/db'

export function Settings({ onChanged }: { onChanged: () => void }) {
  const [stats, setStats] = useState<{ reviews: number; graduated: number } | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([reviewCount(), getAllLearning()]).then(([r, l]) =>
      setStats({ reviews: r, graduated: l.filter((x) => x.step >= 3).length }),
    )
  }, [msg])

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
        <p className="muted small">
          복습 기록은 이 기기의 브라우저(IndexedDB)에만 저장됩니다. 주기적으로
          내보내기를 권장합니다.
        </p>
      </section>

      <section className="panel">
        <h2>정보</h2>
        <p className="muted small">
          본문: 성경전서 개역한글판(1961). 저작재산권 보호기간 만료(2011.12.31)로
          퍼블릭 도메인이며, 대한성서공회 온라인 본문에서 추출·검증했습니다.
          <br />
          구성: 네비게이토 암송 과정 313구절 — 그리스도인의 확신(5확신) 5구절 →
          그리스도인의 생활지침(8동행) 8구절 → 주제별 성경암송 60구절 → 제자의
          도(DEP) 240구절(관례상 &quot;DEP 242&quot;로 불림).
          <br />
          스케줄링: FSRS (ts-fsrs, 목표 기억율 90%).
          <br />
          낭송 규칙: 주제 → 장절 → 말씀 → 장절.
        </p>
      </section>
    </div>
  )
}
