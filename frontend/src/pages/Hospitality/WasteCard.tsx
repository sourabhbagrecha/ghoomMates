import { useState } from 'react'
import iconRecycle from '../../assets/icons/icon-recycle-primary.svg'
import { Button } from '../../components/Button'
import { Skeleton } from '../../components/states/Skeleton'
import { hospitalityApi, type WasteTrend } from '../../services/hospitalityService'
import { Stepper } from './HospitalityParts'

const PLOT_HEIGHT = 64

type WasteCardProps = {
  hostId: string
  /** The last seven days, or null while loading */
  trend: WasteTrend | null
  onLogged: (trend: WasteTrend) => void
}

/** Log today's leftovers in kilos and watch the week: solid bars are what the kitchen logged, light ones are estimates. */
export function WasteCard({ hostId, trend, onLogged }: WasteCardProps) {
  const current = trend && trend.hostId === hostId ? trend : null
  const today = current?.days[current.days.length - 1]
  // The stepper starts from today's figure: the logged one, or the estimate rounded to half a kilo
  const [custom, setCustom] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const kg = custom ?? (today ? Math.round(today.leftoverKg * 2) / 2 : 3)
  const most = Math.max(1, ...(current?.days.map((d) => d.leftoverKg) ?? []))

  const log = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await hospitalityApi.logWaste(hostId, { leftoverKg: kg })
      onLogged(result)
      setCustom(null)
      setMessage(`Logged ${kg} kg of leftovers for today.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not log that')
    } finally {
      setBusy(false)
    }
  }

  const summary = current?.summary
  return (
    <section className="card waste" aria-label="Leftover log">
      <div className="waste__head">
        <span className="menu-card__icon">
          <img src={iconRecycle} alt="" width={20} height={20} />
        </span>
        <div>
          <h2 className="menu-card__title">Leftovers log</h2>
          <p className="menu-card__sub">Weigh what is left after service. Your own numbers sharpen the Green Host score.</p>
        </div>
      </div>

      <div className="waste__row">
        <p className="menu-card__row-text">
          <strong>Today’s leftovers</strong>
          <span>{today ? `For about ${today.covers} covers` : 'Weigh it after the last service'}</span>
        </p>
        <Stepper value={kg} min={0} max={100} step={0.5} label="kilos of leftovers" format={(v) => `${v} kg`} onChange={setCustom} />
      </div>
      <Button variant="primary" disabled={busy} onClick={log}>
        {busy ? 'Saving…' : `Log ${kg} kg for today`}
      </Button>
      {message && (
        <p className="waste__message" role="status">
          {message}
        </p>
      )}

      {current ? (
        <>
          <div className="waste__chart" role="img" aria-label={`Leftovers over the last ${current.days.length} days, in kilos`}>
            {current.days.map((d) => (
              <div key={d.date} className="waste__col">
                <span className="waste__kg">{d.leftoverKg}</span>
                <span className="waste__plot">
                  <span className={`waste__bar waste__bar--${d.source}`} style={{ height: `${Math.max(4, Math.round((d.leftoverKg / most) * PLOT_HEIGHT))}px` }} />
                </span>
                <span className="waste__day">{d.label.split(',')[0]}</span>
              </div>
            ))}
          </div>
          <p className="waste__legend">
            <span className="waste__key waste__key--logged">Logged</span>
            <span className="waste__key waste__key--estimate">Estimate</span>
          </p>
          <p className="waste__summary">
            {summary && summary.loggedDays > 0 && summary.avgPerCoverKg !== null ? (
              <>
                <strong>{summary.avgPerCoverKg} kg per cover</strong> over {summary.loggedDays} logged {summary.loggedDays === 1 ? 'day' : 'days'}, against about{' '}
                {summary.buffetPerCoverKg} kg at an open buffet
                {summary.savedVsBufferKg > 0 && <>: roughly {summary.savedVsBufferKg} kg less food wasted</>}.
              </>
            ) : (
              <>No logs yet. The light bars are estimates from {summary?.reportedPerCoverKg} kg a cover; log a few days to replace them with your own.</>
            )}
          </p>
        </>
      ) : (
        <div aria-busy="true" aria-label="Loading the leftover trend">
          <Skeleton variant="card" height={96} />
        </div>
      )}
    </section>
  )
}
