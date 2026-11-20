import { useState } from 'react'
import headerBg from '../../assets/figma/itinerary-header-bg.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconRefresh from '../../assets/figma/icon-refresh-primary.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { CrowdChip } from '../../components/crowd/Crowd'
import { SITE_PHOTOS, applySuggestion, formatDuration, isOffPeak, waitMinutes } from '../../components/crowd/crowdData'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip, formatTripDates, tripDay, tripDayLabel, tripPhase, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import type { CrowdLabel } from '../../services/heritageService'
import type { ItineraryDay, ItineraryStop, TripDetail } from '../../services/tripsService'
import { GreenTripCard } from '../Impact/GreenTripCard'
import { FestivalTip } from '../Events/FestivalTip'
import { TAG_PHOTOS } from '../Trip/tripDetailData'
import { forLabel, groupSplitStops } from './itineraryData'
import { SquadSwipeCard } from './SquadSwipeCard'
import { ForChip, MustDoStar, SplitTag, WhyLine } from './StopWhy'
import { usePlanGenerator, usePlanState, useSquadInsights, type PlanGenerator } from './useSquadPlan'
import './ItineraryPage.css'

export function ItineraryPage() {
  const navigate = useNavigate()
  const { trip, itinerary } = useActiveTrip()
  const squad = trip?.members.map((m) => m.memberId) ?? []
  const live = trip && tripPhase(trip) === 'live' ? tripDay(trip) : null
  const eyebrow = live ? `Day ${live.day} of ${live.total} · Itinerary` : trip ? `${formatTripDates(trip)} · Itinerary` : 'Itinerary'

  return (
    <>
      <ScreenLayout headerBg={headerBg} headerHeight={190} eyebrow={eyebrow} title={trip?.name ?? 'Your trip'} withBubble>
        <div className="screen__header-row">
          <div className="group-pill">
            <div className="group-pill__info">
              {/* Five faces are plenty on a pill; the count beside them says how many mates there are */}
              <AvatarStack people={squad.slice(0, 5)} size={26} overlap={9} />
              <span className="group-pill__name">
                {trip?.groupName ?? '…'} · {squad.length} {squad.length === 1 ? 'mate' : 'mates'}
              </span>
            </div>
            <button type="button" className="group-pill__invite" onClick={() => navigate('trip/members')}>
              + Invite
            </button>
          </div>
        </div>

        <main className="screen__body">
          {trip ? (
            // Keyed by trip so the swipe card and plan state start fresh when another trip opens
            <TripPlan key={trip.id} trip={trip} itinerary={itinerary} today={live?.day ?? null} />
          ) : (
            <Skeleton variant="card" height={220} />
          )}
        </main>
      </ScreenLayout>
      <GhoomMateSays>Ask me “When is City Palace quietest?”</GhoomMateSays>
    </>
  )
}

/** Everything below the header once the trip is loaded: squad swipes, the stale banner and the day plan */
function TripPlan({ trip, itinerary, today }: { trip: TripDetail; itinerary: ItineraryDay[] | null; today: number | null }) {
  const hasPlan = !!itinerary?.some((d) => d.stops.length)
  const squad = useSquadInsights(trip.id)
  const plan = usePlanState(trip.id)
  const generator = usePlanGenerator(trip, hasPlan, (basis) => plan.markFresh(basis?.pending))
  // Trip cards someone loved: stops planned from them get a star
  const mustDos = new Set(squad.insights?.mustDos.map((m) => m.cardId) ?? [])

  return (
    <>
      <FestivalTip trip={trip} />
      <SquadSwipeCard trip={trip} squad={squad} planPending={plan.pending} hasPlan={hasPlan} generator={generator} />
      {itinerary ? (
        <>
          {plan.stale && hasPlan && <StaleBanner generator={generator} />}
          <DayPlan trip={trip} days={itinerary} today={today} mustDos={mustDos} />
          <CrowdPlanCard trip={trip} days={itinerary} />
          <GreenTripCard tripId={trip.id} days={itinerary} />
        </>
      ) : (
        <Skeleton variant="card" height={220} />
      )}
    </>
  )
}

/** Mates changed their swipes after the plan was made: regenerate from everyone's latest */
function StaleBanner({ generator }: { generator: PlanGenerator }) {
  const { busy, confirming, error, generate } = generator
  const confirmingHere = confirming === 'banner'

  return (
    <section className="stale-banner" aria-label="Plan out of date">
      <span className="stale-banner__icon" aria-hidden="true">
        <img src={iconRefresh} alt="" width={16} height={16} />
      </span>
      <div className="stale-banner__text">
        <p className="stale-banner__title">
          {confirmingHere ? 'This replaces the stops already planned. Tap again to go ahead.' : 'Mates changed their swipes since this plan was made'}
        </p>
        {error?.from === 'banner' && (
          <p className="stale-banner__error" role="alert">
            {error.message}
          </p>
        )}
      </div>
      <button type="button" className="pill-button stale-banner__action" disabled={busy} onClick={() => void generate('banner')}>
        {busy ? 'Planning…' : confirmingHere ? 'Replace' : 'Regenerate'}
      </button>
    </section>
  )
}

function DayPlan({ trip, days, today, mustDos }: { trip: TripDetail; days: ItineraryDay[]; today: number | null; mustDos: Set<string> }) {
  const navigate = useNavigate()
  // Open on today while the trip is live
  const [dayNumber, setDayNumber] = useState(() => (today && today <= days.length ? today : 1))
  const day = days.find((d) => d.number === dayNumber) ?? days[0]
  if (!day) return null
  const title = `Day ${day.number} · ${tripDayLabel(trip.startDate, day.number)}`
  const done = today !== null && day.number < today
  const myName = trip.members.find((m) => m.memberId === trip.memberId)?.name

  return (
    <>
      <SectionHeader
        title={title}
        action={
          <div className="day-pills no-scrollbar">
            {days.map((d) => (
              <button
                key={d.number}
                type="button"
                className={`day-pills__day${d.number === day.number ? ' day-pills__day--active' : ''}`}
                aria-pressed={d.number === day.number}
                onClick={() => setDayNumber(d.number)}
              >
                D{d.number}
              </button>
            ))}
          </div>
        }
      />
      {day.title && <p className="itinerary__day-title">{day.title}</p>}
      {day.stops.length > 0 ? (
        <>
          <ol className="timeline">
            {groupSplitStops(day.stops).map((group) => (
              <li key={group.key} className="timeline__stop">
                <div className="timeline__rail" aria-hidden="true">
                  <span className={`timeline__dot${done ? ' timeline__dot--done' : ''}`} />
                  <span className="timeline__line" />
                </div>
                <div className="timeline__body">
                  {group.stops.length > 1 ? (
                    // A split slot: the squad goes separate ways for a bit, one option per camp
                    <ul className="split-slot" aria-label={`Split plan at ${group.stops[0].time || 'the same time'}`}>
                      {group.stops.map((stop, i) => (
                        <li key={stop.id} className="split-slot__option">
                          {i > 0 && (
                            <p className="split-slot__or" aria-hidden="true">
                              or
                            </p>
                          )}
                          <TimelineStop tripId={trip.id} stop={stop} squadSize={trip.members.length} done={done} mustDo={!!stop.cardId && mustDos.has(stop.cardId)} myName={myName} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <TimelineStop
                      tripId={trip.id}
                      stop={group.stops[0]}
                      squadSize={trip.members.length}
                      done={done}
                      mustDo={!!group.stops[0].cardId && mustDos.has(group.stops[0].cardId)}
                      myName={myName}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="pill-button itinerary__add" onClick={() => navigate(`trip/itinerary/add?day=${day.number}`)}>
            <img src={iconPlus} alt="" width={14} height={14} />
            Add a stop
          </button>
        </>
      ) : (
        <EmptyState
          size="compact"
          headingLevel={3}
          title={`Nothing planned for Day ${day.number} yet`}
          text="Add a stop and the squad can RSVP."
          action={{ label: 'Add a stop', icon: iconPlus, onClick: () => navigate(`trip/itinerary/add?day=${day.number}`) }}
        />
      )}
    </>
  )
}

type TimelineStopProps = { tripId: string; stop: ItineraryStop; squadSize: number; done: boolean; mustDo: boolean; myName?: string }

/** One stop's card, and GhoomMate's crowd nudge under it */
function TimelineStop({ tripId, stop, squadSize, done, mustDo, myName }: TimelineStopProps) {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)
  const reaction = stop.going.length === 0 ? 'Nobody going' : stop.going.length === squadSize && squadSize > 1 ? 'Whole squad' : `${stop.going.length}/${squadSize} going`
  const crowd = stop.crowd
  const nudge = !done ? crowd?.suggestion : null
  const photo = (crowd && SITE_PHOTOS[crowd.siteId]) ?? TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill
  const planFor = forLabel(stop.forMembers, myName)

  const move = async () => {
    setMoving(true)
    try {
      await applySuggestion(tripId, stop)
      await activeTrip.loadItinerary()
    } finally {
      setMoving(false)
    }
  }

  return (
    <>
      <article className="list-card stop-card">
        <img className="stop-card__photo" src={photo} alt="" width={52} height={52} />
        <div className="stop-card__info">
          <p className="stop-card__time">
            {stop.time || 'Anytime'}
            {crowd?.label && <CrowdChip label={crowd.label} />}
            {crowd?.gem && <span className="stop-card__gem">Hidden gem</span>}
            {stop.split && <SplitTag />}
          </p>
          <h3 className="stop-card__title">
            {mustDo && <MustDoStar />}
            {stop.title}
          </h3>
          <WhyLine why={stop.why} clamp />
          <ForChip label={planFor} />
          <div className="stop-card__people">
            <AvatarStack people={stop.going} size={18} overlap={6} />
            <span>{reaction}</span>
          </div>
        </div>
        {stop.tag && <span className="tag">{stop.tag}</span>}
        <button type="button" className="stop-card__open" aria-label={`Open ${stop.title}`} onClick={() => navigate(`trip/itinerary/stop/${stop.id}`)} />
      </article>
      {nudge && (
        <div className={`crowd-nudge crowd-nudge--${crowd!.label ?? 'moderate'}`}>
          <p className="crowd-nudge__text">
            <strong>{nudge.type === 'shift' ? `Go at ${nudge.time}` : `Try ${nudge.siteName}`}</strong>
            {nudge.reason}
          </p>
          <button type="button" className="pill-button crowd-nudge__action" disabled={moving} onClick={() => void move()}>
            {moving ? 'Moving…' : nudge.type === 'shift' ? 'Move' : 'Swap'}
          </button>
        </div>
      )}
    </>
  )
}


/** Points per stop towards the crowd-smart score */
const STOP_SCORE: Record<CrowdLabel, number> = { quiet: 100, moderate: 80, busy: 35, packed: 10, closed: 0 }

/**
 * How crowd-smart the plan is: heritage stops off-peak, gems, queue time dodged. Udaipur's old city takes millions of
 * visitors a year, so every squad that visits off-peak takes pressure off its lanes, ghats and the families who live there.
 */
function CrowdPlanCard({ trip, days }: { trip: TripDetail; days: ItineraryDay[] }) {
  const [fixing, setFixing] = useState(false)
  const heritage = days.flatMap((d) => d.stops).filter((s) => s.crowd && s.time)
  if (!heritage.length) return null

  const offPeak = heritage.filter((s) => isOffPeak(s.crowd!))
  const gems = heritage.filter((s) => s.crowd!.gem).length
  const fixable = heritage.filter((s) => s.crowd!.suggestion)
  const score = Math.round(heritage.reduce((sum, s) => sum + STOP_SCORE[s.crowd!.label ?? 'closed'], 0) / heritage.length)
  // Queue time each mate skips compared with visiting the same sites at their busiest hour
  const dodged = heritage.reduce((sum, s) => {
    const peak = Math.max(...s.crowd!.forecast.map((p) => p.level ?? 0))
    return sum + Math.max(0, waitMinutes(peak) - s.crowd!.waitMinutes)
  }, 0)
  const squad = trip.members.length

  const fixAll = async () => {
    setFixing(true)
    try {
      // One at a time so each nudge sees the stops already moved
      for (const stop of fixable) await applySuggestion(trip.id, stop)
    } finally {
      await activeTrip.loadItinerary()
      setFixing(false)
    }
  }

  return (
    <section className="card crowd-plan">
      <div className="crowd-plan__head">
        <div className="crowd-plan__score" aria-label={`Crowd-smart score ${score} out of 100`}>
          <span className="crowd-plan__score-value">{score}</span>
          <span className="crowd-plan__score-max">/100</span>
        </div>
        <div className="crowd-plan__text">
          <p className="overline crowd-plan__overline">Crowd-smart plan</p>
          <h2 className="crowd-plan__title">
            {offPeak.length} of {heritage.length} heritage stops off-peak
          </h2>
          <p className="crowd-plan__meta">
            {gems > 0 && `${gems} hidden ${gems === 1 ? 'gem' : 'gems'} · `}
            {dodged > 0 ? `~${formatDuration(dodged)} of queues dodged each` : 'Timed around the crowds'}
          </p>
        </div>
      </div>
      <p className="crowd-plan__impact">
        {offPeak.length * squad} squad visits moved out of rush hour, easing the strain on the old city’s lanes and ghats.
      </p>
      {fixable.length > 0 && (
        <Button variant="primary" onClick={() => void fixAll()} disabled={fixing}>
          {fixing ? 'Moving the squad off-peak…' : `Dodge the crowds at ${fixable.length} ${fixable.length === 1 ? 'stop' : 'stops'}`}
        </Button>
      )}
    </section>
  )
}
