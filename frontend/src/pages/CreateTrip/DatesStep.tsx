import iconCalendar from '../../assets/figma/icon-calendar-primary.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { DateRangeCalendar, RangeSummary } from '../../components/DateRangeCalendar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { describeRange } from '../../data/tripDates'
import { BUDGETS, FLEXIBLE_LENGTHS, destinationName, tripLength, type TripDetails } from './createTripData'
import './DatesStep.css'

type DatesStepProps = {
  trip: TripDetails
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onContinue: () => void
}

export function DatesStep({ trip, onChange, onBack, onContinue }: DatesStepProps) {
  const { start, end, flexible } = trip
  const length = tripLength(trip)

  const summary = flexible
    ? { value: `About ${trip.flexibleDays} days`, detail: 'Any dates that work · I’ll find the best weather' }
    : describeRange(start, end)

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
      <section className="card create-calendar">
        <DateRangeCalendar start={start} end={end} disabled={flexible} onChange={onChange} />
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

      <RangeSummary value={summary.value} detail={summary.detail} />

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
