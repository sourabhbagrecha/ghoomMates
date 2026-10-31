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
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip, formatTripDates, tripDay, tripDayLabel, tripPhase, useActiveTrip } from '../../data/activeTrip'
import { blendVibes, personaFor, vibeMatch } from '../../data/vibe'
import { useNavigate } from '../../hooks/navigation'
import { loadVibe } from '../../services/vibeStorage'
import { tripsApi, type ItineraryDay, type ItineraryStop, type TripDetail } from '../../services/tripsService'
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
              <AvatarStack people={squad} size={26} overlap={9} />
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
          {trip && <VibeCard trip={trip} hasPlan={!!itinerary?.some((d) => d.stops.length)} live={!!live} />}
          {trip && itinerary ? <DayPlan trip={trip} days={itinerary} today={live?.day ?? null} /> : <Skeleton variant="card" height={220} />}
        </main>
      </ScreenLayout>
      <GhoomMateSays>Tap a stop to RSVP, or add your own to the plan!</GhoomMateSays>
    </>
  )
}

function VibeCard({ trip, hasPlan, live }: { trip: TripDetail; hasPlan: boolean; live: boolean }) {
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
            How was Day 1? <span>Rate to tune tomorrow</span>
          </p>
          <div className="trip-feedback__stars" role="radiogroup" aria-label="Rate Day 1">
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
              <TimelineStop key={stop.id} stop={stop} squadSize={trip.members.length} done={today !== null && day.number < today} />
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

function TimelineStop({ stop, squadSize, done }: { stop: ItineraryStop; squadSize: number; done: boolean }) {
  const navigate = useNavigate()
  const reaction = stop.going.length === 0 ? 'No RSVPs yet' : stop.going.length === squadSize && squadSize > 1 ? 'Whole squad' : `${stop.going.length}/${squadSize} going`

  return (
    <li className="timeline__stop">
      <div className="timeline__rail" aria-hidden="true">
        <span className={`timeline__dot${done ? ' timeline__dot--done' : ''}`} />
        <span className="timeline__line" />
      </div>
      <article className="list-card stop-card">
        <img className="stop-card__photo" src={TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill} alt="" width={52} height={52} />
        <div className="stop-card__info">
          <p className="stop-card__time">{stop.time || 'Anytime'}</p>
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
    </li>
  )
}
