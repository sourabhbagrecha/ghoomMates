import { CrowdChip } from '../../components/crowd/Crowd'
import type { OpsForecast } from '../../services/opsService'
import { dayLabel, formatClock, numberText, relativeDay, shortName } from './opsData'

/** The day at a glance: planned visitors, squads, the busiest slot and how many visits are already off-peak */
export function OpsKpis({ forecast }: { forecast: OpsForecast }) {
  const { kpis, meta } = forecast
  const visitors = kpis.plannedVisitors
  const squads = typeof kpis.squads === 'number' ? kpis.squads : null
  const average = visitors !== null && squads ? Math.round(visitors / squads) : null
  const offPeak = kpis.offPeakShare === null ? null : Math.round(kpis.offPeakShare * 100)
  const busiest = kpis.busiest

  return (
    <section className="ops-kpis" aria-label={`${relativeDay(forecast.date)} at a glance`}>
      <div className="ops-kpis__head">
        <div>
          <p className="ops-kpis__rel">{relativeDay(forecast.date)}</p>
          <p className="ops-kpis__day">
            {dayLabel(forecast.date)}
            {forecast.dayNote ? ` · ${forecast.dayNote}` : ''}
          </p>
        </div>
        <span className="ops-kpis__source">
          <span className="ops-kpis__dot" aria-hidden="true" />
          {meta.sample ? 'Live plans + sample squads' : meta.live ? 'Live plans' : 'Modelled day'}
        </span>
      </div>

      <dl className="ops-kpis__grid">
        <div className="ops-kpi">
          <dt>Planned visitors</dt>
          <dd>{visitors === null ? '—' : numberText(visitors)}</dd>
          <p>{visitors === null ? 'Fewer than 3 squads so far' : 'heading to heritage sites'}</p>
        </div>
        <div className="ops-kpi">
          <dt>Squads planning</dt>
          <dd>{kpis.squads}</dd>
          <p>{average ? `about ${average} people each` : 'groups of friends and families'}</p>
        </div>
        <div className="ops-kpi ops-kpi--busiest">
          <dt>Busiest slot</dt>
          {busiest ? (
            <>
              <dd className="ops-kpi__name">{shortName({ id: busiest.siteId, name: busiest.siteName })}</dd>
              <p className="ops-kpi__chip">
                {formatClock(busiest.minutes)}
                <CrowdChip label={busiest.label} detail={`${busiest.level}/100`} />
              </p>
            </>
          ) : (
            <dd>—</dd>
          )}
        </div>
        <div className="ops-kpi">
          <dt>Off-peak squads</dt>
          <dd>{offPeak === null ? '—' : `${offPeak}%`}</dd>
          {offPeak !== null && (
            <span
              className="ops-kpi__bar"
              role="progressbar"
              aria-label="Share of planned visits that are off-peak"
              aria-valuenow={offPeak}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${offPeak}%` }} />
            </span>
          )}
          <p>{offPeak === null ? 'Nothing planned yet' : 'already on calm slots'}</p>
        </div>
      </dl>
    </section>
  )
}
