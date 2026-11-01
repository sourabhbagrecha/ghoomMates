import { useMemo, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconArrowPrimary from '../../assets/figma/icon-arrow-primary.svg'
import iconFlame from '../../assets/figma/icon-flame.svg'
import iconMicPrimary from '../../assets/figma/icon-mic-primary.svg'
import iconSearch from '../../assets/figma/icon-search.svg'
import iconStarSmall from '../../assets/figma/icon-star-small.svg'
import iconUsers from '../../assets/figma/icon-users.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Chip } from '../../components/Chip'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { Toast } from '../../components/Toast'
import { useVoice } from '../../components/voice/voiceContext'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { FarmToTableSection } from '../Hospitality/FarmToTableSection'
import { StoriesOfMewar } from '../Stories/StoriesOfMewar'
import { PhotoCreditLine } from '../../components/PhotoCreditLine'
import { formatINR } from '../Trip/tripFormat'
import { CrowdPulse } from './CrowdPulse'
import { EventsSection } from '../Events/EventsSection'
import { MakersSection } from '../Makers/MakersSection'
import { CATEGORIES, TRENDING } from './exploreData'
import { nextRunLabel } from './experienceSchedule'
import { EXPERIENCES, experienceCityFor, type Experience, type ExperienceCity } from './experiencesData'
import './ExplorePage.css'

export function ExplorePage() {
  const [category, setCategory] = useState(CATEGORIES[0])
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const city = experienceCityFor(useActiveTrip().trip?.destination)
  // "Explore Udaipur" overruns the header buttons on a phone, so longer city names stand alone
  const title = city.length <= 5 ? `Explore ${city}` : city
  const openGuideTrip = (id: string) => navigate(`trip/explore/guide/${id}`)
  const guideTrips = useMemo(() => filterExperiences(city, category, query), [city, category, query])
  const voice = useVoice()
  const [toast, showToast] = useToast()

  return (
    <>
    <ScreenLayout headerBg={headerBg} headerHeight={170} eyebrow="Trending near your squad" title={title}>
      <div className="screen__header-row">
        <label className="search">
          <img src={iconSearch} alt="" width={18} height={18} />
          <input
            type="search"
            placeholder="Search spots, guides, vibes…"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="search__voice" aria-label="Search by voice" onClick={() => voice.open('Find food nearby')}>
            <img src={iconMicPrimary} alt="" width={18} height={18} />
          </button>
        </label>
      </div>

      <main className="screen__body">
        <div className="explore__categories no-scrollbar">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={c === category} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>

        {city === 'Udaipur' && <EventsSection />}
        {city === 'Udaipur' && <CrowdPulse city={city} />}
        {city === 'Udaipur' && <MakersSection />}
        {city === 'Udaipur' && <StoriesOfMewar />}

        <SectionHeader
          title="Trending this weekend"
          action={
            // TODO: full trending list once that screen exists
            <button type="button" className="text-link" onClick={() => showToast('More trending spots are coming soon')}>
              See all
            </button>
          }
        />
        <div className="trending no-scrollbar">
          {TRENDING[city].map((t) => (
            <article key={t.id} className="trend-card">
              {t.experienceId && (
                <button type="button" className="trend-card__open" aria-label={`Open ${t.title}`} onClick={() => openGuideTrip(t.experienceId!)} />
              )}
              <div className="trend-card__cover">
                <img src={t.photo} alt="" width={220} height={118} />
                <span className="trend-card__badge">
                  <img src={iconFlame} alt="" width={12} height={12} />
                  {t.badge}
                </span>
              </div>
              <div className="trend-card__body">
                <h3 className="trend-card__title">{t.title}</h3>
                <div className="trend-card__stats">
                  <AvatarStack people={t.people} size={18} overlap={6} />
                  <span>{t.stats}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {city === 'Udaipur' && <FarmToTableSection />}

        <SectionHeader
          title="Trips by local guides"
          action={
            // TODO: guide-trip filters (date, price, vibe)
            <button type="button" className="text-link" onClick={() => showToast('Guide filters are coming soon')}>
              Filters
            </button>
          }
        />
        {guideTrips.map((trip) => (
          <GuideTripCard key={trip.id} trip={trip} onOpen={() => openGuideTrip(trip.id)} />
        ))}
        {guideTrips.length === 0 && (
          <p className="guide-trips__empty">No guide trips match that yet. Try another vibe.</p>
        )}

        {/* TODO: the host / local guide side of the app */}
        <button type="button" className="host-banner" onClick={() => showToast('Hosting your own trips is coming soon')}>
          <span className="host-banner__icon">
            <img src={iconUsers} alt="" width={20} height={20} />
          </span>
          <span className="host-banner__text">
            <span className="host-banner__title">Local guide? Host your own trip</span>
            <span className="host-banner__subtitle">Reach squads that match your vibe</span>
          </span>
          <img src={iconArrowPrimary} alt="" width={18} height={18} />
        </button>
        <PhotoCreditLine from="trip/explore" />
      </main>
    </ScreenLayout>
    <Toast message={toast} />
    </>
  )
}

/** 'Trending' keeps every trip; a search matches title, area, host or tag */
function filterExperiences(city: ExperienceCity, category: string, query: string) {
  const q = query.trim().toLowerCase()
  return EXPERIENCES.filter(
    (e) =>
      e.city === city &&
      (category === CATEGORIES[0] || (e.tags as string[]).includes(category)) &&
      (!q || [e.title, e.area, e.host.name, ...e.tags].some((text) => text.toLowerCase().includes(q))),
  )
}

function GuideTripCard({ trip, onOpen }: { trip: Experience; onOpen: () => void }) {
  return (
    <article className="list-card guide-trip">
      <button type="button" className="guide-trip__open" aria-label={`Open ${trip.title}`} onClick={onOpen} />
      <div className="guide-trip__cover">
        <img src={trip.photos[0].src} alt={trip.photos[0].alt} width={78} height={86} loading="lazy" />
        <span className="guide-trip__host-avatar">
          <Avatar person={trip.host.id} size={26} />
        </span>
      </div>
      <div className="guide-trip__info">
        {trip.pick && <span className="guide-trip__pick">{trip.pick}</span>}
        <p className="guide-trip__host">
          Hosted by {trip.host.name.split(' ')[0]} ·
          <img src={iconStarSmall} alt="" width={11} height={11} />
          {trip.rating} ({trip.reviewCount})
        </p>
        <h3 className="guide-trip__title">{trip.title}</h3>
        <p className="guide-trip__details">
          {nextRunLabel(trip)} · {trip.duration} · {trip.area}
        </p>
        <div className="guide-trip__footer">
          <p className="guide-trip__price">
            {formatINR(trip.price)}
            <span> /person · {trip.seatsLeft} seats left</span>
          </p>
          <button type="button" className="guide-trip__join" onClick={onOpen}>
            Join
          </button>
        </div>
      </div>
    </article>
  )
}
