import { useState } from 'react'
import headerBg from '../../assets/figma/itinerary-header-bg.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconStarOutline from '../../assets/figma/icon-star-outline.svg'
import iconStar from '../../assets/figma/icon-star.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { VibeChart } from '../../components/VibeChart'
import { CrowdChip } from '../../components/crowd/Crowd'
import { SITE_PHOTOS, applySuggestion, formatDuration, isOffPeak, waitMinutes } from '../../components/crowd/crowdData'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip, formatTripDates, tripDay, tripDayLabel, tripPhase, useActiveTrip } from '../../data/activeTrip'
import { blendVibes, personaFor, vibeMatch } from '../../data/vibe'
import { useNavigate } from '../../hooks/navigation'
import { loadVibe } from '../../services/vibeStorage'
import type { CrowdLabel } from '../../services/heritageService'
import { tripsApi, type ItineraryDay, type ItineraryStop, type TripDetail } from '../../services/tripsService'
import { GreenTripCard } from '../Impact/GreenTripCard'
import { FestivalTip } from '../Events/FestivalTip'
import { TAG_PHOTOS } from '../Trip/tripDetailData'
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
          {trip && <FestivalTip trip={trip} />}
          {trip && <VibeCard trip={trip} hasPlan={!!itinerary?.some((d) => d.stops.length)} live={live} />}
          {trip && itinerary && <CrowdPlanCard trip={trip} days={itinerary} />}
          {trip && itinerary && <GreenTripCard tripId={trip.id} days={itinerary} />}
          {trip && itinerary ? <DayPlan trip={trip} days={itinerary} today={live?.day ?? null} /> : <Skeleton variant="card" height={220} />}
        </main>
      </ScreenLayout>
      <GhoomMateSays>Ask me “When is City Palace quietest?”</GhoomMateSays>
    </>
  )
}

/** `live` is which day of the trip it is today while the trip is live (the rating is for that day), else null */
function VibeCard({ trip, hasPlan, live }: { trip: TripDetail; hasPlan: boolean; live: { day: number; total: number } | null }) {
  const navigate = useNavigate()
  const [rating, setRating] = useState(4)
  // Your quiz result: saved on this device right after the quiz, otherwise from the trip's member list
  const me = trip.members.find((m) => m.memberId === trip.memberId)
  const youVibe = loadVibe() ?? blendVibes([me?.vibe])
  const vibes = trip.members.map((m) => ({ member: m, vibe: m.memberId === trip.memberId ? youVibe : blendVibes([m.vibe]) }))
  const waiting = vibes.filter((v) => !v.vibe).map((v) => v.member)
  const done = trip.members.length - waiting.length
  const progress = `${done} of ${trip.members.length} ${trip.members.length === 1 ? 'mate' : 'mates'} done`

  if (!youVibe) {
    return (
      <EmptyState
        headingLevel={2}
        title="What’s your travel vibe?"
        text={`Take the vibe quiz (8 quick cards) so GhoomMate can plan the trip around you. ${progress}.`}
        action={{ label: 'Take the vibe quiz', onClick: () => navigate('quiz') }}
      />
    )
  }

  // Everyone who has taken the quiz, blended
  const squadVibe = blendVibes(vibes.map((v) => v.vibe))!
  const firstNames = waiting.map((m) => m.name.split(' ')[0])

  return (
    <section className="card vibe-card">
      <div className="vibe-card__main">
        <div className="spiderweb">
          <VibeChart
            variant="compact"
            width={176}
            label="Squad spiderweb: your vibe compared with the squad"
            series={[
              { scores: squadVibe, color: 'var(--color-sky)', fillOpacity: 0.28 },
              { scores: youVibe, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true },
            ]}
          />
        </div>
        <div className="vibe-card__persona">
          <p className="overline vibe-card__overline">Squad spiderweb</p>
          <h2 className="vibe-card__persona-name">{personaFor(squadVibe)}</h2>
          <div className="vibe-card__legend">
            <span className="vibe-card__legend-item">
              <span className="vibe-card__swatch vibe-card__swatch--squad" />
              Squad
            </span>
            <span className="vibe-card__legend-item">
              <span className="vibe-card__swatch vibe-card__swatch--you" />
              You
            </span>
          </div>
          {done > 1 && <span className="vibe-card__match">{vibeMatch(youVibe, squadVibe)}% vibe match</span>}
        </div>
      </div>
      {waiting.length > 0 ? (
        <p className="vibe-card__status">
          <strong>{progress}.</strong> Waiting on {listNames(firstNames)} to take the vibe quiz before GhoomMate builds the plan.
        </p>
      ) : (
        <GeneratePlan trip={trip} hasPlan={hasPlan} />
      )}
      {live && (
        <div className="trip-feedback">
          <p className="trip-feedback__text">
            How was Day {live.day}? <span>{live.day < live.total ? 'Rate to tune tomorrow' : 'Rate the whole trip'}</span>
          </p>
          <div className="trip-feedback__stars" role="radiogroup" aria-label={`Rate Day ${live.day}`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                onClick={() => setRating(value)}
              >
                <img src={value <= rating ? iconStar : iconStarOutline} alt="" width={16} height={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** "Riya", "Riya and Kabir", "Riya, Kabir and Meera" */
const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** Once the whole squad has taken the quiz: asks GhoomMate for a plan from everyone's vibes and saves it as the itinerary. */
function GeneratePlan({ trip, hasPlan }: { trip: TripDetail; hasPlan: boolean }) {
  const [busy, setBusy] = useState(false)
  // Regenerating replaces the stops already planned, so it takes a second tap
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (hasPlan && !confirming) return setConfirming(true)
    setBusy(true)
    setError(null)
    try {
      const plan = await tripsApi.draft(trip.id)
      // Each slot lists GhoomMate's pick first, then alternatives
      const days = plan.days.map((d) => ({ title: d.title, stops: d.slots.flatMap((slot) => slot.slice(0, 1)) }))
      activeTrip.setItinerary(trip.id, await tripsApi.saveItinerary(trip.id, days))
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the plan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vibe-card__generate">
      <p className="vibe-card__status">
        {confirming
          ? 'This replaces the stops already planned. Tap again to go ahead.'
          : hasPlan
            ? 'The whole squad has taken the vibe quiz.'
            : 'The whole squad has taken the vibe quiz. Let GhoomMate build a plan around everyone’s interests.'}
      </p>
      <Button variant="primary" onClick={() => void generate()} disabled={busy}>
        {busy ? 'GhoomMate is planning…' : confirming ? 'Replace the plan' : hasPlan ? 'Regenerate itinerary' : 'Generate itinerary'}
      </Button>
      {error && (
        <p className="vibe-card__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function DayPlan({ trip, days, today }: { trip: TripDetail; days: ItineraryDay[]; today: number | null }) {
  const navigate = useNavigate()
  // Open on today while the trip is live
  const [dayNumber, setDayNumber] = useState(() => (today && today <= days.length ? today : 1))
  const day = days.find((d) => d.number === dayNumber) ?? days[0]
  if (!day) return null
  const title = `Day ${day.number} · ${tripDayLabel(trip.startDate, day.number)}`

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
            {day.stops.map((stop) => (
              <TimelineStop key={stop.id} tripId={trip.id} stop={stop} squadSize={trip.members.length} done={today !== null && day.number < today} />
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

function TimelineStop({ tripId, stop, squadSize, done }: { tripId: string; stop: ItineraryStop; squadSize: number; done: boolean }) {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)
  const reaction = stop.going.length === 0 ? 'No RSVPs yet' : stop.going.length === squadSize && squadSize > 1 ? 'Whole squad' : `${stop.going.length}/${squadSize} going`
  const crowd = stop.crowd
  const nudge = !done ? crowd?.suggestion : null
  const photo = (crowd && SITE_PHOTOS[crowd.siteId]) ?? TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill

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
    <li className="timeline__stop">
      <div className="timeline__rail" aria-hidden="true">
        <span className={`timeline__dot${done ? ' timeline__dot--done' : ''}`} />
        <span className="timeline__line" />
      </div>
      <div className="timeline__body">
        <article className="list-card stop-card">
          <img className="stop-card__photo" src={photo} alt="" width={52} height={52} />
          <div className="stop-card__info">
            <p className="stop-card__time">
              {stop.time || 'Anytime'}
              {crowd?.label && <CrowdChip label={crowd.label} />}
              {crowd?.gem && <span className="stop-card__gem">Hidden gem</span>}
            </p>
            <h3 className="stop-card__title">{stop.title}</h3>
            <div className="stop-card__people">
              <AvatarStack people={stop.going} size={18} overlap={6} />
              <span>{reaction}</span>
            </div>
          </div>
          {stop.tag && <span className="tag">{stop.tag}</span>}
          <button
            type="button"
            className="stop-card__open"
            aria-label={`Open ${stop.title}`}
            onClick={() => navigate(`trip/itinerary/stop/${stop.id}`)}
          />
        </article>
        {nudge && (
          <div className={`crowd-nudge crowd-nudge--${crowd!.label ?? 'moderate'}`}>
            <p className="crowd-nudge__text">
              <strong>
                {nudge.type === 'shift' ? `Go at ${nudge.time}` : `Try ${nudge.siteName}`}
              </strong>
              {nudge.reason}
            </p>
            <button type="button" className="pill-button crowd-nudge__action" disabled={moving} onClick={() => void move()}>
              {moving ? 'Moving…' : nudge.type === 'shift' ? 'Move' : 'Swap'}
            </button>
          </div>
        )}
      </div>
    </li>
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
