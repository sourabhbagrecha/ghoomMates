import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPinSky from '../../assets/figma/icon-map-pin-sky.svg'
import iconNavigation from '../../assets/figma/icon-navigation-white.svg'
import iconMapPin from '../../assets/figma/icon-perm-map-pin.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { PEOPLE, SQUAD } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { DAYS } from '../Itinerary/itineraryData'
import { Toast } from './Toast'
import { TripCoverLayout } from './TripCoverLayout'
import { RSVP_OPTIONS } from './tripDetailData'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from './useToast'
import './StopDetailPage.css'

export function StopDetailPage({ stopId }: { stopId: string }) {
  const navigate = useNavigate()
  const { stops, rsvp } = useTripStore()
  const [toast, showToast] = useToast()
  const stop = stops.find((s) => s.id === stopId)
  if (!stop) return null

  const day = DAYS.find((d) => d.id === stop.dayId)
  const myRsvp = rsvp[stop.id] ?? 'maybe'
  const going = stop.people

  return (
    <>
      <TripCoverLayout
        cover={stop.photo}
        onBack={() => navigate('trip/itinerary')}
        overlay={
          <>
            <span className="tag">{stop.tag}</span>
            {stop.done && <span className="tag stop-detail__done">Done · {stop.reaction}</span>}
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
            <span className="stop-detail__time">{stop.time}</span>
            {day && <span>· {day.title}</span>}
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
              {stop.away && <p className="stop-detail__map-away">{stop.away}</p>}
            </div>
            {/* TODO: open the place in Google/Apple Maps */}
            <button type="button" className="pill-button" onClick={() => showToast('Opening directions in Maps…')}>
              <img src={iconNavigation} alt="" width={14} height={14} />
              Directions
            </button>
          </div>
        </section>

        <section className="card stop-detail__squad">
          <div className="stop-detail__squad-header">
            <h2 className="overline">Who’s going</h2>
            <span className="stop-detail__count">
              {going.length} of {SQUAD.length}
            </span>
          </div>
          <ul className="stop-detail__people">
            {going.map((id) => (
              <li key={id}>
                <Avatar person={id} size={34} />
                <span>{PEOPLE[id].name}</span>
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
                  onClick={() => tripActions.setRsvp(stop.id, option.id)}
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
      </TripCoverLayout>
      <Toast message={toast} />
    </>
  )
}
