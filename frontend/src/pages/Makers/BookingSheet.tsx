import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip } from '../../data/activeTrip'
import { makersApi, tripBookings, type Booking, type DayAvailability, type MakerDetail } from '../../services/makersService'
import type { ItineraryDay, TripDetail } from '../../services/tripsService'
import { formatINR } from '../Trip/tripFormat'
import { bookableDays, durationLabel, firstName, groupLabel, offReason, type PickableDay } from './makersData'
import './BookingSheet.css'

type BookingSheetProps = {
  maker: MakerDetail
  trip: TripDetail
  days: ItineraryDay[] | null
  /** The day of the trip to start on, when the squad is near this maker that day */
  preferredDay?: number
  onClose: () => void
  onBooked: (booking: Booking) => void
}

/** A bottom sheet to book the workshop for the whole squad: pick a day and a time, set the headcount, confirm. */
export function BookingSheet({ maker, trip, days, preferredDay, onClose, onBooked }: BookingSheetProps) {
  const { workshop } = maker
  const options = useMemo(() => bookableDays(trip, days), [trip, days])
  const squad = trip.members.length
  const panel = useRef<HTMLDivElement>(null)

  const isOpen = (d: PickableDay) => offReason(d, workshop, maker.closedDates) === null
  const start = options.find((d) => d.dayNumber === preferredDay && isOpen(d)) ?? options.find(isOpen)
  const [date, setDate] = useState(start?.date ?? '')
  const [availability, setAvailability] = useState<DayAvailability | null>(null)
  const [slotsFailed, setSlotsFailed] = useState(false)
  const [slot, setSlot] = useState<string | null>(null)
  const [people, setPeople] = useState(Math.min(Math.max(squad, workshop.minPeople), workshop.maxPeople))
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped to load a day's slots again, e.g. after someone else took the places
  const [reload, setReload] = useState(0)

  const day = options.find((d) => d.date === date)

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!date) return
    let stale = false
    makersApi
      .slots(maker.id, date)
      .then((result) => {
        if (stale) return
        setAvailability(result)
        setSlotsFailed(false)
        // Keep the chosen time if it is still free, otherwise the first free one
        setSlot((current) => (result.slots.some((s) => s.time === current && s.available) ? current : (result.slots.find((s) => s.available)?.time ?? null)))
      })
      .catch(() => !stale && setSlotsFailed(true))
    return () => {
      stale = true
    }
  }, [maker.id, date, reload])

  const pick = (next: PickableDay) => {
    setAvailability(null)
    setSlot(null)
    setError(null)
    setDate(next.date)
  }

  const chosen = availability?.slots.find((s) => s.time === slot)
  const room = Math.min(workshop.maxPeople, chosen?.spotsLeft ?? workshop.maxPeople)
  const headcount = Math.min(Math.max(people, workshop.minPeople), room)
  const total = workshop.pricePerPerson * headcount
  const who = firstName(maker.name)

  const confirm = async () => {
    if (!day || !slot) return
    setSubmitting(true)
    setError(null)
    try {
      const booking = await makersApi.book(maker.id, {
        tripId: trip.id,
        date: day.date,
        slot,
        people: headcount,
        note: note.trim() || undefined,
        dayNumber: day.dayNumber ?? undefined,
      })
      tripBookings.add(booking)
      await activeTrip.loadItinerary()
      onBooked(booking)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book that session')
      setSubmitting(false)
      setReload((n) => n + 1)
    }
  }

  return (
    <div className="booking-sheet">
      <button type="button" className="booking-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div ref={panel} className="booking-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="booking-title" tabIndex={-1}>
        <span className="booking-sheet__handle" aria-hidden="true" />
        <header className="booking-sheet__header">
          <h2 id="booking-title" className="booking-sheet__title">
            Book {who} for the squad
          </h2>
          <p className="booking-sheet__sub">
            {workshop.title} · {durationLabel(workshop.durationMin)} · {formatINR(workshop.pricePerPerson)} /person
          </p>
        </header>

        <div className="booking-sheet__group">
          <p className="booking-sheet__label">Day</p>
          <div className="booking-sheet__chips no-scrollbar">
            {options.map((d) => {
              const reason = offReason(d, workshop, maker.closedDates)
              return <PickChip key={d.date} selected={d.date === date} disabled={reason !== null} sub={reason ?? undefined} onClick={() => pick(d)}>{d.label}</PickChip>
            })}
          </div>
          {!trip.startDate && <p className="booking-sheet__hint">Your trip has no dates yet, so this goes on Day 1 of the plan.</p>}
        </div>

        <div className="booking-sheet__group">
          <p className="booking-sheet__label">Time</p>
          {!date ? (
            <p className="booking-sheet__hint">{who} isn’t running a session on any day of your trip.</p>
          ) : slotsFailed ? (
            <p className="booking-sheet__hint">
              Couldn’t load the sessions.{' '}
              <button type="button" className="text-link" onClick={() => { setSlotsFailed(false); setReload((n) => n + 1) }}>
                Try again
              </button>
            </p>
          ) : !availability ? (
            <div className="booking-sheet__chips" aria-busy="true">
              <Skeleton width={96} height={46} radius={14} />
              <Skeleton width={96} height={46} radius={14} />
              <Skeleton width={96} height={46} radius={14} />
            </div>
          ) : !availability.open ? (
            <p className="booking-sheet__hint">{availability.closedReason}. Pick another day.</p>
          ) : (
            <div className="booking-sheet__chips no-scrollbar">
              {availability.slots.map((s) => (
                <PickChip
                  key={s.time}
                  selected={s.time === slot}
                  disabled={!s.available}
                  sub={s.available ? `${s.spotsLeft} left` : s.reason === 'past' ? 'Too soon' : 'Full'}
                  onClick={() => setSlot(s.time)}
                >
                  {s.time}
                </PickChip>
              ))}
            </div>
          )}
        </div>

        <div className="booking-sheet__group">
          <p className="booking-sheet__label">How many of you?</p>
          <div className="booking-sheet__people">
            <div className="booking-sheet__stepper">
              <button type="button" aria-label="One fewer" disabled={headcount <= workshop.minPeople} onClick={() => setPeople(headcount - 1)}>
                −
              </button>
              <span className="booking-sheet__count" aria-live="polite">
                <strong>{headcount}</strong> {headcount === 1 ? 'person' : 'people'}
              </span>
              <button type="button" aria-label="One more" disabled={headcount >= room} onClick={() => setPeople(headcount + 1)}>
                +
              </button>
            </div>
            <p className="booking-sheet__hint">
              {squad > workshop.maxPeople
                ? `Your squad is ${squad}, but a session takes up to ${workshop.maxPeople}. Book a second time for the rest.`
                : squad < workshop.minPeople
                  ? `Your squad is ${squad}. ${who} needs ${workshop.minPeople}+ for a session, so bring a guest or two.`
                  : `Your squad is ${squad}. A session takes ${groupLabel(workshop)}.`}
            </p>
          </div>
        </div>

        <label className="booking-sheet__group">
          <span className="booking-sheet__label">Anything {who} should know? (optional)</span>
          <input
            className="booking-sheet__note"
            maxLength={200}
            placeholder="Two kids aged 9, one vegetarian…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="booking-sheet__total">
          <div>
            <p className="booking-sheet__total-label">Total for the squad</p>
            <p className="booking-sheet__total-sum">{formatINR(total)}</p>
          </div>
          <p className="booking-sheet__total-note">
            {formatINR(workshop.pricePerPerson)} × {headcount}
            <span>Pay {who} directly on the day, by UPI or cash. All of it goes to the maker.</span>
          </p>
        </div>

        {error && (
          <p className="booking-sheet__error" role="alert">
            {error}
          </p>
        )}

        <div className="booking-sheet__actions">
          <Button variant="primary" disabled={!slot || submitting} onClick={() => void confirm()}>
            {submitting ? 'Booking…' : `Confirm for ${headcount} · ${formatINR(total)}`}
          </Button>
          <LinkButton onClick={onClose}>Not now</LinkButton>
        </div>
      </div>
    </div>
  )
}

type PickChipProps = { selected: boolean; disabled?: boolean; sub?: string; onClick: () => void; children: string }

/** A choice with an optional small line under it (places left, why it is off) */
function PickChip({ selected, disabled, sub, onClick, children }: PickChipProps) {
  return (
    <button type="button" className={`pick-chip${selected ? ' pick-chip--selected' : ''}`} aria-pressed={selected} disabled={disabled} onClick={onClick}>
      <span className="pick-chip__text">{children}</span>
      {sub && <span className="pick-chip__sub">{sub}</span>}
    </button>
  )
}
