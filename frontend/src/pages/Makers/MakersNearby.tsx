import { useEffect, useState } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconNavigation from '../../assets/figma/icon-navigation-white.svg'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { makersApi, useTripBookings, type Booking, type MakerList } from '../../services/makersService'
import type { ItineraryStop } from '../../services/tripsService'
import { formatINR } from '../Trip/tripFormat'
import { firstName, minutesLabel, openDirections } from './makersData'
import './MakersNearby.css'

/** Within about this far of the stop, in a straight line */
const NEARBY_KM = 1.5

/**
 * On the stop screen: for a heritage stop, the makers within a short walk (learn or buy straight from them); for the
 * stop a workshop booking created, the details of that workshop. Renders nothing for any other stop, or if the makers
 * can't be loaded.
 */
export function MakersNearby({ stop }: { stop: ItineraryStop }) {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const bookings = useTripBookings(trip?.id)
  const siteId = stop.crowd?.siteId ?? null
  const [nearby, setNearby] = useState<MakerList | null>(null)
  const here = `trip/itinerary/stop/${stop.id}`

  useEffect(() => {
    if (!siteId) return
    let stale = false
    makersApi
      .list({ near: siteId, maxKm: NEARBY_KM })
      .then((list) => !stale && setNearby(list))
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [siteId])

  const booked = bookings?.find((b) => b.stopId === stop.id)
  if (booked) return <YourWorkshop booking={booked} onOpen={() => navigate(`trip/explore/makers/${booked.makerId}?from=${here}`)} />
  if (!siteId || !nearby || nearby.items.length === 0) return null

  const shown = nearby.items.slice(0, 3)
  return (
    <section className="card makers-nearby">
      <div className="makers-nearby__head">
        <h2 className="overline">Makers nearby</h2>
        <button type="button" className="text-link" onClick={() => navigate(`trip/explore/makers?near=${siteId}&from=${here}`)}>
          See all {nearby.items.length}
        </button>
      </div>
      <p className="makers-nearby__lead">Craft families a short walk away. Learn or buy direct and the money stays with the maker.</p>
      <ul className="makers-nearby__list">
        {shown.map((maker) => {
          const main = maker.crafts[0]
          return (
            <li key={maker.id}>
              <button type="button" className="nearby-maker" onClick={() => navigate(`trip/explore/makers/${maker.id}?near=${siteId}&from=${here}`)}>
                <img className="nearby-maker__cover" src={main.cover} alt="" width={52} height={52} loading="lazy" />
                <span className="nearby-maker__text">
                  <span className="nearby-maker__name">{maker.name}</span>
                  <span className="nearby-maker__craft">{main.name}</span>
                  <span className="nearby-maker__where">
                    {maker.fromSite ? `${minutesLabel(maker.fromSite.minutes)} walk` : maker.area}
                    {maker.tags[0] ? ` · ${maker.tags[0]}` : ''}
                  </span>
                </span>
                <span className="nearby-maker__price">
                  {formatINR(maker.workshop.pricePerPerson)}
                  <small>/person</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The workshop this stop is: who, how many, how much, and the way there */
function YourWorkshop({ booking, onOpen }: { booking: Booking; onOpen: () => void }) {
  const who = firstName(booking.makerName)
  return (
    <section className="card your-workshop">
      {booking.cover && <img className="your-workshop__cover" src={booking.cover} alt="" width={329} height={96} />}
      <div className="your-workshop__head">
        <span className="your-workshop__check">
          <img src={iconCheck} alt="" width={14} height={14} />
        </span>
        <h2 className="overline">Your workshop is booked</h2>
      </div>
      <h3 className="your-workshop__title">{booking.workshopTitle}</h3>
      <p className="your-workshop__who">
        with {booking.makerName} · {booking.studio}
      </p>
      <p className="your-workshop__facts">
        {booking.people} {booking.people === 1 ? 'person' : 'people'} · {formatINR(booking.total)} in all ({formatINR(booking.pricePerPerson)} each). Pay {who} directly on the day, by UPI or cash.
      </p>
      <div className="your-workshop__actions">
        <button type="button" className="pill-button" onClick={() => openDirections(booking)}>
          <img src={iconNavigation} alt="" width={14} height={14} />
          Studio directions
        </button>
        <button type="button" className="text-link" onClick={onOpen}>
          About {who}
        </button>
      </div>
    </section>
  )
}
