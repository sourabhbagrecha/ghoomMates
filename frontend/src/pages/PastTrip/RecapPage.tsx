import iconArrow from '../../assets/figma/icon-arrow-sky.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconFilm from '../../assets/figma/icon-film.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconPlay from '../../assets/figma/icon-play.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconShare from '../../assets/figma/icon-share-white.svg'
import tabExpenses from '../../assets/figma/tab-expenses-active.svg'
import tabItinerary from '../../assets/figma/tab-itinerary-active.svg'
import tabPhotos from '../../assets/figma/tab-photos-active.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { CoverLayout } from '../../components/CoverLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { Toast } from '../../components/Toast'
import { PEOPLE } from '../../data/people'
import { usePastTrips } from '../../data/pastTripStore'
import { useEntryRoute, useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { formatINR } from '../Trip/tripFormat'
import type { PastTripDetails } from './pastTripData'
import { StarRating } from './StarRating'
import './RecapPage.css'

export function RecapPage({ details }: { details: PastTripDetails }) {
  const navigate = useNavigate()
  // Opened from Home's past trips or Profile's places; back returns there
  const backTo = useEntryRoute('past')
  const { settled, ratings } = usePastTrips()
  const [toast, showToast] = useToast()
  const { trip } = details
  const base = `past/${trip.id}`
  const owed = settled.has(trip.id) ? [] : details.balances.filter((b) => b.from === 'you')
  const rating = ratings[trip.id]
  const total = details.expenses.reduce((sum, e) => sum + e.amount, 0)
  const stopCount = details.days.reduce((sum, d) => sum + d.stops.length, 0)

  const links = [
    { icon: tabPhotos, title: 'Album', detail: `${details.photoCount} photos · ${details.reel.clips}-clip reel`, to: 'album' },
    { icon: tabItinerary, title: 'Day by day', detail: `${details.days.length} days · ${stopCount} stops`, to: 'days' },
    { icon: tabExpenses, title: 'Expenses', detail: `${formatINR(total)} spent · ${owed.length ? 'not settled' : 'all settled'}`, to: 'expenses' },
  ]

  return (
    <>
      <CoverLayout
        cover={trip.cover}
        onBack={() => navigate(backTo)}
        overlay={<span className="recap__when">Trip recap · {trip.dates}</span>}
        bodyClassName="recap__body"
        actions={
          // TODO: prefill the create-trip flow with this squad
          <Button variant="primary" className="recap__again" onClick={() => navigate('create')}>
            <img src={iconPlus} alt="" width={16} height={16} />
            Plan another trip with this squad
          </Button>
        }
      >
        <section className="card recap__intro">
          <h1 className="recap__name">{trip.name}</h1>
          <p className="recap__meta">
            <img src={iconCalendar} alt="" width={14} height={14} />
            {details.dates}
            <img src={iconMapPin} alt="" width={14} height={14} />
            {trip.place}
          </p>
          <div className="recap__squad">
            <AvatarStack people={trip.members} size={26} overlap={9} />
            <span>
              {trip.group} · {trip.members.length} mates
            </span>
          </div>
          <p className="recap__persona">
            Squad vibe <strong>{details.persona}</strong>
          </p>
        </section>

        {owed.map((b) => (
          <button key={b.to} type="button" className="list-card recap__owed" onClick={() => navigate(`${base}/expenses`)}>
            <span className="recap__owed-people">
              <Avatar person={b.from} size={34} />
              <img src={iconArrow} alt="" width={16} height={16} />
              <Avatar person={b.to} size={34} />
            </span>
            <span className="recap__owed-text">
              <strong>
                You owe {PEOPLE[b.to].name} {formatINR(b.amount)}
              </strong>
              <span>Last bit left from this trip</span>
            </span>
            <span className="pill-button">Settle up</span>
          </button>
        ))}

        <section className="recap__reel">
          <img className="recap__reel-cover" src={details.photos[0].src} alt="" />
          <div className="recap__reel-info">
            <p className="overline recap__reel-overline">
              <img src={iconFilm} alt="" width={14} height={14} />
              Highlights reel
            </p>
            <h2 className="recap__reel-title">{details.reel.title}</h2>
            <p className="recap__reel-meta">GhoomMate cut {details.reel.clips} clips · 1:00</p>
            <div className="recap__reel-actions">
              {/* TODO: play and share the generated reel */}
              <button type="button" className="recap__reel-play" onClick={() => showToast('Playing your highlights reel')}>
                <img src={iconPlay} alt="" width={12} height={12} />
                Play
              </button>
              <button type="button" className="recap__reel-share" onClick={() => showToast('Share sheet coming soon')} aria-label="Share reel">
                <img src={iconShare} alt="" width={18} height={18} />
              </button>
            </div>
          </div>
        </section>

        <SectionHeader title="By the numbers" />
        <dl className="card recap__stats">
          {details.stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        <SectionHeader title="Squad awards" />
        <ul className="recap__awards">
          {details.awards.map((a) => (
            <li key={a.title} className="list-card recap__award">
              <Avatar person={a.person} size={40} />
              <span className="recap__award-text">
                <span className="overline">{a.title}</span>
                <strong>{PEOPLE[a.person].name}</strong>
                <span>{a.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <section className="card recap__rate">
          {rating ? (
            <>
              <p className="recap__rate-title">You rated it {rating} out of 5</p>
              <StarRating value={rating} size={20} label="Your rating" />
              <button type="button" className="text-link" onClick={() => navigate(`${base}/rate`)}>
                Edit rating
              </button>
            </>
          ) : (
            <>
              <p className="recap__rate-title">How was {trip.place}?</p>
              <p className="recap__rate-hint">Rate it and GhoomMate plans the next one better.</p>
              <StarRating value={0} size={28} label={`Rate ${trip.name}`} onChange={(s) => navigate(`${base}/rate/${s}`)} />
            </>
          )}
        </section>

        <SectionHeader title="Relive it" />
        <ul className="recap__links">
          {links.map((l) => (
            <li key={l.to}>
              <button type="button" className="list-card recap__link" onClick={() => navigate(`${base}/${l.to}`)}>
                <span className="recap__link-icon">
                  <img src={l.icon} alt="" width={22} height={22} />
                </span>
                <span className="recap__link-text">
                  <strong>{l.title}</strong>
                  <span>{l.detail}</span>
                </span>
                <img src={iconChevron} alt="" width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>

      </CoverLayout>
      <Toast message={toast} />
    </>
  )
}
