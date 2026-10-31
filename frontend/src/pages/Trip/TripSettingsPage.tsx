import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconLock from '../../assets/figma/icon-lock-sky.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { useState } from 'react'
import { activeTrip, formatTripDates, tripPhase, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { tripsApi } from '../../services/tripsService'
import { myDues } from '../Expenses/expensesData'
import { NOTIFICATION_SETTINGS } from './tripDetailData'
import { formatINR } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './TripSettingsPage.css'

export function TripSettingsPage() {
  const navigate = useNavigate()
  const { notifications } = useTripStore()
  const { trip, summary } = useActiveTrip()
  const [toast, showToast] = useToast(3000)
  // Edited locally, saved when the field loses focus
  const [name, setName] = useState<string | null>(null)
  const tripName = name ?? trip?.name ?? ''
  const owed = summary ? myDues(summary).oweTotal : 0
  const squad = trip?.members.map((m) => m.memberId) ?? []

  const saveName = async () => {
    const next = tripName.trim()
    if (!trip || !next || next === trip.name) {
      setName(null)
      return
    }
    try {
      activeTrip.setTrip(await tripsApi.update(trip.id, { name: next }))
      void activeTrip.loadTrips()
      showToast('Trip name saved')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the name')
    }
    setName(null)
  }

  return (
    <>
      <OnboardingLayout
        eyebrow={`${trip?.name ?? 'Trip'} · ${trip?.groupName ?? ''}`}
        title="Trip settings"
        onBack={() => navigate('trip/members')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="trip-settings__body"
      >
        <section className="card trip-settings__card">
          <h2 className="overline">Trip details</h2>
          <TextField
            label="Trip name"
            value={tripName}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <div className="trip-settings__row">
            <img src={iconCalendar} alt="" width={14} height={14} />
            <span className="trip-settings__row-text">
              <span className="trip-settings__row-label">Dates</span>
              <span className="trip-settings__row-value">{trip ? formatTripDates(trip) : '…'}</span>
            </span>
            {/* TODO: date picker once trips can be extended mid-way */}
            <button
              type="button"
              className="text-link"
              onClick={() => showToast(trip && tripPhase(trip) === 'live' ? 'Dates are locked while the trip is live' : 'Changing dates is coming soon')}
            >
              Change
            </button>
          </div>
          <div className="trip-settings__row">
            <img src={iconLock} alt="" width={14} height={14} />
            <span className="trip-settings__row-text">
              <span className="trip-settings__row-label">Currency</span>
              <span className="trip-settings__row-value">₹ INR · Indian rupee</span>
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
          <AvatarStack people={squad} size={26} overlap={9} />
          <span className="trip-settings__row-text">
            <span className="trip-settings__toggle-title">Members</span>
            <span className="trip-settings__row-label">{squad.length} {squad.length === 1 ? 'mate' : 'mates'} · invite more</span>
          </span>
          <img src={iconChevron} alt="" width={16} height={16} />
        </button>

        <div className="trip-settings__exit">
          {/* TODO: leave/archive flows with confirmation */}
          <Button
            variant="outline"
            onClick={() =>
              showToast(
                owed > 0
                  ? `Settle your ${formatINR(owed)} first, then you can leave`
                  : trip?.role === 'organiser'
                    ? 'You’re the organiser. Hand over to a mate before you leave'
                    : 'Leaving trips is coming soon',
              )
            }
          >
            Leave trip
          </Button>
          <LinkButton onClick={() => showToast('Archive opens once the trip ends')}>Archive trip</LinkButton>
        </div>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
