import iconCheck from '../../assets/figma/icon-check-success.svg'
import { experienceById } from '../../pages/Explore/experiencesData'
import { Button } from '../Button'
import { experienceRoute, SCREEN_ROUTES, type DayPlan, type UiAction } from './protocol'
import type { CardAction } from './useGhoomMateUi'

type DayPlanCardProps = {
  plan: DayPlan
  status: 'draft' | 'added'
  pending: CardAction | null
  error: string | null
  onAction: (action: UiAction) => void
  onNavigate: (route: string) => void
}

const BASIS: Record<DayPlan['basis'], string> = {
  you: 'for your vibe',
  squad: 'for the squad',
  mood: 'for your mood',
  rating: 'top rated',
}

/** A day of guide experiences GhoomMate put together, shown before anything goes on the itinerary. */
export function DayPlanCard({ plan, status, pending, error, onAction, onNavigate }: DayPlanCardProps) {
  const added = status === 'added'
  const stops = (plan.stops ?? []).flatMap((stop) => {
    const experience = experienceById(stop.experienceId)
    return experience ? [{ stop, experience }] : []
  })

  return (
    <section className="voice-card voice-plan" aria-label={`Plan for ${plan.dayLabel}`}>
      <p className="overline voice-card__overline">
        {plan.dayLabel} in {plan.city} · {BASIS[plan.basis]}
      </p>

      <ol className="voice-plan__stops">
        {stops.map(({ stop, experience }) => (
          <li key={experience.id} className="voice-plan__stop">
            <span className="voice-plan__time">{stop.start}</span>
            <button type="button" className="voice-plan__row" onClick={() => onNavigate(experienceRoute(experience.id))}>
              <img src={experience.photos[0].src} alt="" width={44} height={44} loading="lazy" />
              <span className="voice-plan__text">
                <span className="voice-plan__title">{experience.title}</span>
                <span className="voice-plan__meta">
                  until {stop.end}
                  {stop.matchPercent !== null && (
                    <>
                      {' · '}
                      <strong>{stop.matchPercent}% match</strong>
                    </>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {added ? (
        <div className="voice-plan__done">
          <p className="voice-plan__added" role="status">
            <img src={iconCheck} alt="" width={14} height={14} />
            On Day {plan.dayNumber} of your itinerary
          </p>
          <button type="button" className="text-link" onClick={() => onNavigate(SCREEN_ROUTES.itinerary)}>
            View itinerary
          </button>
        </div>
      ) : plan.dayNumber === null ? (
        <p className="voice-card__text">{plan.dayLabel} isn’t one of your trip days, so this can’t go on the itinerary.</p>
      ) : (
        <div className="voice-card__actions">
          <Button variant="outline" disabled={pending !== null} onClick={() => onAction({ type: 'plan.cancel', planId: plan.id })}>
            {pending === 'plan.cancel' ? 'Cancelling…' : 'Not this'}
          </Button>
          <Button variant="highlight" disabled={pending !== null} onClick={() => onAction({ type: 'plan.add', planId: plan.id })}>
            {pending === 'plan.add' ? 'Adding…' : `Add to Day ${plan.dayNumber}`}
          </Button>
        </div>
      )}
      {error && !added && <p className="voice-card__error">{error}</p>}
    </section>
  )
}
