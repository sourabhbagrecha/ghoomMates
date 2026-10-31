import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import tabExpenses from '../../assets/figma/tab-expenses-active.svg'
import tabExplore from '../../assets/figma/tab-explore-active.svg'
import tabItinerary from '../../assets/figma/tab-itinerary-active.svg'
import tabPhotos from '../../assets/figma/tab-photos-active.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { HeaderActions, NotificationsButton } from '../../components/HeaderActions'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import type { TabId } from '../../components/TabBar'
import { daysUntil, formatTripDates, tripDay, tripPhase, useMyTrips } from '../../data/activeTrip'
import { usePastTrips } from '../../data/pastTripStore'
import { tripCover } from '../../data/tripCover'
import { PAST_TRIPS, UPCOMING_TRIPS } from '../../data/trips'
import { useNavigate } from '../../hooks/navigation'
import type { AuthUser } from '../../services/authService'
import type { TripListItem } from '../../services/tripsService'
import { formatINR } from '../Trip/tripFormat'
import './HomePage.css'

const SHORTCUTS: { tab: TabId; label: string; icon: string }[] = [
  { tab: 'itinerary', label: 'Itinerary', icon: tabItinerary },
  { tab: 'photos', label: 'Photos', icon: tabPhotos },
  { tab: 'expenses', label: 'Expenses', icon: tabExpenses },
  { tab: 'explore', label: 'Explore', icon: tabExplore },
]

const IDEAS = [
  { name: 'Goa beaches', details: '4 days · from ₹12k', photo: photoVagator },
  { name: 'Manali in the snow', details: '5 days · from ₹18k', photo: grid1 },
  { name: 'Rishikesh rafting', details: '3 days · from ₹9k', photo: grid3 },
]

const todayLabel = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

type HomePageProps = {
  name: string | null
  unread: number
  /** No trips yet: first-run state */
  empty?: boolean
  user?: AuthUser | null
  onOpenNotifications: () => void
  onOpenTrip: (tripId: string, tab: TabId) => void
  onHaveInvite: () => void
}

export function HomePage({
  name,
  unread,
  empty,
  user,
  onOpenNotifications,
  onOpenTrip,
  onHaveInvite,
}: HomePageProps) {
  const navigate = useNavigate()
  const planTrip = () => navigate('create')
  const { trips, error } = useMyTrips(!!user)
  // #/home/empty previews the first-run state; otherwise it follows your real trips
  const noTrips = empty || (trips !== null && trips.length === 0)
  const live = trips?.find((t) => tripPhase(t) === 'live')

  const displayName = user?.name?.split(' ')[0] || name || 'there'
  let greeting = 'I’m GhoomMate! Tell me where you want to go and I’ll draft a plan for your squad.'
  if (!noTrips && live) {
    const day = tripDay(live)
    greeting = `Day ${day?.day} of ${live.name}! Add today’s spends and photos as you go.`
  } else if (!noTrips && trips?.length) {
    const next = trips.filter((t) => tripPhase(t) === 'upcoming')[0]
    const days = next ? daysUntil(next.startDate) : null
    greeting = next
      ? `${next.name} ${days !== null ? `is ${days === 1 ? 'tomorrow' : `in ${days} days`}` : 'is coming up'}. Invite the squad and start planning!`
      : 'Welcome back! Plan the next one whenever you’re ready.'
  }

  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={210}
        eyebrow={todayLabel()}
        title={`Hey ${displayName}`}
        actions={
          <HeaderActions leading={<NotificationsButton unread={unread} onClick={onOpenNotifications} />} />
        }
      >
        <div className="screen__header-row">
          <p className="home__greeting">
            <GhoomMateAvatar size={32} ring={2} />
            {greeting}
          </p>
        </div>

        <main className="screen__body">
          {error && !trips && <p className="home__error" role="alert">{error}</p>}
          {noTrips ? (
            <EmptyHome onPlanTrip={planTrip} onHaveInvite={onHaveInvite} />
          ) : (
            <Trips trips={trips ?? []} onOpenTrip={onOpenTrip} onOpenPlan={() => navigate('plan')} />
          )}
        </main>
      </ScreenLayout>

      {noTrips ? (
        <span className="home-indicator" aria-hidden="true" />
      ) : (
        <div className="home__actions">
          <Button variant="primary" onClick={planTrip}>
            <img src={iconPlus} alt="" width={16} height={16} />
            Plan a new trip
          </Button>
          <span className="home-indicator" aria-hidden="true" />
        </div>
      )}
    </>
  )
}

type TripsProps = {
  trips: TripListItem[]
  onOpenTrip: (tripId: string, tab: TabId) => void
  onOpenPlan: () => void
}

function Trips({ trips, onOpenTrip, onOpenPlan }: TripsProps) {
  const navigate = useNavigate()
  const { settled } = usePastTrips()
  const live = trips.filter((t) => tripPhase(t) === 'live')
  const upcoming = trips.filter((t) => tripPhase(t) === 'upcoming').reverse()
  const past = trips.filter((t) => tripPhase(t) === 'past')

  return (
    <>
      {live.map((t) => (
        <LiveTrip key={t.id} trip={t} onOpenTrip={(tab) => onOpenTrip(t.id, tab)} />
      ))}

      {upcoming.length > 0 && (
        <>
          <SectionHeader title="Coming up" />
          <ul className="trip-list">
            {upcoming.map((t) => (
              <UpcomingTrip key={t.id} trip={t} onOpen={() => onOpenTrip(t.id, 'itinerary')} />
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionHeader title="Past trips" />
          <ul className="past-trips no-scrollbar">
            {past.map((t) => (
              <li key={t.id}>
                <button type="button" className="past-trip past-trip--button" onClick={() => onOpenTrip(t.id, 'expenses')}>
                  <img className="past-trip__cover" src={tripCover(t)} alt="" width={116} height={110} />
                  <div className="past-trip__body">
                    <p className="past-trip__name">{t.name}</p>
                    <p className="past-trip__meta">
                      {formatTripDates(t)} · {t.photoCount} pics
                    </p>
                    <OwedLine balancePaise={t.myBalancePaise} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The sample trips show the planning and recap screens that aren't backed by real data yet */}
      <SectionHeader title="Sample trips" />
      <ul className="trip-list">
        {UPCOMING_TRIPS.filter((t) => t.id === 'manali').map((t) => (
          <li key={t.id}>
            <button type="button" className="list-card trip-row trip-row--button" onClick={onOpenPlan}>
              <img className="trip-row__cover" src={t.cover} alt="" width={116} height={110} />
              <div className="trip-row__info">
                <p className="trip-row__name">{t.name}</p>
                <p className="trip-row__meta">
                  {t.dates} · {t.startsIn}
                </p>
                <p className="trip-row__status">
                  <span className="tag">Planning</span>
                  <span className="trip-row__note--action">{t.note}</span>
                </p>
              </div>
              <AvatarStack people={t.members} size={18} overlap={6} />
            </button>
          </li>
        ))}
      </ul>
      <ul className="past-trips no-scrollbar">
        {PAST_TRIPS.map((t) => (
          <li key={t.id}>
            <button type="button" className="past-trip past-trip--button" onClick={() => navigate(`past/${t.id}`)}>
              <img className="past-trip__cover" src={t.cover} alt="" width={116} height={110} />
              <div className="past-trip__body">
                <p className="past-trip__name">{t.name}</p>
                <p className="past-trip__meta">
                  {t.dates} · {t.note}
                </p>
                {t.balance && !settled.has(t.id) ? (
                  <p className="past-trip__owed">{t.balance} to settle</p>
                ) : (
                  <p className="past-trip__settled">
                    <img src={iconCheck} alt="" width={12} height={12} />
                    All settled
                  </p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function OwedLine({ balancePaise }: { balancePaise: number }) {
  if (balancePaise < 0) return <p className="past-trip__owed">{formatINR(-balancePaise / 100)} to settle</p>
  if (balancePaise > 0) return <p className="past-trip__settled">{formatINR(balancePaise / 100)} owed to you</p>
  return (
    <p className="past-trip__settled">
      <img src={iconCheck} alt="" width={12} height={12} />
      All settled
    </p>
  )
}

function LiveTrip({ trip, onOpenTrip }: { trip: TripListItem; onOpenTrip: (tab: TabId) => void }) {
  const day = tripDay(trip)
  const spent = trip.totalSpentPaise
  return (
    <section className="card live-trip" aria-label={`${trip.name}, happening now`}>
      {/* Whole card opens the trip; the shortcuts sit above this and open a specific tab */}
      <button type="button" className="live-trip__open" aria-label={`Open ${trip.name}`} onClick={() => onOpenTrip('itinerary')} />
      <div className="live-trip__cover">
        <img src={tripCover(trip)} alt="" width={220} height={118} />
        <span className="live-trip__badge">
          <span className="live-trip__pulse" />
          Live · Day {day?.day} of {day?.total}
        </span>
      </div>
      <div className="live-trip__title-row">
        <div>
          <h2 className="live-trip__name">{trip.name}</h2>
          <p className="live-trip__meta">
            <img src={iconCalendar} alt="" width={14} height={14} />
            {formatTripDates(trip)}
          </p>
        </div>
        <AvatarStack people={trip.members.map((m) => m.memberId)} size={26} overlap={9} />
      </div>
      <div className="live-trip__next">
        <div className="live-trip__next-info">
          <p className="overline">{trip.groupName} · {trip.memberCount} {trip.memberCount === 1 ? 'mate' : 'mates'}</p>
          <p className="live-trip__next-title">
            {spent ? `${formatINR(spent / 100)} spent so far` : 'No spends yet'} · {trip.photoCount} pics
          </p>
        </div>
        {trip.myBalancePaise !== 0 && (
          <span className="tag">
            {trip.myBalancePaise < 0 ? `You owe ${formatINR(-trip.myBalancePaise / 100)}` : `${formatINR(trip.myBalancePaise / 100)} to you`}
          </span>
        )}
      </div>
      <nav className="live-trip__shortcuts" aria-label="Open trip">
        {SHORTCUTS.map((s) => (
          <button key={s.tab} type="button" onClick={() => onOpenTrip(s.tab)}>
            <span className="live-trip__shortcut-icon">
              <img src={s.icon} alt="" width={22} height={22} />
            </span>
            {s.label}
          </button>
        ))}
      </nav>
    </section>
  )
}

function UpcomingTrip({ trip, onOpen }: { trip: TripListItem; onOpen: () => void }) {
  const days = daysUntil(trip.startDate)
  return (
    <li>
      <button type="button" className="list-card trip-row trip-row--button" onClick={onOpen}>
        <img className="trip-row__cover" src={tripCover(trip)} alt="" width={116} height={110} />
        <div className="trip-row__info">
          <p className="trip-row__name">{trip.name}</p>
          <p className="trip-row__meta">
            {formatTripDates(trip)}
            {days !== null && ` · In ${days} ${days === 1 ? 'day' : 'days'}`}
          </p>
          <p className="trip-row__status">
            <span className="tag">Planning</span>
            <span className="trip-row__note--action">
              {trip.memberCount === 1 ? 'Invite your squad' : `${trip.memberCount} mates in`}
            </span>
          </p>
        </div>
        <AvatarStack people={trip.members.map((m) => m.memberId)} size={18} overlap={6} />
      </button>
    </li>
  )
}

function EmptyHome({ onPlanTrip, onHaveInvite }: { onPlanTrip: () => void; onHaveInvite: () => void }) {
  return (
    <>
      <section className="card home-empty">
        <GhoomMateAvatar size={112} ring={4} />
        <h2 className="home-empty__title">No trips yet</h2>
        <p className="home-empty__text">Plan one with your squad, or jump into a trip a friend invited you to.</p>
        <Button variant="primary" onClick={onPlanTrip}>
          <img src={iconPlus} alt="" width={16} height={16} />
          Plan your first trip
        </Button>
        <Button variant="outline" onClick={onHaveInvite}>
          I have an invite link
        </Button>
      </section>

      <SectionHeader title="Need ideas?" />
      <ul className="past-trips no-scrollbar">
        {IDEAS.map((idea) => (
          <li key={idea.name} className="past-trip">
            <img className="past-trip__cover" src={idea.photo} alt="" width={116} height={110} />
            <div className="past-trip__body">
              <p className="past-trip__name">{idea.name}</p>
              <p className="past-trip__meta">{idea.details}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
