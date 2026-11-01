import { useEffect, useMemo, useRef, useState } from 'react'
import iconClose from '../../assets/figma/icon-x-ink.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { hospitalityApi, type HostDetail, type Meal, type Reservation, type SquadDiets } from '../../services/hospitalityService'
import type { TripDetail } from '../../services/tripsService'
import { addDay, DIET_HINTS, DIET_LABELS, dayName, formatINR, shortDate } from './hospitalityData'
import { Stepper } from './HospitalityParts'
import './ReserveSheet.css'

type DayOption = { date: string; label: string; sub: string; day: number | null }

/**
 * The days a squad can book: the trip's days from today on, numbered as in the plan. A trip with no dates yet gets the next
 * three days, numbered 1–3; a trip that is over gets the next three days with no plan day (the table is booked, no stop is added).
 */
function dayOptions(trip: TripDetail | null, today: string): DayOption[] {
  const options: DayOption[] = []
  if (trip?.startDate) {
    const end = trip.endDate ?? trip.startDate
    for (let date = trip.startDate, n = 1; date <= end && n <= 14; date = addDay(date), n++) {
      if (date >= today) options.push({ date, label: dayName(date, today, shortDate(date)), sub: `Day ${n}`, day: n })
    }
  }
  if (!options.length) {
    for (let i = 0; i < 3; i++) {
      const date = addDay(today, i)
      options.push({ date, label: dayName(date, today, shortDate(date)), sub: trip?.startDate ? 'Not on your plan' : `Day ${i + 1}`, day: trip?.startDate ? null : i + 1 })
    }
  }
  return options.slice(0, 8)
}

type ReserveSheetProps = {
  host: HostDetail
  trip: TripDetail | null
  /** Who is in the squad and the diets their profiles mention */
  squad: SquadDiets
  /** The squad's tables at this kitchen already */
  tables: Reservation[]
  onClose: () => void
  /** Called with a message for the toast once the table is booked */
  onBooked: (message: string) => void
}

/** "Reserve a squad thali": when, who's eating, which diets. One primary button books the table and adds the stop. */
export function ReserveSheet({ host, trip, squad, tables, onClose, onBooked }: ReserveSheetProps) {
  const days = useMemo(() => dayOptions(trip, host.today), [trip, host.today])
  const squadSize = squad?.members ?? trip?.members.length ?? 4
  const maxGuests = Math.min(host.capacity, 60)
  const defaultMeal = host.mealOptions.some((m) => m.id === 'dinner') ? 'dinner' : host.mealOptions[0].id

  const [date, setDate] = useState(days[0].date)
  const [meal, setMeal] = useState<Meal>(defaultMeal)
  const [time, setTime] = useState(host.mealOptions.find((m) => m.id === defaultMeal)!.defaultTime)
  const [guests, setGuests] = useState(Math.max(1, Math.min(squadSize, maxGuests)))
  const [jain, setJain] = useState(squad?.diets.jain ?? 0)
  const [vegan, setVegan] = useState(squad?.diets.vegan ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheet = useRef<HTMLDivElement>(null)

  // Keep the keyboard inside the sheet: focus it on open, close on Escape
  useEffect(() => sheet.current?.focus(), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const option = host.mealOptions.find((m) => m.id === meal)!
  const chosenDay = days.find((d) => d.date === date)!
  const jainN = Math.min(jain, guests)
  const veganN = Math.min(vegan, guests - jainN)
  const vegetarian = guests - jainN - veganN
  const existing = tables.find((t) => t.date === date && t.meal === meal)
  const fromProfiles = squad && (squad.diets.jain > 0 || squad.diets.vegan > 0)

  // Picking a slot the squad already booked brings that booking's numbers back, so the button updates it
  const adopt = (table: Reservation | undefined) => {
    if (!table) return
    setGuests(table.headcount)
    setJain(table.dietary.jain)
    setVegan(table.dietary.vegan)
    setTime(table.time)
  }
  const pickDay = (next: string) => {
    setDate(next)
    adopt(tables.find((t) => t.date === next && t.meal === meal))
  }
  const pickMeal = (next: Meal) => {
    setMeal(next)
    setTime(host.mealOptions.find((m) => m.id === next)!.defaultTime)
    adopt(tables.find((t) => t.date === date && t.meal === next))
  }

  const book = async () => {
    if (!trip || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await hospitalityApi.reserve(host.id, {
        tripId: trip.id,
        date,
        meal,
        time,
        headcount: guests,
        dietary: { jain: jainN, vegan: veganN },
        ...(chosenDay.day ? { dayNumber: chosenDay.day } : {}),
      })
      const where = result.stop
        ? `added to Day ${result.stop.dayNumber} of your plan`
        : 'that day isn’t in your trip dates, so it isn’t on the plan'
      onBooked(result.updated ? `Table updated for ${guests} · ${where}` : `Table booked for ${guests} · ${where}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book the table')
      setBusy(false)
    }
  }

  return (
    <div className="reserve" role="dialog" aria-modal="true" aria-labelledby="reserve-title">
      <button type="button" className="reserve__scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="reserve__sheet" ref={sheet} tabIndex={-1}>
        <span className="reserve__grabber" aria-hidden="true" />
        <div className="reserve__top">
          <div>
            <h2 id="reserve-title" className="reserve__title">
              Reserve a squad thali
            </h2>
            <p className="reserve__meta">
              {host.name} · {host.area}
            </p>
          </div>
          <button type="button" className="reserve__close" aria-label="Close" onClick={onClose}>
            <img src={iconClose} alt="" width={16} height={16} />
          </button>
        </div>

        <section className="reserve__section" aria-label="When">
          <h3 className="overline">When</h3>
          <div className="reserve__chips no-scrollbar" role="group" aria-label="Day">
            {days.map((d) => (
              <Chip key={d.date} selected={d.date === date} onClick={() => pickDay(d.date)}>
                {d.label} · {d.sub}
              </Chip>
            ))}
          </div>
          <div className="reserve__chips" role="group" aria-label="Meal">
            {host.mealOptions.map((m) => (
              <Chip key={m.id} selected={m.id === meal} onClick={() => pickMeal(m.id)}>
                {m.label}
              </Chip>
            ))}
          </div>
          <div className="reserve__chips no-scrollbar" role="group" aria-label="Time">
            {option.times.map((t) => (
              <Chip key={t} selected={t === time} onClick={() => setTime(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </section>

        <section className="reserve__section" aria-label="Who’s eating">
          <h3 className="overline">Who’s eating</h3>
          <div className="reserve__row">
            <p className="reserve__row-text">
              <strong>Guests</strong>
              <span>{squadSize === guests ? `The whole squad · ${squadSize}` : `${squadSize} in your squad`}</span>
            </p>
            <Stepper value={guests} min={1} max={maxGuests} label="guests" onChange={setGuests} />
          </div>
          <div className="reserve__row">
            <p className="reserve__row-text">
              <strong>{DIET_LABELS.jain}</strong>
              <span>{DIET_HINTS.jain}</span>
            </p>
            <Stepper value={jainN} min={0} max={guests - veganN} label="Jain guests" onChange={setJain} />
          </div>
          <div className="reserve__row">
            <p className="reserve__row-text">
              <strong>{DIET_LABELS.vegan}</strong>
              <span>{DIET_HINTS.vegan}</span>
            </p>
            <Stepper value={veganN} min={0} max={guests - jainN} label="Vegan guests" onChange={setVegan} />
          </div>
          <p className="reserve__hint">
            {vegetarian} on the standard thali. Every dish here is vegetarian.
            {fromProfiles && ' Jain and vegan counts come from your squad’s profiles; change them if needed.'}
          </p>
        </section>

        <footer className="reserve__footer">
          {error && (
            <p className="reserve__error" role="alert">
              {error}
            </p>
          )}
          {existing && <p className="reserve__hint">Your squad already has a table then. This updates it.</p>}
          <Button variant="primary" disabled={busy || !trip} onClick={book}>
            {busy ? 'Booking…' : existing ? `Update table for ${guests}` : `Reserve for ${guests}`}
          </Button>
          <p className="reserve__fine">
            About {formatINR(host.pricePerThali * guests)} at the table (estimate). The kitchen cooks to your head-count and adds it to your plan.
          </p>
        </footer>
      </div>
    </div>
  )
}
