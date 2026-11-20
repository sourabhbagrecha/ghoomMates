import { useId, useState } from 'react'
import iconChevronDown from '../../assets/figma/icon-chevron-down-muted.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconCompass from '../../assets/figma/icon-compass-primary.svg'
import { Button } from '../../components/Button'
import { VibeChart } from '../../components/VibeChart'
import { Skeleton } from '../../components/states/Skeleton'
import { personOf } from '../../data/people'
import { blendVibes, vibeMatch } from '../../data/vibe'
import { useNavigate } from '../../hooks/navigation'
import type { SquadInsights } from '../../services/prefsService'
import type { TripDetail } from '../../services/tripsService'
import { loadVibe } from '../../services/vibeStorage'
import {
  CORE_DECK_SIZE,
  deckCopy,
  fairnessLine,
  firstName,
  listNames,
  viewFromInsights,
  viewFromMembers,
  withoutMe,
  type SquadView,
} from './itineraryData'
import { useDeckTotal, type GeneratedPlan, type PlanGenerator } from './useSquadPlan'
import './SquadSwipeCard.css'

type SquadSwipeCardProps = {
  trip: TripDetail
  squad: { insights: SquadInsights | null; loading: boolean }
  /** Who hasn't swiped, from the itinerary (used when the squad insights can't load) */
  planPending: string[] | null
  hasPlan: boolean
  generator: PlanGenerator
}

/** The old member-list vibes, so the card still works without the squad insights */
function fallbackView(trip: TripDetail, planPending: string[] | null): SquadView {
  const me = trip.members.find((m) => m.memberId === trip.memberId)
  const view = viewFromMembers(trip, loadVibe() ?? blendVibes([me?.vibe]))
  return planPending ? { ...view, pending: withoutMe(planPending, me?.name) } : view
}

/**
 * Itinerary tab: the squad's spiderweb and persona, how many mates have swiped, the way into the core quiz, the trip
 * deck and Squad DNA, and the generate button. Generating never waits on anyone: whoever has swiped shapes the plan.
 */
export function SquadSwipeCard({ trip, squad, planPending, hasPlan, generator }: SquadSwipeCardProps) {
  const navigate = useNavigate()
  const deckTotal = useDeckTotal(trip.id)
  if (squad.loading) return <SquadSwipeSkeleton />

  const view = squad.insights ? viewFromInsights(squad.insights) : fallbackView(trip, planPending)
  const deck = deckCopy(view.city, view.tripAnswered, deckTotal)
  const match = view.done > 1 && view.myVibe && view.squadVibe ? vibeMatch(view.myVibe, view.squadVibe) : null
  const series = [
    ...(view.squadVibe ? [{ scores: view.squadVibe, color: 'var(--color-sky)', fillOpacity: 0.28 }] : []),
    ...(view.myVibe ? [{ scores: view.myVibe, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true }] : []),
  ]
  const mates = view.total === 1 ? 'mate' : 'mates'

  return (
    <section className="card squad-swipe" aria-labelledby="squad-swipe-persona">
      <div className="squad-swipe__main">
        <div className="spiderweb">
          <VibeChart variant="compact" width={176} label="Squad spiderweb: your vibe compared with the squad" series={series} />
        </div>
        <div className="squad-swipe__persona">
          <p className="overline squad-swipe__overline">Squad spiderweb</p>
          <h2 id="squad-swipe-persona" className="squad-swipe__persona-name">
            {view.persona ?? 'No swipes yet'}
          </h2>
          <div className="squad-swipe__legend">
            <span className="squad-swipe__legend-item">
              <span className="squad-swipe__swatch squad-swipe__swatch--squad" />
              Squad
            </span>
            {view.myVibe && (
              <span className="squad-swipe__legend-item">
                <span className="squad-swipe__swatch squad-swipe__swatch--you" />
                You
              </span>
            )}
          </div>
          {match !== null && <span className="squad-swipe__match">{match}% vibe match</span>}
          <button type="button" className="text-link squad-swipe__dna" onClick={() => navigate(`quiz/squad/${trip.id}`)}>
            See squad DNA
          </button>
        </div>
      </div>

      <div className="squad-swipe__progress">
        <p className="squad-swipe__progress-label">
          <strong>
            {view.done} of {view.total}
          </strong>{' '}
          {mates} swiped
        </p>
        <span
          className="squad-swipe__bar"
          role="progressbar"
          aria-label="Mates who’ve swiped"
          aria-valuenow={view.done}
          aria-valuemin={0}
          aria-valuemax={view.total}
        >
          <span className="squad-swipe__bar-fill" style={{ width: `${view.total ? (view.done / view.total) * 100 : 0}%` }} />
        </span>
      </div>

      {view.pending.length > 0 && (
        <p className="squad-swipe__note">
          Waiting on {listNames(view.pending)}. You can plan now and regenerate later.
        </p>
      )}

      {!view.coreDone && (
        <div className="squad-swipe__quiz">
          <p className="squad-swipe__quiz-text">
            <strong>{view.legacyVibe ? 'Sharpen your vibe' : 'What’s your travel vibe?'}</strong>{' '}
            {CORE_DECK_SIZE} quick swipes so GhoomMate can plan around you too.
          </p>
          <Button variant="primary" onClick={() => navigate('quiz')}>
            Take the vibe quiz
          </Button>
        </div>
      )}

      <button type="button" className="squad-swipe__deck" onClick={() => navigate(`quiz/trip/${trip.id}`)}>
        <span className="squad-swipe__deck-icon">
          <img src={iconCompass} alt="" width={18} height={18} />
        </span>
        <span className="squad-swipe__deck-text">
          <span className="squad-swipe__deck-title">{deck.title}</span>
          <span className="squad-swipe__deck-meta">{deck.meta}</span>
        </span>
        <img src={iconChevron} alt="" width={16} height={16} />
      </button>

      <GeneratePlan hasPlan={hasPlan} generator={generator} primary={view.coreDone} />
      {generator.result && <PlanFairness trip={trip} plan={generator.result} />}
    </section>
  )
}

/** Same shape as the loaded card (the chart's grid is drawn at once), so nothing jumps when the insights arrive */
function SquadSwipeSkeleton() {
  return (
    <section className="card squad-swipe" aria-busy="true" aria-label="Loading the squad’s swipes">
      <div className="squad-swipe__main">
        <div className="spiderweb" aria-hidden="true">
          <VibeChart variant="compact" width={176} label="" series={[]} />
        </div>
        <div className="squad-swipe__persona">
          <Skeleton width={96} height={11} />
          <Skeleton width="100%" height={17} />
          <Skeleton width="70%" height={17} />
          <Skeleton width={90} height={11} />
        </div>
      </div>
      <Skeleton variant="card" height={34} radius={14} />
      <Skeleton variant="card" height={56} radius={18} />
      <Skeleton variant="card" height={52} radius={16} />
    </section>
  )
}

/** Generate / regenerate: always available. Replacing a plan that has stops takes a second tap. */
function GeneratePlan({ hasPlan, generator, primary }: { hasPlan: boolean; generator: PlanGenerator; primary: boolean }) {
  const { busy, confirming, error, generate } = generator
  const confirmingHere = confirming === 'card'
  const status = confirmingHere
    ? 'This replaces the stops already planned. Tap again to go ahead.'
    : hasPlan
      ? null
      : 'Let GhoomMate build a plan around everyone’s swipes.'

  return (
    <div className="squad-swipe__generate">
      {status && <p className="squad-swipe__note">{status}</p>}
      <Button variant={primary ? 'primary' : 'outline'} onClick={() => void generate('card')} disabled={busy}>
        {busy ? 'GhoomMate is planning…' : confirmingHere ? 'Replace the plan' : hasPlan ? 'Regenerate itinerary' : 'Generate itinerary'}
      </Button>
      {error?.from === 'card' && (
        <p className="squad-swipe__error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}

/** After generating: one calm line on whose swipes shaped the plan, and how well it suits each mate */
function PlanFairness({ trip, plan }: { trip: TripDetail; plan: GeneratedPlan }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const line = fairnessLine(plan.fairness, plan.basis, trip.members.length)
  const members = plan.fairness?.members ?? []
  const me = trip.members.find((m) => m.memberId === trip.memberId)
  // Fairness lists first names; match them to the trip's members for colours
  const memberOf = (name: string) => trip.members.find((m) => firstName(m.name) === name)

  return (
    <div className="plan-fairness">
      <p className="plan-fairness__line" role="status">
        {line}
      </p>
      {members.length > 1 && (
        <>
          <button type="button" className="plan-fairness__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
            How it suits each mate
            <img className={`plan-fairness__chevron${open ? ' plan-fairness__chevron--open' : ''}`} src={iconChevronDown} alt="" width={14} height={14} />
          </button>
          <ul id={listId} className="plan-fairness__list" hidden={!open}>
            {members.map((m) => {
              const member = memberOf(m.name)
              const pct = Math.round(Math.min(1, Math.max(0, m.score)) * 100)
              const isMe = !!member && member.memberId === me?.memberId
              return (
                <li key={m.name} className="plan-fairness__row">
                  <span className="plan-fairness__name">{isMe ? 'You' : m.name}</span>
                  <span className="plan-fairness__bar" aria-hidden="true">
                    <span
                      className="plan-fairness__fill"
                      style={{ width: `${Math.max(pct, 3)}%`, background: member ? personOf(member.memberId).color : 'var(--color-sky)' }}
                    />
                  </span>
                  <span className="plan-fairness__score">{pct}%</span>
                  <span className="plan-fairness__spots">
                    {m.spotlights > 0 ? `${m.spotlights} ${m.spotlights === 1 ? 'spotlight' : 'spotlights'}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
