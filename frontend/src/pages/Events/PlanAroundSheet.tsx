import { useEffect, useRef } from 'react'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconSwap from '../../assets/figma/icon-swap-primary.svg'
import { Button, LinkButton } from '../../components/Button'
import { CrowdBars, CrowdChip } from '../../components/crowd/Crowd'
import type { AnyEvent, EventCrowd, SiteCrowd } from '../../services/eventsService'
import type { StopCrowd } from '../../services/heritageService'
import { formatDay } from '../../data/tripDates'
import { isInstance, whenLabel } from './eventsLogic'
import './EventSheet.css'

type PlanAroundSheetProps = {
  event: AnyEvent & { crowd: EventCrowd }
  /** Opens the add-to-itinerary sheet; omitted when the event can't be added */
  onAdd?: () => void
  onClose: () => void
}

/** The festival-day curve for one site in the shape CrowdBars draws */
function barsFor(site: SiteCrowd): StopCrowd {
  return {
    siteId: site.siteId, siteName: site.siteName, kind: site.kind, gem: site.gem,
    level: site.peak.level, label: site.peak.label, waitMinutes: 0,
    best: site.quieterTime ? { time: site.quieterTime.time, minutes: site.quieterTime.minutes, level: site.quieterTime.level } : null,
    forecast: site.forecast.map((p) => ({ time: p.time, minutes: p.minutes, level: p.level })),
    dayNote: null, story: '', care: '', suggestion: null,
  }
}

/** How many sites the sheet lists before it stops */
const MAX_SITES = 4

/**
 * “Plan around it”: where and when the event bites, from the same crowd model as the heritage map, and the quieter hour,
 * the quieter place and the calm spots that stay open, so the squad can still enjoy the day.
 */
export function PlanAroundSheet({ event, onAdd, onClose }: PlanAroundSheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  const { crowd } = event
  const sites = crowd.sites.slice(0, MAX_SITES)
  const top = sites[0]
  const when = isInstance(event) ? whenLabel(event.from, event.to) : 'Every evening'

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="event-sheet">
      <button type="button" className="event-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div ref={panel} className="event-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="plan-event-title" tabIndex={-1}>
        <span className="event-sheet__handle" aria-hidden="true" />
        <header className="event-sheet__header">
          <h2 id="plan-event-title" className="event-sheet__title">
            Plan around {event.name}
          </h2>
          <p className="event-sheet__sub">
            {when} · {crowd.headline}
          </p>
        </header>

        {!top ? (
          <p className="event-sheet__hint">
            This one happens outside Udaipur’s old city, so there is no crowd map to read. Leave early, go together in one vehicle and agree where to meet.
          </p>
        ) : (
          <>
            <section className="plan-chart" aria-label={`Hour by hour at ${top.siteName}`}>
              <h3 className="plan-chart__title">{top.siteName}, hour by hour</h3>
              <CrowdBars crowd={barsFor(top)} selectedMinutes={top.peak.minutes} />
              <p className="plan-chart__caption">
                On {formatDay(top.date)}.{' '}
                {top.usual.level !== null && top.usual.label !== top.peak.label
                  ? `Without the festival this hour would read ${top.usual.label}.`
                  : 'Outlined hour is the busiest; the green label is the calmest alternative.'}
              </p>
            </section>

            {sites.map((site) => (
              <section key={site.siteId} className="plan-site">
                <div className="plan-site__head">
                  <div>
                    <h3 className="plan-site__name">{site.siteName}</h3>
                    <p className="plan-site__when">
                      {site.windowLabel}
                      {site.date !== top.date ? ` · ${formatDay(site.date)}` : ''}
                    </p>
                  </div>
                  <CrowdChip label={site.peak.label} size="large" />
                </div>
                <p className="plan-site__when">{site.note}</p>
                {site.quieterTime || site.quieterSite ? (
                  <ul className="plan-site__options" aria-label={`Quieter options at ${site.siteName}`}>
                    {site.quieterTime && (
                      <li className="plan-option">
                        <img src={iconClock} alt="" width={14} height={14} />
                        <span>
                          <strong>Go at {site.quieterTime.time} instead.</strong> {site.quieterTime.reason}, and it is {site.quieterTime.label} then.
                        </span>
                      </li>
                    )}
                    {site.quieterSite && (
                      <li className="plan-option">
                        <img src={iconSwap} alt="" width={14} height={14} />
                        <span>
                          <strong>Or try {site.quieterSite.name}.</strong> It has the same feel and is {site.quieterSite.label} at {site.peak.time}.
                        </span>
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="plan-site__when">No quieter hour on the same day: go early, or pick a calm place below.</p>
                )}
              </section>
            ))}

            {crowd.calm.length > 0 && (
              <div className="event-sheet__group">
                <p className="event-sheet__label">Calm elsewhere around {top.peak.time}</p>
                <ul className="plan-calm">
                  {crowd.calm.map((c) => (
                    <li key={c.id}>
                      <span className="plan-calm__name">
                        {c.name}
                        <span> · {c.km} km</span>
                      </span>
                      <CrowdChip label={c.label} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="event-sheet__actions">
          {onAdd ? (
            <>
              <Button variant="primary" onClick={onAdd}>
                Add to our itinerary
              </Button>
              <LinkButton onClick={onClose}>Got it</LinkButton>
            </>
          ) : (
            <Button variant="primary" onClick={onClose}>
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
