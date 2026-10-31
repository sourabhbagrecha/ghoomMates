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
import { LIVE_TRIP, PAST_TRIPS, TODAY, UPCOMING_TRIPS, type Trip } from '../../data/trips'
import { useNavigate } from '../../hooks/navigation'
import { DAYS } from '../Itinerary/itineraryData'
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

const nextStop = DAYS.flatMap((d) => d.stops).find((s) => s.id === LIVE_TRIP.nextStopId)

type HomePageProps = {
  name: string | null
  unread: number
  /** No trips yet: first-run state */
  empty?: boolean
  onOpenNotifications: () => void
  onOpenTrip: (tab: TabId) => void
  onHaveInvite: () => void
}

export function HomePage({ name, unread, empty, onOpenNotifications, onOpenTrip, onHaveInvite }: HomePageProps) {
  const navigate = useNavigate()
  const planTrip = () => navigate('create')

  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={210}
        eyebrow={TODAY}
        title={`Hey ${name ?? 'there'}`}
        actions={<HeaderActions leading={<NotificationsButton unread={unread} onClick={onOpenNotifications} />} />}
      >
        <div className="screen__header-row">
          <p className="home__greeting">
            <GhoomMateAvatar size={32} ring={2} />
            {empty
              ? 'I’m GhoomMate! Tell me where you want to go and I’ll draft a plan for your squad.'
              : `Day ${LIVE_TRIP.day} in Goa! Next up: ${nextStop?.title} at ${nextStop?.time}.`}
          </p>
        </div>

        <main className="screen__body">
          {empty ? <EmptyHome onPlanTrip={planTrip} onHaveInvite={onHaveInvite} /> : <Trips onOpenTrip={onOpenTrip} onOpenPlan={() => navigate('plan')} />}
        </main>
      </ScreenLayout>

      {empty ? (
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

function Trips({ onOpenTrip, onOpenPlan }: { onOpenTrip: (tab: TabId) => void; onOpenPlan: () => void }) {
  return (
    <>
      <section className="card live-trip" aria-label={`${LIVE_TRIP.name}, happening now`}>
        <div className="live-trip__cover">
          <img src={LIVE_TRIP.cover} alt="" width={220} height={118} />
          <span className="live-trip__badge">
            <span className="live-trip__pulse" />
            Live · Day {LIVE_TRIP.day} of {LIVE_TRIP.totalDays}
          </span>
        </div>
        <div className="live-trip__title-row">
          <div>
            <h2 className="live-trip__name">{LIVE_TRIP.name}</h2>
            <p className="live-trip__meta">
              <img src={iconCalendar} alt="" width={14} height={14} />
              {LIVE_TRIP.dates}
            </p>
          </div>
          <AvatarStack people={LIVE_TRIP.members} size={26} overlap={9} />
        </div>
        {nextStop && (
          <div className="live-trip__next">
            <img src={nextStop.photo} alt="" width={40} height={40} />
            <div className="live-trip__next-info">
              <p className="overline">Next up · {nextStop.time}</p>
              <p className="live-trip__next-title">{nextStop.title}</p>
            </div>
            <span className="tag">{nextStop.tag}</span>
          </div>
        )}
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

      <SectionHeader title="Coming up" />
      <ul className="trip-list">
        {UPCOMING_TRIPS.map((t) => (
          // Only the Manali trip has planning screens so far
          <UpcomingTrip key={t.id} trip={t} onOpen={t.id === 'manali' ? onOpenPlan : undefined} />
        ))}
      </ul>

      <SectionHeader title="Past trips" />
      <ul className="past-trips no-scrollbar">
        {PAST_TRIPS.map((t) => (
          <li key={t.id} className="past-trip">
            <img className="past-trip__cover" src={t.cover} alt="" width={116} height={110} />
            <div className="past-trip__body">
              <p className="past-trip__name">{t.name}</p>
              <p className="past-trip__meta">
                {t.dates} · {t.note}
              </p>
              {t.balance ? (
                <p className="past-trip__owed">{t.balance} to settle</p>
              ) : (
                <p className="past-trip__settled">
                  <img src={iconCheck} alt="" width={12} height={12} />
                  All settled
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function UpcomingTrip({ trip, onOpen }: { trip: Trip; onOpen?: () => void }) {
  const planning = trip.status === 'planning'
  const content = (
    <>
      <img className="trip-row__cover" src={trip.cover} alt="" width={116} height={110} />
      <div className="trip-row__info">
        <p className="trip-row__name">{trip.name}</p>
        <p className="trip-row__meta">
          {trip.dates} · {trip.startsIn}
        </p>
        <p className="trip-row__status">
          <span className="tag">{planning ? 'Planning' : 'Booked'}</span>
          <span className={planning ? 'trip-row__note--action' : undefined}>{trip.note}</span>
        </p>
      </div>
      <AvatarStack people={trip.members} size={18} overlap={6} />
    </>
  )
  return (
    <li>
      {onOpen ? (
        <button type="button" className="list-card trip-row trip-row--button" onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="list-card trip-row">{content}</div>
      )}
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
