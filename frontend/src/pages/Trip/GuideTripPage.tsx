import { useEffect, useRef, useState } from 'react'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconPaperclip from '../../assets/figma/icon-paperclip-sky.svg'
import iconStarSmall from '../../assets/figma/icon-star-small.svg'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { CoverLayout } from '../../components/CoverLayout'
import { formatDays, nextRunLabel } from '../Explore/experienceSchedule'
import type { Experience } from '../Explore/experiencesData'
import { formatINR, listNames } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './GuideTripPage.css'

export function GuideTripPage({ experience: guide }: { experience: Experience }) {
  const navigate = useNavigate()
  const { joinedGuides } = useTripStore()
  const joined = joinedGuides.includes(guide.id)
  const [toast, showToast] = useToast()
  const [joining, setJoining] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seatsLeft = guide.seatsLeft - (joined ? 1 : 0)
  const hostFirstName = guide.host.name.split(' ')[0]
  const price = formatINR(guide.price)
  const [cover, ...gallery] = guide.photos
  const interested = guide.interested.filter((id) => id !== 'you')

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const join = () => {
    setJoining(true)
    // TODO: book the seat and take the payment via UPI
    timer.current = window.setTimeout(() => {
      setJoining(false)
      tripActions.joinGuide(guide.id)
    }, 1000)
  }

  return (
    <>
      <CoverLayout
        cover={cover.src}
        onBack={() => navigate('trip/explore')}
        overlay={<span className="guide__pick">{guide.pick ?? guide.area}</span>}
        bodyClassName="guide__body"
        actions={
          joined ? (
            <>
              <p className="guide__confirmed" role="status">
                <img src={iconCheck} alt="" width={14} height={14} />
                You’re in! {hostFirstName} will message pickup details.
              </p>
              <Button variant="outline" onClick={() => navigate('trip/explore')}>
                Back to Explore
              </Button>
            </>
          ) : (
            <>
              <p className="guide__seats">
                {seatsLeft} seats left
                {guide.thingsToKnow.cancellation.startsWith('Free cancellation') && ' · Free cancellation'}
              </p>
              <Button variant="primary" disabled={joining} onClick={join}>
                {joining ? 'Booking your seat…' : `Join · ${price}`}
              </Button>
            </>
          )
        }
      >
        <section className="card guide__summary">
          <h1 className="guide__title">{guide.title}</h1>
          <p className="guide__rating-line">
            <img src={iconStarSmall} alt="" width={12} height={12} />
            <strong>{guide.rating}</strong> · {guide.reviewCount} reviews · {guide.area}
          </p>
          <ul className="guide__facts">
            <li>
              <img src={iconCalendar} alt="" width={14} height={14} />
              {nextRunLabel(guide)} · {guide.startTime}
            </li>
            <li>
              <img src={iconClock} alt="" width={14} height={14} />
              {guide.duration}
            </li>
            <li>
              <img src={iconMapPin} alt="" width={14} height={14} />
              {guide.pickup}
            </li>
            <li>
              <img src={iconUsers} alt="" width={14} height={14} />
              Up to {guide.groupSize} guests
            </li>
            <li>
              <img src={iconCalendar} alt="" width={14} height={14} />
              {formatDays(guide.days)}
            </li>
          </ul>
          <p className="guide__price">
            {price}
            <span> /person · {seatsLeft} seats left</span>
          </p>
        </section>

        {gallery.length > 0 && (
          <div className="guide__gallery no-scrollbar" aria-label="Photos">
            {gallery.map((photo) => (
              <img key={photo.src} src={photo.src} alt={photo.alt} loading="lazy" />
            ))}
          </div>
        )}

        <section className="card guide__about">
          <h2 className="overline">What you’ll do</h2>
          <p>{guide.about}</p>
        </section>

        <section className="list-card guide__host">
          <Avatar person={guide.host.id} size={44} />
          <div className="guide__host-text">
            <p className="guide__host-name">
              Hosted by {guide.host.name}
              <span className="guide__rating">
                <img src={iconStarSmall} alt="" width={11} height={11} />
                {guide.rating}
              </span>
            </p>
            <p className="guide__host-bio">
              {guide.host.yearsHosting} yrs hosting · {guide.host.trips} trips · Speaks {listNames(guide.host.languages)}
            </p>
            <p className="guide__host-about">{guide.host.about}</p>
          </div>
          {/* TODO: open a chat with the host */}
          <button type="button" className="text-link" onClick={() => showToast(`Message sent to ${hostFirstName}`)}>
            Message
          </button>
        </section>

        <section className="card guide__day">
          <h2 className="overline">Your day</h2>
          <ol className="guide__timeline">
            {guide.timeline.map((item) => (
              <li key={item.time} className="guide__moment">
                <span className="guide__dot" aria-hidden="true" />
                <span className="guide__moment-time">{item.time}</span>
                <span className="guide__moment-title">{item.title}</span>
                <span className="guide__moment-note">{item.note}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card guide__included">
          <h2 className="overline">What’s included</h2>
          <ul>
            {guide.included.map((item) => (
              <li key={item}>
                <img src={iconCheck} alt="" width={14} height={14} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="card guide__included">
          <h2 className="overline">What to bring</h2>
          <ul>
            {guide.bring.map((item) => (
              <li key={item}>
                <img src={iconPaperclip} alt="" width={14} height={14} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="card guide__meet">
          <h2 className="overline">Where you’ll meet</h2>
          <p className="guide__meet-name">
            <img src={iconMapPin} alt="" width={14} height={14} />
            {guide.meetingPoint.name}
          </p>
          <p className="guide__meet-details">{guide.meetingPoint.details}</p>
        </section>

        <section className="card guide__know">
          <h2 className="overline">Things to know</h2>
          <dl>
            <dt>Who can come</dt>
            <dd>{guide.thingsToKnow.guests}</dd>
            <dt>Cancellation</dt>
            <dd>{guide.thingsToKnow.cancellation}</dd>
            <dt>Accessibility</dt>
            <dd>{guide.thingsToKnow.accessibility}</dd>
          </dl>
        </section>

        <section className="card guide__reviews">
          <h2 className="guide__reviews-title">
            <img src={iconStarSmall} alt="" width={14} height={14} />
            {guide.rating} · {guide.reviewCount} reviews
          </h2>
          <ul>
            {guide.reviews.map((review) => (
              <li key={review.name} className="guide__review">
                <p className="guide__review-head">
                  <strong>{review.name}</strong> · {review.when} · {'★'.repeat(review.rating)}
                </p>
                <p className="guide__review-text">{review.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {(interested.length > 0 || joined) && (
          <section className="list-card guide__squad">
            <AvatarStack people={joined ? ['you', ...interested] : interested} size={34} overlap={10} />
            <p className="guide__squad-text">
              {interested.length > 0 ? (
                <>
                  <strong>{listNames(interested.map((id) => PEOPLE[id].name))}</strong>{' '}
                  {interested.length > 1 ? 'are' : 'is'} keen
                  {joined ? ', and so are you!' : '. Make it a squad plan?'}
                </>
              ) : (
                'You’re the first of the squad in. Share it with the gang?'
              )}
            </p>
          </section>
        )}

        <p className="guide__credits">
          Photos from Wikimedia Commons:{' '}
          {guide.photos.map((photo, i) => (
            <span key={photo.src}>
              {i > 0 && ' · '}
              <a href={photo.source} target="_blank" rel="noreferrer">
                {photo.credit}
              </a>{' '}
              ({photo.license})
            </span>
          ))}
        </p>
      </CoverLayout>
      <Toast message={toast} />
    </>
  )
}
