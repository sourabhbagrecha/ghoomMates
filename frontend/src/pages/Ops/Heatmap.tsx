import { useLayoutEffect, useRef } from 'react'
import { CROWD_LABELS } from '../../components/crowd/crowdData'
import type { OpsCell, OpsForecast, OpsSite } from '../../services/opsService'
import { LEVEL_RANK, shortHour, shortName, type HeatMode } from './opsData'
import './Heatmap.css'

/** Width of one hour column, to scroll the busiest hour into view */
const COLUMN = 35

type HeatmapProps = {
  forecast: OpsForecast
  mode: HeatMode
  /** The hour it is now in India when looking at today; earlier hours are dimmed */
  nowHour: number | null
  /** The cell whose sheet is open */
  selected: { siteId: string; hour: number } | null
  onPick: (siteId: string, hour: number) => void
}

/**
 * Sites × hours, coloured with the app's crowd scale. It scrolls sideways inside the card with the site names pinned,
 * and the top row shows how many squads start a stop across the city each hour.
 */
export function Heatmap({ forecast, mode, nowHour, selected, onPick }: HeatmapProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const scrolledTo = useRef<string | null>(null)
  const squads = (n: OpsForecast['byHour'][number]['squads']) => (typeof n === 'number' ? n : 0)
  const busiestSquads = Math.max(1, ...forecast.byHour.map((h) => squads(h.squads)))
  const key = `${forecast.date}:${forecast.meta.sample}`

  // Open on the busy part of the day, once per day shown
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || scrolledTo.current === key) return
    scrolledTo.current = key
    const focus = forecast.kpis.busiest?.hour ?? 10
    const first = forecast.hours[0]
    el.scrollLeft = Math.max(0, (focus - first - 2) * COLUMN)
  }, [key, forecast])

  return (
    <div className="ops-heat no-scrollbar" ref={scroller}>
      <table className="ops-heat__table">
        <caption className="ops-heat__caption">
          Crowd level from 0 to 100 for each heritage site and hour. Scroll sideways for the rest of the day.
        </caption>
        <thead>
          <tr>
            <th className="ops-heat__corner" scope="col">
              Site
            </th>
            {forecast.hours.map((hour) => (
              <th key={hour} scope="col" className="ops-heat__hour" aria-label={`${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}${hour === nowHour ? ', now' : ''}`}>
                <span className={`ops-heat__hour-label${hour === nowHour ? ' ops-heat__hour-label--now' : ''}`}>{shortHour(hour)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="ops-heat__demand">
            <th scope="row" className="ops-heat__site">
              <span className="ops-heat__demand-label">Squads arriving</span>
            </th>
            {forecast.byHour.map((h) => (
              <td key={h.hour} className={isPast(h.hour, nowHour) ? 'ops-heat__past' : undefined}>
                <span className="ops-heat__demand-cell" role="img" aria-label={`${h.squads} squads start a stop at ${shortHour(h.hour)}`}>
                  <span className="ops-heat__demand-bar" style={{ height: `${Math.max(squads(h.squads) > 0 ? 12 : 0, (squads(h.squads) / busiestSquads) * 100)}%` }} />
                </span>
              </td>
            ))}
          </tr>
          {forecast.sites.map((site) => (
            <tr key={site.id}>
              <th scope="row" className="ops-heat__site">
                <button type="button" className="ops-heat__site-button" onClick={() => onPick(site.id, (site.peak ?? site.best)?.hour ?? forecast.hours[0])}>
                  {shortName(site)}
                </button>
              </th>
              {site.hours.map((cell) => (
                <td key={cell.hour} className={isPast(cell.hour, nowHour) ? 'ops-heat__past' : undefined}>
                  <HeatCell
                    site={site}
                    cell={cell}
                    mode={mode}
                    selected={selected?.siteId === site.id && selected.hour === cell.hour}
                    onPick={onPick}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const isPast = (hour: number, nowHour: number | null) => nowHour !== null && hour < nowHour

type HeatCellProps = {
  site: OpsSite
  cell: OpsCell
  mode: HeatMode
  selected: boolean
  onPick: (siteId: string, hour: number) => void
}

function HeatCell({ site, cell, mode, selected, onPick }: HeatCellProps) {
  const withSquads = mode === 'squads'
  const level = withSquads ? cell.level : cell.baseline
  const label = withSquads ? cell.label : cell.baselineLabel
  // The squads' plans push this slot into a worse band than the modelled day
  const tipped = withSquads && LEVEL_RANK[cell.label] > LEVEL_RANK[cell.baselineLabel]
  const closed = level === null
  const text = closed
    ? `${site.name}, ${cell.time}: closed`
    : `${site.name}, ${cell.time}: ${CROWD_LABELS[label].toLowerCase()}, ${level} out of 100${
        withSquads && cell.squads !== 0 ? `, ${cell.squads} squads arriving` : ''
      }${tipped ? `, squads push it up from ${CROWD_LABELS[cell.baselineLabel].toLowerCase()}` : ''}`

  return (
    <button
      type="button"
      className={`ops-heat__cell ops-heat__cell--${label}${tipped ? ' ops-heat__cell--tipped' : ''}${selected ? ' ops-heat__cell--selected' : ''}`}
      aria-label={text}
      disabled={closed}
      onClick={() => onPick(site.id, cell.hour)}
    >
      {closed ? '' : level}
    </button>
  )
}
