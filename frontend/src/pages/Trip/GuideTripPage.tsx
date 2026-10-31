import { useEffect, useRef, useState } from 'react'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconStarSmall from '../../assets/figma/icon-star-small.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { CoverLayout } from '../../components/CoverLayout'
import { GUIDE_DETAIL as GUIDE } from './tripDetailData'
import { listNames } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './GuideTripPage.css'

export function GuideTripPage() {
  const navigate = useNavigate()
  const { guideJoined } = useTripStore()
  const [toast, showToast] = useToast()
  const [joining, setJoining] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const seatsLeft = GUIDE.seatsLeft - (guideJoined ? 1 : 0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const join = () => {
    setJoining(true)
    // TODO: book the seat and take the ₹1,499 via UPI
    timer.current = window.setTimeout(() => {
      setJoining(false)
      tripActions.joinGuide()
    }, 1000)
  }

  return (
    <>
      <CoverLayout
        cover={GUIDE.cover}
        onBack={() => navigate('trip/explore')}
        overlay={<span className="guide__pick">{GUIDE.pick}</span>}
        bodyClassName="guide__body"
        actions={
          guideJoined ? (
            <>
              <p className="guide__confirmed" role="status">
                <img src={iconCheck} alt="" width={14} height={14} />
                You’re in! {GUIDE.host} will message pickup details.
              </p>
              <Button variant="outline" onClick={() => navigate('trip/explore')}>
                Back to Explore
              </Button>
            </>
          ) : (
            <>
              <p className="guide__seats">
                {seatsLeft} seats left · Free cancellation till Sat
              </p>
              <Button variant="primary" disabled={joining} onClick={join}>
                {joining ? 'Booking your seat…' : `Join · ${GUIDE.price}`}
              </Button>
            </>
          )
        }
      >
        <section className="card guide__summary">
          <h1 className="guide__title">{GUIDE.title}</h1>
          <ul className="guide__facts">
            <li>
              <img src={iconCalendar} alt="" width={14} height={14} />
              {GUIDE.date}
            </li>
            <li>
              <img src={iconClock} alt="" width={14} height={14} />
              {GUIDE.duration}
            </li>
            <li>
              <img src={iconMapPin} alt="" width={14} height={14} />
              {GUIDE.pickup}
            </li>
          </ul>
          <p className="guide__price">
            {GUIDE.price}
            <span> /person · {seatsLeft} seats left</span>
          </p>
        </section>

        <section className="list-card guide__host">
          <Avatar person={GUIDE.hostAvatar} size={44} />
          <div className="guide__host-text">
            <p className="guide__host-name">
              Hosted by {GUIDE.host}
              <span className="guide__rating">
                <img src={iconStarSmall} alt="" width={11} height={11} />
                {GUIDE.rating}
              </span>
            </p>
            <p className="guide__host-bio">{GUIDE.hostBio}</p>
          </div>
          {/* TODO: open a chat with the host */}
          <button type="button" className="text-link" onClick={() => showToast(`Message sent to ${GUIDE.host}`)}>
            Message
          </button>
        </section>

        <section className="card guide__day">
          <h2 className="overline">Your day</h2>
          <ol className="guide__timeline">
            {GUIDE.timeline.map((item) => (
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
            {GUIDE.included.map((item) => (
              <li key={item}>
                <img src={iconCheck} alt="" width={14} height={14} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="list-card guide__squad">
          <AvatarStack people={guideJoined ? ['you', ...GUIDE.interested] : GUIDE.interested} size={34} overlap={10} />
          <p className="guide__squad-text">
            <strong>{listNames(GUIDE.interested.map((id) => PEOPLE[id].name))}</strong> are keen
            {guideJoined ? ', and so are you!' : '. Make it a squad plan?'}
          </p>
        </section>
      </CoverLayout>
      <Toast message={toast} />
    </>
  )
}
