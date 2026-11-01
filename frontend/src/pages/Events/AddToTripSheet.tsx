import { useEffect, useMemo, useRef, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import { Button, LinkButton } from '../../components/Button'
import { CrowdChip } from '../../components/crowd/Crowd'
import { activeTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { eventsApi, type AddedEventStop, type AnyEvent } from '../../services/eventsService'
import type { ItineraryDay, TripDetail } from '../../services/tripsService'
import { daysWithStop, pickableDays, startingDay } from './eventsLogic'
import './EventSheet.css'

type AddToTripSheetProps = {
  event: AnyEvent
  trip: TripDetail
  days: ItineraryDay[] | null
  onClose: () => void
}

/** A bottom sheet to put an event on a day of the squad's plan, with the crowd model's heads-up once it's there. */
export function AddToTripSheet({ event, trip, days, onClose }: AddToTripSheetProps) {
  const navigate = useNavigate()
  const panel = useRef<HTMLDivElement>(null)
  const stop = event.stop!

  const options = useMemo(() => {
    const added = new Set(daysWithStop(days, stop.title))
    const flexibleDays = Number((trip.details as { flexibleDays?: unknown }).flexibleDays) || undefined
    return pickableDays(event, { startDate: trip.startDate, endDate: trip.endDate, flexibleDays }).map((d) =>
      added.has(d.dayNumber) ? { ...d, enabled: false, note: 'Added' } : d,
    )
  }, [event, trip, days, stop.title])

  const [dayNumber, setDayNumber] = useState<number | null>(() => startingDay(event, options)?.dayNumber ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<AddedEventStop | null>(null)
  const day = options.find((d) => d.dayNumber === dayNumber)

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const confirm = async () => {
    if (!day) return
    setSubmitting(true)
    setError(null)
    try {
      const added = await eventsApi.addToTrip(event.id, {
        tripId: trip.id,
        date: day.date,
        dayNumber: day.date ? undefined : day.dayNumber,
      })
      await activeTrip.loadItinerary()
      setDone(added)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it to the plan')
      setSubmitting(false)
    }
  }

  const go = (route: string) => {
    onClose()
    navigate(route)
  }

  const crowd = done?.crowd
  const warn = crowd?.label === 'busy' || crowd?.label === 'packed'

  return (
    <div className="event-sheet">
      <button type="button" className="event-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div ref={panel} className="event-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="add-event-title" tabIndex={-1}>
        <span className="event-sheet__handle" aria-hidden="true" />

        {done ? (
          <>
            <div className="event-sheet__done" role="status">
              <span className="event-sheet__done-check">
                <img src={iconCheck} alt="" width={22} height={22} />
              </span>
              <h2 id="add-event-title" className="event-sheet__done-title">
                Added to Day {done.stop.dayNumber}
              </h2>
              <p className="event-sheet__done-text">
                {done.stop.title} · {done.stop.time}. The whole squad can RSVP from the itinerary.
              </p>
              {crowd?.label && (
                <>
                  <CrowdChip label={crowd.label} size="large" />
                  <p className="event-sheet__done-text">
                    {warn
                      ? `${crowd.siteName} is ${crowd.label} then. ${crowd.dayNote ? `${crowd.dayNote}. ` : ''}Check the crowd map for a quieter hour or place.`
                      : `${crowd.siteName} looks comfortable at that time.`}
                  </p>
                </>
              )}
            </div>
            <div className="event-sheet__actions">
              <Button variant="primary" onClick={() => go('trip/itinerary')}>
                See it in the itinerary
              </Button>
              <LinkButton onClick={() => go('trip/explore')}>Check the crowd map</LinkButton>
            </div>
          </>
        ) : (
          <>
            <header className="event-sheet__header">
              <h2 id="add-event-title" className="event-sheet__title">
                Add to our itinerary
              </h2>
              <p className="event-sheet__sub">The whole squad sees it and can RSVP.</p>
            </header>

            <div className="event-sheet__summary">
              <div className="event-sheet__summary-text">
                <p className="event-sheet__summary-title">{stop.title}</p>
                <p className="event-sheet__summary-meta">
                  <img src={iconClock} alt="" width={12} height={12} /> {stop.time} · {stop.place}
                </p>
              </div>
            </div>

            <div className="event-sheet__group">
              <p className="event-sheet__label">Which day?</p>
              <div className="event-sheet__chips no-scrollbar">
                {options.map((d) => (
                  <button
                    key={d.dayNumber}
                    type="button"
                    className={`day-chip${d.dayNumber === dayNumber ? ' day-chip--selected' : ''}`}
                    aria-pressed={d.dayNumber === dayNumber}
                    disabled={!d.enabled}
                    onClick={() => setDayNumber(d.dayNumber)}
                  >
                    <span className="day-chip__text">{d.label}</span>
                    {d.note && <span className="day-chip__sub">{d.note}</span>}
                  </button>
                ))}
              </div>
              {!day && <p className="event-sheet__hint">None of your trip days work for this one. Try another event, or change your dates.</p>}
              {!trip.startDate && <p className="event-sheet__hint">Your trip has no dates yet, so pick a day of the plan.</p>}
              {!('key' in event) && 'datesNote' in event && <p className="event-sheet__hint">{event.datesNote}</p>}
            </div>

            {error && (
              <p className="event-sheet__error" role="alert">
                {error}
              </p>
            )}

            <div className="event-sheet__actions">
              <Button variant="primary" disabled={!day || submitting} onClick={() => void confirm()}>
                {submitting ? 'Adding…' : day ? `Add to Day ${day.dayNumber} · ${stop.time}` : 'Pick a day'}
              </Button>
              <LinkButton onClick={onClose}>Not now</LinkButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
