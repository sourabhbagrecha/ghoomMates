import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPinSky from '../../assets/figma/icon-map-pin-sky.svg'
import iconNavigation from '../../assets/figma/icon-navigation-white.svg'
import iconMapPin from '../../assets/figma/icon-perm-map-pin.svg'
import { useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip, tripDayLabel, useActiveTrip } from '../../data/activeTrip'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { CoverLayout } from '../../components/CoverLayout'
import { tripsApi, type Rsvp } from '../../services/tripsService'
import { RSVP_OPTIONS, TAG_PHOTOS } from './tripDetailData'
import { useToast } from '../../hooks/useToast'
import './StopDetailPage.css'

export function StopDetailPage({ stopId }: { stopId: string }) {
  const navigate = useNavigate()
  const { trip, itinerary } = useActiveTrip()
  const [toast, showToast] = useToast()
  const [pending, setPending] = useState<Rsvp | null>(null)
  const stop = itinerary?.flatMap((d) => d.stops).find((s) => s.id === stopId)
  if (!trip || !itinerary) return <Skeleton variant="card" height={400} />
  if (!stop) {
    return (
      <EmptyState
        title="This stop isn’t in the plan anymore"
        action={{ label: 'Back to itinerary', onClick: () => navigate('trip/itinerary', { replace: true }) }}
      />
    )
  }

  const day = itinerary.find((d) => d.number === stop.dayNumber)
  const myRsvp = pending ?? stop.myRsvp
  const going = stop.going
  const squadSize = trip.members.length

  const setRsvp = async (rsvp: Rsvp) => {
    setPending(rsvp)
    try {
      await tripsApi.rsvp(trip.id, stop.id, rsvp)
      await activeTrip.loadItinerary()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save your RSVP')
    }
    setPending(null)
  }

  const directions = () => {
    const query = [stop.place || stop.title, trip.destination].filter(Boolean).join(', ')
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener')
  }

  return (
    <>
      <CoverLayout
        cover={TAG_PHOTOS[stop.tag] ?? TAG_PHOTOS.Chill}
        onBack={() => navigate('trip/itinerary')}
        overlay={
          <>
            {stop.tag && <span className="tag">{stop.tag}</span>}
          </>
        }
        bodyClassName="stop-detail__body"
        actions={
          <Button variant="primary" onClick={() => navigate(`trip/itinerary/edit/${stop.id}`)}>
            Edit stop
          </Button>
        }
      >
        <section className="card stop-detail__summary">
          <p className="stop-detail__when">
            <img src={iconClock} alt="" width={14} height={14} />
            <span className="stop-detail__time">{stop.time || 'Anytime'}</span>
            <span>· Day {stop.dayNumber}, {tripDayLabel(trip.startDate, stop.dayNumber)}{day?.title ? ` · ${day.title}` : ''}</span>
          </p>
          <h1 className="stop-detail__title">{stop.title}</h1>
          {stop.place && (
            <p className="stop-detail__place">
              <img src={iconMapPinSky} alt="" width={14} height={14} />
              {stop.place}
            </p>
          )}
        </section>

        <section className="card stop-detail__map-card">
          <div className="stop-detail__map" aria-hidden="true">
            <span className="stop-detail__pin">
              <img src={iconMapPin} alt="" width={22} height={22} />
            </span>
          </div>
          <div className="stop-detail__map-row">
            <div className="stop-detail__map-text">
              <p className="stop-detail__map-place">{stop.place || 'Location to be added'}</p>
              {trip.destination && <p className="stop-detail__map-away">{trip.destination}</p>}
            </div>
            <button type="button" className="pill-button" onClick={directions}>
              <img src={iconNavigation} alt="" width={14} height={14} />
              Directions
            </button>
          </div>
        </section>

        <section className="card stop-detail__squad">
          <div className="stop-detail__squad-header">
            <h2 className="overline">Who’s going</h2>
            <span className="stop-detail__count">
              {going.length} of {squadSize}
            </span>
          </div>
          <ul className="stop-detail__people">
            {going.map((id) => (
              <li key={id}>
                <Avatar person={id} size={34} />
                <span>{personOf(id).name}</span>
              </li>
            ))}
            {going.length === 0 && <li className="stop-detail__nobody">Nobody yet</li>}
          </ul>
          <hr className="stop-detail__divider" />
          <div className="stop-detail__rsvp-row">
            <p className="stop-detail__rsvp-label">Are you in?</p>
            <div className="stop-detail__rsvp" role="group" aria-label="Your RSVP">
              {RSVP_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`stop-detail__rsvp-option${myRsvp === option.id ? ' stop-detail__rsvp-option--selected' : ''}`}
                  aria-pressed={myRsvp === option.id}
                  disabled={pending !== null}
                  onClick={() => void setRsvp(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card stop-detail__notes">
          <h2 className="overline">Notes</h2>
          <p className={stop.notes ? 'stop-detail__notes-text' : 'stop-detail__notes-empty'}>
            {stop.notes || 'No notes yet. Add tips for the squad when you edit the stop.'}
          </p>
        </section>
      </CoverLayout>
      <Toast message={toast} />
    </>
  )
}
