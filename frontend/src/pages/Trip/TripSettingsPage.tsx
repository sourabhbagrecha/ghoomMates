import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconLock from '../../assets/figma/icon-lock-sky.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { DateRangeSheet } from '../../components/DateRangeSheet'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { useState } from 'react'
import { activeTrip, formatTripDates, tripDay, tripPhase, useActiveTrip } from '../../data/activeTrip'
import { MAX_TRIP_DAYS, daysBetween, type IsoDate } from '../../data/tripDates'
import { useNavigate } from '../../hooks/navigation'
import { Toast } from '../../components/Toast'
import { tripsApi, type TripUpdate } from '../../services/tripsService'
import { myDues } from '../Expenses/expensesData'
import { NOTIFICATION_SETTINGS } from './tripDetailData'
import { formatINR } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import { useToast } from '../../hooks/useToast'
import './TripSettingsPage.css'

export function TripSettingsPage() {
  const navigate = useNavigate()
  const { notifications } = useTripStore()
  const { trip, summary, itinerary } = useActiveTrip()
  // Long enough to read "3 stops moved to Day 3"
  const [toast, showToast] = useToast(4500)
  const [editingDates, setEditingDates] = useState(false)
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

  const phase = trip ? tripPhase(trip) : null
  const day = trip && phase === 'live' ? tripDay(trip) : null

  const changeDates = () => {
    if (!trip) return
    if (trip.role !== 'organiser') showToast('Only the organiser can change the dates')
    else if (phase === 'past') showToast('This trip is over, so its dates are fixed')
    else setEditingDates(true)
  }

  // Once the trip has begun only its last day can move; the sheet says so and keeps the first day as it is
  const datesSubtitle = phase === 'live' ? 'The trip has started, so only the last day can move.' : 'Pick the new first and last day.'

  // Days after the new last day disappear; the server moves their stops to the new last day
  const datesHint = ({ start, end }: { start: IsoDate; end: IsoDate }) => {
    const length = Math.min(MAX_TRIP_DAYS, daysBetween(start, end) + 1)
    const leaving = (itinerary ?? []).filter((d) => d.number > length).reduce((n, d) => n + d.stops.length, 0)
    return leaving ? `${leaving} ${leaving === 1 ? 'stop' : 'stops'} planned after Day ${length} will move to Day ${length}.` : null
  }

  const saveDates = async ({ start, end }: { start: IsoDate; end: IsoDate }) => {
    if (!trip) return
    const updated = await tripsApi.update(trip.id, { startDate: start, endDate: end })
    setEditingDates(false)
    // The itinerary (day labels, moved stops, crowd forecasts) and Home (live or upcoming) follow the new dates
    void activeTrip.applyDates(updated)
    showToast(datesSavedMessage(updated, phase))
  }

  return (
    <>
      <OnboardingLayout
        // The group name only when it adds something: a trip called “Mewar Mates · Udaipur” already says it
        eyebrow={trip ? (trip.groupName && !trip.name.includes(trip.groupName) ? `${trip.name} · ${trip.groupName}` : trip.name) : 'Trip'}
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
              <span className="trip-settings__row-label">{day ? `Dates · Day ${day.day} of ${day.total}` : 'Dates'}</span>
              <span className="trip-settings__row-value">{trip ? formatTripDates(trip) : '…'}</span>
            </span>
            <button type="button" className="text-link" disabled={!trip} onClick={changeDates}>
              {trip && !trip.startDate ? 'Set dates' : 'Change'}
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
      {editingDates && trip && (
        <DateRangeSheet
          title="Change dates"
          subtitle={datesSubtitle}
          start={trip.startDate}
          end={trip.endDate ?? trip.startDate}
          lockStart={phase === 'live'}
          hint={datesHint}
          onSave={saveDates}
          onClose={() => setEditingDates(false)}
        />
      )}
      <Toast message={toast} />
    </>
  )
}

/** What the toast says after new dates are saved: the stops that moved, a trip that just went live, or the new dates */
function datesSavedMessage(updated: TripUpdate, before: ReturnType<typeof tripPhase> | null) {
  if (updated.movedStops > 0) {
    const last = updated.startDate && updated.endDate ? Math.min(MAX_TRIP_DAYS, daysBetween(updated.startDate, updated.endDate) + 1) : 1
    return `Dates saved. ${updated.movedStops} ${updated.movedStops === 1 ? 'stop' : 'stops'} from the removed days moved to Day ${last}.`
  }
  if (before !== 'live' && tripPhase(updated) === 'live') return 'Dates saved. The trip starts today, so it’s live!'
  return `Dates saved · ${formatTripDates(updated)}`
}
