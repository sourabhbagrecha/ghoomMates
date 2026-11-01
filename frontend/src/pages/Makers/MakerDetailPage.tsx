import { useEffect, useState } from 'react'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconContact from '../../assets/figma/icon-contact-primary.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconPinTile from '../../assets/figma/icon-perm-map-pin.svg'
import iconNavigation from '../../assets/figma/icon-navigation-white.svg'
import iconShield from '../../assets/figma/icon-shield-primary.svg'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import iconX from '../../assets/icons/icon-x-muted.svg'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { CoverLayout } from '../../components/CoverLayout'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { tripDayLabel, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { makersApi, useTripBookings, type MakerDetail } from '../../services/makersService'
import { formatINR, listNames } from '../Trip/tripFormat'
import { AskMaker } from './AskMaker'
import { BookingSheet } from './BookingSheet'
import { PriceChecker } from './PriceChecker'
import { backTarget, closedLabel, durationLabel, firstName, groupLabel, hashParams, nextHeritageStop, openDirections, routeLabel, scheduleLabel } from './makersData'
import './MakerDetailPage.css'

type Load = { status: 'loading' } | { status: 'ready'; maker: MakerDetail } | { status: 'missing' } | { status: 'error'; message: string }

/** One maker: their story, the craft, how to spot the real thing, a fair-price checker and a workshop the squad can book. */
export function MakerDetailPage({ makerId }: { makerId: string }) {
  const navigate = useNavigate()
  const { trip, itinerary } = useActiveTrip()
  const bookings = useTripBookings(trip?.id)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [craftIndex, setCraftIndex] = useState(0)
  const [booking, setBooking] = useState(false)
  const [toast, showToast] = useToast(3600)
  const near = hashParams().get('near')
  const back = () => navigate(backTarget(`trip/explore/makers${near ? `?near=${near}` : ''}`))

  useEffect(() => {
    let stale = false
    makersApi
      .get(makerId, near)
      .then((maker) => !stale && setLoad({ status: 'ready', maker }))
      .catch((err) => !stale && setLoad(err?.status === 404 ? { status: 'missing' } : { status: 'error', message: err instanceof Error ? err.message : '' }))
    return () => {
      stale = true
    }
  }, [makerId, near, attempt])

  if (load.status !== 'ready') {
    return (
      <OnboardingLayout eyebrow="Makers of Udaipur" title="Meet the maker" onBack={back} headerBg={headerBg} headerHeight={170} bodyClassName="maker-detail__plain">
        {load.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading the maker">
            <Skeleton variant="card" height={160} />
          </div>
        )}
        {load.status === 'missing' && (
          <EmptyState title="We can’t find that maker" text="They may have moved on. Have a look at everyone else." action={{ label: 'See all makers', onClick: () => navigate('trip/explore/makers') }} />
        )}
        {load.status === 'error' && (
          <ErrorState
            title="Couldn’t load this maker"
            text="Check your connection and give it another go."
            detail={load.message}
            onRetry={() => {
              setLoad({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          />
        )}
      </OnboardingLayout>
    )
  }

  const { maker } = load
  const craft = maker.craftDetails[craftIndex] ?? maker.craftDetails[0]
  const main = maker.craftDetails[0]
  const route = maker.fromSite ?? maker.nearest
  const who = firstName(maker.name)
  const { workshop } = maker
  const booked = bookings?.find((b) => b.makerId === maker.id)
  const closed = closedLabel(maker.closedDates)
  // Book on the day the squad is nearby: the stop they came from, else their next heritage stop
  const fromStop = /^trip\/itinerary\/stop\/([\w-]+)$/.exec(hashParams().get('from') ?? '')?.[1]
  const preferredDay = (fromStop && itinerary?.flatMap((d) => d.stops).find((s) => s.id === fromStop)?.dayNumber) || nextHeritageStop(trip, itinerary)?.dayNumber
  const initials = maker.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

  return (
    <>
      <CoverLayout
        cover={main.cover}
        onBack={back}
        overlay={
          <>
            <span className="tag">{main.name}</span>
            {maker.craftDetails.some((c) => c.gi) && <span className="tag maker-detail__gi">GI tag</span>}
          </>
        }
        bodyClassName="maker-detail__body"
        actions={
          booked ? (
            <>
              <p className="maker-detail__booked" role="status">
                <img src={iconCheck} alt="" width={14} height={14} />
                Booked · {trip ? tripDayLabel(trip.startDate, booked.dayNumber) : `Day ${booked.dayNumber}`} · {booked.slot} · {booked.people} people
              </p>
              <Button variant="primary" onClick={() => navigate(booked.stopId ? `trip/itinerary/stop/${booked.stopId}` : 'trip/itinerary')}>
                See it in your itinerary
              </Button>
              <LinkButton onClick={() => setBooking(true)}>Book another session</LinkButton>
            </>
          ) : (
            <>
              <p className="maker-detail__hint">
                {formatINR(workshop.pricePerPerson)} /person · {durationLabel(workshop.durationMin)} · {groupLabel(workshop)}
              </p>
              <Button variant="primary" disabled={!trip} onClick={() => setBooking(true)}>
                {trip ? `Book for the squad${trip.members.length > 1 ? ` of ${Math.min(trip.members.length, workshop.maxPeople)}` : ''}` : 'Open a trip to book'}
              </Button>
            </>
          )
        }
      >
        <section className="card maker-summary">
          <div className="maker-summary__top">
            <span className="maker-summary__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="maker-summary__titles">
              <h1 className="maker-summary__name">{maker.name}</h1>
              <p className="maker-summary__craft">{listNames(maker.crafts.map((c) => c.name))}</p>
            </div>
          </div>
          <div className="maker-summary__tags">
            {maker.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
          <ul className="maker-summary__facts">
            <li>
              <img src={iconMapPin} alt="" width={14} height={14} />
              <span>
                {maker.area} · {routeLabel(route, true)}
              </span>
            </li>
            <li>
              <img src={iconClock} alt="" width={14} height={14} />
              <span>
                {durationLabel(workshop.durationMin)} workshop · {groupLabel(workshop)}
              </span>
            </li>
            <li>
              <img src={iconContact} alt="" width={14} height={14} />
              <span>
                {maker.generation > 1 ? `${maker.generation} generations · ` : ''}
                {maker.yearsWorking} years at the craft · speaks {listNames(maker.languages)}
              </span>
            </li>
          </ul>
          <p className="maker-summary__price">
            {formatINR(workshop.pricePerPerson)}
            <span> /person · pay {who} directly</span>
          </p>
        </section>

        <section className="card maker-block">
          <h2 className="overline">Their story</h2>
          <p className="maker-text">{maker.story}</p>
        </section>

        <section className="card maker-block">
          <div className="maker-block__head">
            <h2 className="overline">About the craft</h2>
            {craft.gi && <span className="maker-craft__gi">GI-tagged</span>}
          </div>
          {maker.craftDetails.length > 1 && (
            <div className="maker-detail__crafts no-scrollbar">
              {maker.craftDetails.map((c, i) => (
                <Chip key={c.id} selected={i === craftIndex} onClick={() => setCraftIndex(i)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
          <h3 className="maker-craft__name">
            {craft.name} <span>{craft.hindi}</span>
          </h3>
          <p className="maker-text">{craft.history}</p>
          {craft.gi && (
            <p className="maker-craft__gi-note">
              <img src={iconShield} alt="" width={16} height={16} />
              <span>
                Registered as “{craft.gi.name}”{craft.gi.year ? ` (${craft.gi.year})` : ''}. A GI tag protects a craft’s name and where it comes from.
              </span>
            </p>
          )}
          <h3 className="overline maker-craft__steps-title">How it’s made</h3>
          <ol className="maker-steps">
            {craft.steps.map((step, i) => (
              <li key={step}>
                <span className="maker-steps__number" aria-hidden="true">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="card maker-spot">
          <h2 className="overline">How to spot the real thing</h2>
          <div className="maker-spot__group">
            <h3 className="maker-spot__title">Handmade looks like</h3>
            <ul>
              {craft.authentic.map((item) => (
                <li key={item}>
                  <img src={iconCheck} alt="" width={14} height={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="maker-spot__group maker-spot__group--machine">
            <h3 className="maker-spot__title">Machine-made looks like</h3>
            <ul>
              {craft.machineMade.map((item) => (
                <li key={item}>
                  <img src={iconX} alt="" width={14} height={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <PriceChecker key={`price-${maker.id}`} crafts={maker.craftDetails} defaultCraftId={craft.id} />

        <section className="card maker-workshop">
          <h2 className="overline">The workshop</h2>
          <h3 className="maker-workshop__title">{workshop.title}</h3>
          <p className="maker-text maker-text--soft">{workshop.blurb}</p>
          <dl className="maker-workshop__facts">
            <div>
              <dt>Time</dt>
              <dd>{durationLabel(workshop.durationMin)}</dd>
            </div>
            <div>
              <dt>Per person</dt>
              <dd>{formatINR(workshop.pricePerPerson)}</dd>
            </div>
            <div>
              <dt>Group</dt>
              <dd>
                {workshop.minPeople}–{workshop.maxPeople}
              </dd>
            </div>
          </dl>
          <p className="maker-workshop__makes">
            <strong>You take away</strong>
            {workshop.makes}
          </p>
          <p className="maker-workshop__line">
            <img src={iconCalendar} alt="" width={14} height={14} />
            {scheduleLabel(workshop.weekly)}
          </p>
          <p className="maker-workshop__line">
            <img src={iconUsers} alt="" width={14} height={14} />
            Ages {workshop.minAge}+{closed && ` · closed on ${closed}`}
          </p>
        </section>

        <AskMaker key={`ask-${maker.id}`} maker={maker} />

        <section className="card maker-map">
          <div className="maker-map__art" aria-hidden="true">
            <span className="maker-map__pin">
              <img src={iconPinTile} alt="" width={22} height={22} />
            </span>
          </div>
          <div className="maker-map__row">
            <div className="maker-map__text">
              <p className="maker-map__place">{maker.studio}</p>
              <p className="maker-map__away">
                {maker.area} · {routeLabel(route, true)}
              </p>
            </div>
            <button type="button" className="pill-button" onClick={() => openDirections(maker, route.mode)}>
              <img src={iconNavigation} alt="" width={14} height={14} />
              Directions
            </button>
          </div>
        </section>

        <p className="maker-detail__footnote">
          {maker.name} is a sample partner: the profile is made up for the demo, while the craft, the places and the facts are real. Prices and times are estimates.
        </p>
      </CoverLayout>

      {booking && trip && (
        <BookingSheet
          maker={maker}
          trip={trip}
          days={itinerary}
          preferredDay={preferredDay || undefined}
          onClose={() => setBooking(false)}
          onBooked={(made) => {
            setBooking(false)
            showToast(`Booked! ${who}’s workshop is on Day ${made.dayNumber} of your itinerary`)
          }}
        />
      )}
      <Toast message={toast} />
    </>
  )
}
