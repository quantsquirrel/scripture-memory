import type { DueForecast } from '../lib/stats'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/** 향후 due 부하 미니 막대 차트 — counts[0]=내일 */
export function ForecastBars({
  forecast,
  now = new Date(),
}: {
  forecast: DueForecast
  now?: Date
}) {
  const max = Math.max(...forecast.counts, 1)
  return (
    <div className="mini-bars">
      {forecast.counts.map((c, i) => {
        const d = new Date(now)
        d.setDate(d.getDate() + i + 1)
        const label = i === 0 ? '내일' : DAY_NAMES[d.getDay()]
        return (
          <div
            key={i}
            className="mini-bar-col"
            title={`${d.getMonth() + 1}/${d.getDate()} · ${c}장`}
          >
            <span className="mini-bar-val">{c > 0 ? c : ''}</span>
            <div className="mini-bar-area">
              <div
                className={c > 0 ? 'mini-bar' : 'mini-bar mini-bar-zero'}
                style={{ height: c > 0 ? `${Math.max((c / max) * 100, 5)}%` : '2px' }}
              />
            </div>
            <span className="mini-bar-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 목표 눈금(선택)이 있는 진행 바 */
export function BulletBar({ rate, target }: { rate: number; target?: number }) {
  return (
    <div className="progress bullet">
      <div className="progress-fill" style={{ width: `${Math.min(rate, 1) * 100}%` }} />
      {target !== undefined && (
        <div className="bullet-target" style={{ left: `${target * 100}%` }} />
      )}
    </div>
  )
}
