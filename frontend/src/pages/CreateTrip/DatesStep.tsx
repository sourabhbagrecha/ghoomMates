import iconCalendar from '../../assets/figma/icon-calendar-primary.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import {
  BUDGETS,
  CALENDAR,
  FLEXIBLE_LENGTHS,
  WEEKDAYS,
  daysInMonth,
  destinationName,
  formatDay,
  leadingBlanks,
  tripLength,
  type TripDetails,
} from './createTripData'
import './DatesStep.css'

type DatesStepProps = {
  trip: TripDetails
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onContinue: () => void
}

const nights = (days: number) => `${days - 1} night${days - 1 === 1 ? '' : 's'}`

export function DatesStep({ trip, onChange, onBack, onContinue }: DatesStepProps) {
  const { start, end, flexible } = trip
  const length = tripLength(trip)

  // First tap sets the start, second tap the end; tapping again starts a new range
  const pickDay = (day: number) => {
    if (!start || end) onChange({ start: day, end: null })
    else if (day < start) onChange({ start: day })
    else onChange({ end: day })
  }

  let summary: { value: string; detail: string }
  if (flexible) {
    summary = { value: `About ${trip.flexibleDays} days`, detail: 'Any dates in December · I’ll find the best weather' }
  } else if (start && end && length) {
    summary = {
      value: length === 1 ? 'A day trip' : `${length} days · ${nights(length)}`,
      detail: length === 1 ? formatDay(start) : `${formatDay(start)} → ${formatDay(end)}`,
    }
  } else {
    summary = { value: 'Pick an end date', detail: start ? `Starting ${formatDay(start)}` : 'Tap your first day' }
  }

  return (
    <OnboardingLayout
      eyebrow="New trip · Step 2 of 4"
      title="When are you going?"
      subtitle={`Dates and budget for ${destinationName(trip.destination)}.`}
      step={2}
      onBack={onBack}
      bodyClassName="create-dates__body"
      actions={
        <Button variant="primary" disabled={!length} onClick={onContinue}>
          Continue
        </Button>
      }
    >
      <section className={`card create-calendar${flexible ? ' create-calendar--flexible' : ''}`}>
        <h2 className="create-calendar__month">{CALENDAR.label}</h2>
        <div className="create-calendar__grid">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="create-calendar__weekday" aria-hidden="true">
              {w}
            </span>
          ))}
          {Array.from({ length: leadingBlanks() }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth() }, (_, i) => {
            const day = i + 1
            const isStart = day === start
            const isEnd = day === end
            const inRange = !!start && !!end && day > start && day < end
            const className = [
              'create-calendar__day',
              inRange && 'create-calendar__day--in-range',
              (isStart || isEnd) && 'create-calendar__day--edge',
              isStart && end && end !== start && 'create-calendar__day--start',
              isEnd && end !== start && 'create-calendar__day--end',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={day}
                type="button"
                className={className}
                disabled={flexible}
                aria-pressed={isStart || isEnd || inRange}
                aria-label={`${formatDay(day)}${isStart ? ', trip starts' : ''}${isEnd ? ', trip ends' : ''}`}
                onClick={() => pickDay(day)}
              >
                <span>{day}</span>
              </button>
            )
          })}
        </div>
      </section>

      <button
        type="button"
        className="list-card create-flexible"
        aria-pressed={flexible}
        onClick={() => onChange({ flexible: !flexible })}
      >
        <span className="create-flexible__icon">
          <img src={iconCalendar} alt="" width={20} height={20} />
        </span>
        <span className="create-flexible__text">
          Flexible dates
          <span>Let GhoomMate pick the best days</span>
        </span>
        <span className={`create-switch${flexible ? ' create-switch--on' : ''}`} aria-hidden="true" />
      </button>

      {flexible && (
        <div className="create-dates__chips" role="group" aria-label="How long?">
          {FLEXIBLE_LENGTHS.map((l) => (
            <Chip key={l.days} selected={trip.flexibleDays === l.days} onClick={() => onChange({ flexibleDays: l.days })}>
              {l.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="create-dates__summary" aria-live="polite">
        <p className="overline">Trip length</p>
        <p className="create-dates__summary-value">{summary.value}</p>
        <p className="create-dates__summary-detail">{summary.detail}</p>
      </div>

      <div className="create-dates__budget">
        <h2 className="create-dates__label">Budget per person</h2>
        <div className="create-dates__chips" role="group" aria-label="Budget per person">
          {BUDGETS.map((b) => (
            <Chip key={b.id} selected={trip.budget === b.id} onClick={() => onChange({ budget: b.id })}>
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="create-dates__hint">Stays, food and activities. Getting there isn’t included.</p>
      </div>
    </OnboardingLayout>
  )
}
