import type { ReactNode } from 'react'
import { iconUrl } from '../../assets/icons'
import type { ImpactReport } from '../../services/impactService'
import { fmtHours, fmtKg, fmtRupees } from './impactData'
import './KpiTiles.css'

type Kpi = { icon: string; value: string; unit?: string; label: string; note: ReactNode }

/** The three numbers the Itinerary card and the Impact page both lead with */
function kpisOf(report: ImpactReport): Kpi[] {
  const { footprint, crowdSmart, local, city } = report
  const measured = city !== null && footprint.days.some((d) => d.legs.length > 0)
  return [
    {
      icon: 'leaf',
      value: measured ? fmtKg(footprint.perPersonKg) : '–',
      unit: measured ? 'kg' : undefined,
      label: 'CO₂e per person',
      note: measured ? (
        footprint.savedPct > 0 ? (
          <>
            <strong>−{footprint.savedPct}%</strong> vs solo cabs
          </>
        ) : (
          'getting around'
        )
      ) : city === null ? (
        'Udaipur trips for now'
      ) : (
        'add stops with places'
      ),
    },
    {
      icon: 'hourglass',
      value: crowdSmart.heritageStops > 0 ? fmtHours(crowdSmart.crowdHoursAvoided) : '–',
      unit: crowdSmart.heritageStops > 0 ? 'h' : undefined,
      label: 'crowd-hours avoided',
      note:
        crowdSmart.heritageStops > 0 ? (
          <>
            <strong>{crowdSmart.quietVisits}</strong> quiet {crowdSmart.quietVisits === 1 ? 'visit' : 'visits'}
          </>
        ) : (
          'time heritage visits'
        ),
    },
    {
      icon: 'hand-coins',
      value: local.expenseCount > 0 ? fmtRupees(local.keptPaise) : '–',
      label: 'kept local',
      note:
        local.expenseCount > 0 ? (
          <>
            <strong>{local.sharePct}%</strong> of spend
          </>
        ) : (
          'log what you spend'
        ),
    },
  ]
}

/** Footprint per person, crowd-hours avoided, ₹ kept local: three tiles in a row */
export function KpiTiles({ report }: { report: ImpactReport }) {
  return (
    <div className="kpi-tiles">
      {kpisOf(report).map((kpi) => (
        <div key={kpi.label} className="kpi-tile">
          <span className="kpi-tile__icon">
            <img src={iconUrl(kpi.icon, 'primary')} alt="" width={16} height={16} />
          </span>
          <p className="kpi-tile__value">
            {kpi.value}
            {kpi.unit && <span className="kpi-tile__unit"> {kpi.unit}</span>}
          </p>
          <p className="kpi-tile__label">{kpi.label}</p>
          <p className="kpi-tile__note">{kpi.note}</p>
        </div>
      ))}
    </div>
  )
}
