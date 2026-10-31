import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconLock from '../../assets/figma/icon-lock-sky.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { SQUAD } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from './Toast'
import { DUES, NOTIFICATION_SETTINGS, TRIP_INFO } from './tripDetailData'
import { formatINR } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from './useToast'
import './TripSettingsPage.css'

export function TripSettingsPage() {
  const navigate = useNavigate()
  const { tripName, notifications, settledVia } = useTripStore()
  const [toast, showToast] = useToast(3000)
  const owed = DUES.reduce((sum, d) => sum + d.value, 0)

  return (
    <>
      <OnboardingLayout
        eyebrow={`${tripName || TRIP_INFO.name} · ${TRIP_INFO.group}`}
        title="Trip settings"
        onBack={() => navigate('trip/members')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="trip-settings__body"
      >
        <section className="card trip-settings__card">
          <h2 className="overline">Trip details</h2>
          {/* TODO: persist the name to the trips service */}
          <TextField label="Trip name" value={tripName} onChange={(e) => tripActions.setTripName(e.target.value)} />
          <div className="trip-settings__row">
            <img src={iconCalendar} alt="" width={14} height={14} />
            <span className="trip-settings__row-text">
              <span className="trip-settings__row-label">Dates</span>
              <span className="trip-settings__row-value">{TRIP_INFO.dates}</span>
            </span>
            {/* TODO: date picker once trips can be extended mid-way */}
            <button
              type="button"
              className="text-link"
              onClick={() => showToast('Dates are locked while the trip is live')}
            >
              Change
            </button>
          </div>
          <div className="trip-settings__row">
            <img src={iconLock} alt="" width={14} height={14} />
            <span className="trip-settings__row-text">
              <span className="trip-settings__row-label">Currency</span>
              <span className="trip-settings__row-value">{TRIP_INFO.currency}</span>
            </span>
            <span className="trip-settings__locked">Locked after first expense</span>
          </div>
        </section>

        <section className="card trip-settings__card">
          <h2 className="overline">Notifications</h2>
          <ul className="trip-settings__toggles">
            {NOTIFICATION_SETTINGS.map((n) => (
              <li key={n.id} className="trip-settings__toggle-row">
                <span className="trip-settings__row-text">
                  <span className="trip-settings__toggle-title">{n.title}</span>
                  <span className="trip-settings__row-label">{n.description}</span>
                </span>
                <button
                  type="button"
                  className={`trip-settings__switch${notifications[n.id] ? ' trip-settings__switch--on' : ''}`}
                  aria-pressed={notifications[n.id]}
                  aria-label={n.title}
                  onClick={() => tripActions.toggleNotification(n.id)}
                >
                  <span className="trip-settings__knob" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="list-card trip-settings__members" onClick={() => navigate('trip/members')}>
          <AvatarStack people={SQUAD} size={26} overlap={9} />
          <span className="trip-settings__row-text">
            <span className="trip-settings__toggle-title">Members</span>
            <span className="trip-settings__row-label">{SQUAD.length} mates · invite more</span>
          </span>
          <img src={iconChevron} alt="" width={16} height={16} />
        </button>

        <div className="trip-settings__exit">
          {/* TODO: leave/archive flows with confirmation */}
          <Button
            variant="outline"
            onClick={() =>
              showToast(settledVia ? 'You’re the organiser. Hand over to Riya before you leave' : `Settle your ${formatINR(owed)} first, then you can leave`)
            }
          >
            Leave trip
          </Button>
          <LinkButton onClick={() => showToast('Archive opens once the trip ends on Mon, 2 Nov')}>Archive trip</LinkButton>
        </div>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
