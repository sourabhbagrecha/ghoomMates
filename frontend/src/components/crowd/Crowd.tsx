import type { CrowdLabel, StopCrowd } from '../../services/heritageService'
import { CROWD_LABELS, labelFor } from './crowdData'
import './Crowd.css'

/** "● Quiet" pill in the crowd colour */
export function CrowdChip({ label, detail, size = 'small' }: { label: CrowdLabel; detail?: string; size?: 'small' | 'large' }) {
  return (
    <span className={`crowd-chip crowd-chip--${label} crowd-chip--${size}`}>
      <span className="crowd-chip__dot" aria-hidden="true" />
      {CROWD_LABELS[label]}
      {detail && <span className="crowd-chip__detail"> · {detail}</span>}
    </span>
  )
}

/** Hour-by-hour bars across the site's opening hours, with the stop's time and the quietest hour marked */
export function CrowdBars({ crowd, selectedMinutes }: { crowd: StopCrowd; selectedMinutes: number | null }) {
  const bestHour = crowd.best ? Math.floor(crowd.best.minutes / 60) : null
  const selectedHour = selectedMinutes === null ? null : Math.floor(selectedMinutes / 60)
  return (
    <div className="crowd-bars" role="img" aria-label={`Crowd forecast for ${crowd.siteName}, hour by hour`}>
      {crowd.forecast.map((point) => {
        const hour = Math.floor(point.minutes / 60)
        const label = labelFor(point.level)
        const marker = hour === selectedHour ? 'you' : hour === bestHour ? 'best' : null
        return (
          <div key={point.minutes} className={`crowd-bars__col${marker ? ` crowd-bars__col--${marker}` : ''}`}>
            <span className="crowd-bars__track">
              <span className={`crowd-bars__bar crowd-bars__bar--${label}`} style={{ height: `${Math.max(6, point.level ?? 6)}%` }} />
            </span>
            <span className="crowd-bars__hour">{shortHour(hour)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 9a, 12p, 6p */
const shortHour = (hour: number) => `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`
