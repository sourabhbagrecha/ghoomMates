import { useState } from 'react'
import type { Forecast, ForecastDay, Meal } from '../../services/hospitalityService'
import { dayName } from './hospitalityData'

const PLOT_HEIGHT = 96
const MEALS: { id: Meal; label: string }[] = [
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
]

/** "weekend" → "the weekend"; festival names read as they are */
const noteText = (note: string) => (note === 'weekend' ? 'the weekend' : note)

/** Seven days of covers: squads that booked (blue) on top of the walk-in estimate (light), and the selected day in detail. */
export function DemandCard({ forecast }: { forecast: Forecast }) {
  const { days } = forecast
  // Start on the first day a squad has booked, else tomorrow
  const [selected, setSelected] = useState(() => {
    const booked = days.findIndex((d) => d.booked > 0)
    return booked >= 0 ? booked : Math.min(1, days.length - 1)
  })
  const day = days[Math.min(selected, days.length - 1)]
  const most = Math.max(1, ...days.map((d) => d.covers))

  return (
    <section className="card demand" aria-label="Demand for the next seven days">
      <div className="demand__head">
        <h2 className="demand__title">Demand · next {days.length} days</h2>
        <p className="demand__legend">
          <span className="demand__key demand__key--booked">Squads</span>
          <span className="demand__key demand__key--walkin">Walk-ins (est.)</span>
        </p>
      </div>

      <div className="demand__chart" role="group" aria-label="Covers per day, tap a day for details">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={`demand__col${d.date === day.date ? ' demand__col--on' : ''}`}
            aria-pressed={d.date === day.date}
            aria-label={`${d.label}: ${d.covers} covers, ${d.booked} booked by squads`}
            onClick={() => setSelected(i)}
          >
            <span className="demand__value">{d.covers}</span>
            <span className="demand__plot">
              <span className="demand__stack" style={{ height: `${Math.max(6, Math.round((d.covers / most) * PLOT_HEIGHT))}px` }}>
                <span className="demand__walkin" style={{ flexGrow: d.walkIn }} />
                {d.booked > 0 && <span className="demand__booked" style={{ flexGrow: d.booked }} />}
              </span>
            </span>
            <span className="demand__weekday">{i === 0 ? 'Today' : d.weekday}</span>
            <span className="demand__date">{d.label.split(' ')[1]}</span>
          </button>
        ))}
      </div>

      <DayDetail day={day} today={forecast.from} />
    </section>
  )
}

function DayDetail({ day, today }: { day: ForecastDay; today: string }) {
  const { total, booked } = day.diets
  const diets = [
    `${total.veg} vegetarian`,
    total.jain > 0 && `${total.jain} Jain${booked.jain ? ` (${booked.jain} booked)` : ''}`,
    total.vegan > 0 && `${total.vegan} vegan${booked.vegan ? ` (${booked.vegan} booked)` : ''}`,
  ].filter(Boolean)
  const squads = MEALS.flatMap((m) => day.meals[m.id].bookings.map((b) => ({ ...b, mealLabel: m.label })))

  return (
    <div className="demand__detail" aria-live="polite">
      <div className="demand__detail-head">
        <h3 className="demand__detail-title">
          {dayName(day.date, today, day.label)}
          <span>{dayName(day.date, today, day.label) === day.label ? '' : ` · ${day.label}`}</span>
        </h3>
        <p className="demand__detail-total">
          <strong>{day.covers}</strong> covers
          {day.booked > 0 && <span className="demand__lift">+{day.booked} from squads</span>}
        </p>
      </div>
      {day.dayNote && <p className="demand__note">Busier than a usual weekday: it’s {noteText(day.dayNote)}.</p>}

      <ul className="demand__meals">
        {MEALS.map((m) => {
          const meal = day.meals[m.id]
          return (
            <li key={m.id}>
              <span className="overline">{m.label}</span>
              <span>
                <strong>{meal.covers}</strong> · {meal.booked} booked · {meal.walkIn} walk-ins (est.)
              </span>
            </li>
          )
        })}
      </ul>

      {squads.length > 0 ? (
        <ul className="demand__squads" aria-label="Squads booked">
          {squads.map((s) => (
            <li key={s.id} className="demand__squad">
              <span className="demand__squad-name">{s.group || 'A squad'}</span>
              <span className="demand__squad-meta">
                {s.mealLabel}, {s.time} · {s.headcount} guests
                {s.dietary.jain > 0 && ` · ${s.dietary.jain} Jain`}
                {s.dietary.vegan > 0 && ` · ${s.dietary.vegan} vegan`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="demand__empty">No squad has booked this day yet. Squads that book ahead let you cook to the head-count.</p>
      )}

      <p className="demand__diets">
        <strong>Diets</strong> {diets.join(' · ')}
      </p>
    </div>
  )
}
