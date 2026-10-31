import { useState } from 'react'
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
import { useNavigate } from '../../hooks/navigation'
import { CATEGORIES, GUIDE_TRIP, TRENDING } from './exploreData'
import './ExplorePage.css'

export function ExplorePage() {
  const [category, setCategory] = useState(CATEGORIES[0])
  const navigate = useNavigate()
  const openGuideTrip = () => navigate('trip/explore/guide')

  return (
    <ScreenLayout headerBg={headerBg} headerHeight={170} eyebrow="Trending near your squad" title="Explore Goa">
      <div className="screen__header-row">
        <label className="search">
          <img src={iconSearch} alt="" width={18} height={18} />
          <input type="search" placeholder="Search spots, guides, vibes…" aria-label="Search" />
          <button type="button" className="search__voice" aria-label="Search by voice">
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

        <SectionHeader
          title="Trending this weekend"
          action={
            <button type="button" className="text-link">
              See all
            </button>
          }
        />
        <div className="trending no-scrollbar">
          {TRENDING.map((t) => (
            <article key={t.id} className="trend-card">
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

        <SectionHeader
          title="Trips by local guides"
          action={
            <button type="button" className="text-link">
              Filters
            </button>
          }
        />
        <article className="list-card guide-trip">
          <button type="button" className="guide-trip__open" aria-label={`Open ${GUIDE_TRIP.title}`} onClick={openGuideTrip} />
          <div className="guide-trip__cover">
            <img src={GUIDE_TRIP.photo} alt="" width={78} height={86} />
            <span className="guide-trip__host-avatar">
              <Avatar person={GUIDE_TRIP.hostAvatar} size={26} />
            </span>
          </div>
          <div className="guide-trip__info">
            <span className="guide-trip__pick">{GUIDE_TRIP.pick}</span>
            <p className="guide-trip__host">
              Hosted by {GUIDE_TRIP.host} ·
              <img src={iconStarSmall} alt="" width={11} height={11} />
              {GUIDE_TRIP.rating}
            </p>
            <h3 className="guide-trip__title">{GUIDE_TRIP.title}</h3>
            <p className="guide-trip__details">{GUIDE_TRIP.details}</p>
            <div className="guide-trip__footer">
              <p className="guide-trip__price">
                {GUIDE_TRIP.price}
                <span> /person · {GUIDE_TRIP.seatsLeft} seats left</span>
              </p>
              <button type="button" className="guide-trip__join" onClick={openGuideTrip}>
                Join
              </button>
            </div>
          </div>
        </article>

        <button type="button" className="host-banner">
          <span className="host-banner__icon">
            <img src={iconUsers} alt="" width={20} height={20} />
          </span>
          <span className="host-banner__text">
            <span className="host-banner__title">Local guide? Host your own trip</span>
            <span className="host-banner__subtitle">Reach squads that match your vibe</span>
          </span>
          <img src={iconArrowPrimary} alt="" width={18} height={18} />
        </button>
      </main>
    </ScreenLayout>
  )
}
