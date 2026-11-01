import { useState, type CSSProperties } from 'react'
import { iconUrl } from '../../assets/icons'
import { EmptyState } from '../../components/states/EmptyState'
import { tripDayLabel } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import type { ImpactReport, Leg, Mode } from '../../services/impactService'
import { MODE_INFO, fmtDistance, fmtKg, modeIcon } from './impactData'
import { impactStore } from './useImpact'

type Props = { report: ImpactReport; tripId: string; startDate: string | null }

/** The rides of the plan: our footprint against everyone in their own cab, then every leg with a mode switcher */
export function FootprintSection({ report, tripId, startDate }: Props) {
  const navigate = useNavigate()
  const fp = report.footprint
  const days = fp.days.filter((d) => d.legs.length > 0)
  const [picked, setPicked] = useState<number | null>(null)
  const day = days.find((d) => d.number === picked) ?? days[0]

  if (!day) {
    return (
      <EmptyState
        headingLevel={2}
        size="compact"
        title={report.city ? 'No rides to count yet' : 'Footprints start with Udaipur'}
        text={
          report.city
            ? 'Add stops with a place, like “Jagdish Temple” or “Lal Ghat”, and GhoomMate counts the rides in between.'
            : 'Rides and crowd-hours need a map of the place, and Udaipur’s is ready. Pledges and local spend already count here.'
        }
        action={report.city ? { label: 'Add a stop', onClick: () => navigate('trip/itinerary/add') } : undefined}
      />
    )
  }

  const planWidth = fp.baselineKg > 0 ? Math.max(3, Math.min(100, (fp.totalKg / fp.baselineKg) * 100)) : 0
  const located = `${fp.located.stops} of ${fp.located.total} stops placed on the map`

  return (
    <section className="card footprint">
      <div className="impact-head">
        <span className="impact-head__icon">
          <img src={iconUrl('footprints', 'primary')} alt="" width={20} height={20} />
        </span>
        <div className="impact-head__text">
          <h2 className="impact-head__title">Getting around</h2>
          <p className="impact-head__sub">
            {fp.squadSize} {fp.squadSize === 1 ? 'mate' : 'mates'} · {fp.distanceKm} km in all
          </p>
        </div>
      </div>

      <div className="compare" aria-label="Our plan against everyone taking their own cab">
        <div className="compare__row">
          <span className="compare__label">Our plan</span>
          <span className="compare__track">
            <span className="compare__fill compare__fill--plan" style={{ width: `${planWidth}%` }} />
          </span>
          <span className="compare__value">{fmtKg(fp.totalKg)} kg</span>
        </div>
        <div className="compare__row">
          <span className="compare__label">Solo cabs</span>
          <span className="compare__track">
            <span className="compare__fill compare__fill--solo" style={{ width: '100%' }} />
          </span>
          <span className="compare__value">{fmtKg(fp.baselineKg)} kg</span>
        </div>
      </div>
      <p className="impact-callout">
        {fp.savedPct > 0 ? (
          <>
            <strong>−{fp.savedPct}%</strong> · {fmtKg(fp.savedKg)} kg less, about {Math.round(fp.cabKmSaved)} km of solo cab rides
          </>
        ) : (
          'Every ride is a cab for now. Try an e-rickshaw or a walk below.'
        )}
      </p>

      <div className="day-tabs no-scrollbar" role="group" aria-label="Pick a day">
        {days.map((d) => (
          <button
            key={d.number}
            type="button"
            className={`day-tabs__day${d.number === day.number ? ' day-tabs__day--on' : ''}`}
            aria-pressed={d.number === day.number}
            onClick={() => setPicked(d.number)}
          >
            D{d.number}
          </button>
        ))}
      </div>
      <div className="day-line">
        <p className="day-line__title">
          {startDate ? `Day ${day.number} · ${tripDayLabel(startDate, day.number)}` : `Day ${day.number}`}
        </p>
        <p className="day-line__kg">{fmtKg(day.kg)} kg</p>
      </div>
      {day.title && <p className="day-line__sub">{day.title}</p>}

      <ol className="legs">
        {day.legs.map((leg, i) => (
          <LegCard key={`${leg.fromStopId}:${leg.toStopId}`} leg={leg} n={i + 1} tripId={tripId} />
        ))}
      </ol>

      <p className="impact-foot">
        {located}. {fp.source === 'routes' ? 'Distances from Google Maps.' : fp.source === 'mixed' ? 'Some distances from Google Maps, the rest estimated.' : 'Distances are straight-line estimates plus a road factor.'}
      </p>
    </section>
  )
}

const PICKER_MODES: Mode[] = ['walk', 'erickshaw', 'auto', 'cab']

function LegCard({ leg, n, tripId }: { leg: Leg; n: number; tripId: string }) {
  const here = leg.options[leg.mode]
  const modes = leg.lake ? [...PICKER_MODES, 'boat' as Mode] : PICKER_MODES
  const label = `${leg.from.name} to ${leg.to.name}`
  return (
    <li className="leg">
      <div className="leg__head">
        <span className="leg__index" aria-hidden="true">
          {n}
        </span>
        <div className="leg__text">
          <h3 className="leg__title">
            {leg.from.name} → {leg.to.name}
          </h3>
          <p className="leg__meta">
            {fmtDistance(here.km)} · {here.minutes} min {MODE_INFO[leg.mode].verb}
            {leg.chosen ? (
              <button type="button" className="leg__reset" onClick={() => void impactStore.setLegMode(tripId, leg, null)}>
                Your pick · Reset
              </button>
            ) : null}
          </p>
        </div>
        <p className={`leg__kg${leg.kg === 0 ? ' leg__kg--zero' : ''}`} aria-label={`${fmtKg(leg.kg)} kilograms of CO2e`}>
          {fmtKg(leg.kg)}
          <span> kg</span>
        </p>
      </div>
      <div className="modes" role="radiogroup" aria-label={`How the squad goes ${label}`} style={{ '--modes': modes.length } as CSSProperties}>
        {modes.map((mode) => {
          const option = leg.options[mode]
          const on = mode === leg.mode
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!option.allowed}
              title={option.allowed ? `${MODE_INFO[mode].label}: ${option.minutes} min, ${fmtKg(option.kg)} kg for the squad` : `${MODE_INFO[mode].label} doesn’t suit this ride`}
              className={`mode${on ? ' mode--on' : ''}`}
              onClick={() => (on ? undefined : void impactStore.setLegMode(tripId, leg, mode))}
            >
              <img src={modeIcon(mode, on ? 'white' : 'primary')} alt="" width={16} height={16} />
              <span className="mode__name">{MODE_INFO[mode].short}</span>
              <span className="mode__kg">{option.allowed ? `${fmtKg(option.kg)} kg` : '–'}</span>
            </button>
          )
        })}
      </div>
    </li>
  )
}
