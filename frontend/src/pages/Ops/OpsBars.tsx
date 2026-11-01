import { CROWD_LABELS } from '../../components/crowd/crowdData'
import type { OpsSite } from '../../services/opsService'
import { shortHour } from './opsData'

type OpsBarsProps = {
  site: OpsSite
  selectedHour: number
  onSelect: (hour: number) => void
}

/**
 * Hour by hour for one site: the modelled crowd (soft blue) beside the crowd once the squads' plans are added (crowd
 * colour). Tap an hour to read its numbers. Closed hours at either end of the day are left out.
 */
export function OpsBars({ site, selectedHour, onSelect }: OpsBarsProps) {
  const first = site.hours.findIndex((c) => c.level !== null)
  const last = site.hours.findLastIndex((c) => c.level !== null)
  const cells = first === -1 ? [] : site.hours.slice(first, last + 1)

  return (
    <div className="ops-bars" role="group" aria-label={`Hour by hour at ${site.name}: modelled crowd and crowd with planned squads`}>
      {cells.map((cell) => {
        const closed = cell.level === null
        return (
          <button
            key={cell.hour}
            type="button"
            className={`ops-bars__col${cell.hour === selectedHour ? ' ops-bars__col--selected' : ''}`}
            aria-pressed={cell.hour === selectedHour}
            disabled={closed}
            aria-label={
              closed
                ? `${cell.time}: closed`
                : `${cell.time}: modelled ${cell.baseline}, with squads ${cell.level} (${CROWD_LABELS[cell.label].toLowerCase()})`
            }
            onClick={() => onSelect(cell.hour)}
          >
            <span className="ops-bars__track">
              <span className="ops-bars__base" style={{ height: `${cell.baseline ?? 0}%` }} />
              <span
                className={`ops-bars__with ops-bars__with--${cell.label}`}
                style={{ height: `${closed ? 0 : Math.max(4, cell.level ?? 0)}%` }}
              />
            </span>
            <span className="ops-bars__hour">{shortHour(cell.hour)}</span>
          </button>
        )
      })}
    </div>
  )
}
