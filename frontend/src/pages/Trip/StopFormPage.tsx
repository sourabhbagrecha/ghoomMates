import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { Skeleton } from '../../components/states/Skeleton'
import { TextField } from '../../components/TextField'
import { activeTrip, tripDayLabel, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { tripsApi } from '../../services/tripsService'
import { STOP_TAGS } from './tripDetailData'
import { to12h, to24h } from './tripFormat'
import './StopFormPage.css'

/** Day to add to, from #/trip/itinerary/add?day=2 */
const dayFromHash = () => Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('day')) || 1

export function StopFormPage({ stopId }: { stopId?: string }) {
  const { trip, itinerary } = useActiveTrip()
  if (!trip || !itinerary) return <Skeleton variant="card" height={400} />
  const existing = stopId ? itinerary.flatMap((d) => d.stops).find((s) => s.id === stopId) : undefined
  if (stopId && !existing) return null
  return <StopForm key={stopId ?? 'new'} tripId={trip.id} tripName={trip.name} startDate={trip.startDate} dayCount={itinerary.length} existing={existing} />
}

type StopFormProps = {
  tripId: string
  tripName: string
  startDate: string | null
  dayCount: number
  existing?: NonNullable<ReturnType<typeof useActiveTrip>['itinerary']>[number]['stops'][number]
}

function StopForm({ tripId, tripName, startDate, dayCount, existing }: StopFormProps) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [time, setTime] = useState(existing ? to24h(existing.time) : '')
  const [place, setPlace] = useState(existing?.place ?? '')
  const [dayNumber, setDayNumber] = useState(existing?.dayNumber ?? Math.min(dayFromHash(), dayCount))
  const [tag, setTag] = useState(existing?.tag || STOP_TAGS[1])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const back = () => navigate(existing ? `trip/itinerary/stop/${existing.id}` : 'trip/itinerary')
  const canSave = title.trim().length > 0 && time.length > 0 && !saving

  const run = async (action: () => Promise<unknown>, then: () => void) => {
    setSaving(true)
    setError(null)
    try {
      await action()
      await activeTrip.loadItinerary()
      then()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the stop')
      setSaving(false)
    }
  }

  const save = () => {
    const stop = { dayNumber, time: to12h(time), title: title.trim(), tag, place: place.trim(), notes: notes.trim() }
    void run(() => (existing ? tripsApi.updateStop(tripId, existing.id, stop) : tripsApi.addStop(tripId, stop)), back)
  }

  const remove = () => {
    if (!existing) return
    void run(() => tripsApi.deleteStop(tripId, existing.id), () => navigate('trip/itinerary', { replace: true }))
  }

  return (
    <OnboardingLayout
      eyebrow={`${tripName} · Itinerary`}
      title={existing ? 'Edit stop' : 'Add a stop'}
      onBack={back}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="stop-form__body"
      actions={
        <>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add to plan'}
          </Button>
          {existing && <LinkButton onClick={remove}>Remove from plan</LinkButton>}
        </>
      }
    >
      {!existing && <GhoomMateTip>The whole squad is marked as going. Mates can change that from the stop.</GhoomMateTip>}

      <TextField label="What’s the plan?" placeholder="Sunset at Ambrai Ghat" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="stop-form__row">
        <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextField label="Place" placeholder="Ambrai Ghat" value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>

      <div className="stop-form__group">
        <p className="stop-form__label">Day</p>
        <div className="stop-form__chips">
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => (
            <Chip key={n} selected={n === dayNumber} onClick={() => setDayNumber(n)}>
              Day {n} · {tripDayLabel(startDate, n)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="stop-form__group">
        <p className="stop-form__label">Vibe</p>
        <div className="stop-form__chips">
          {STOP_TAGS.map((t) => (
            <Chip key={t} selected={t === tag} onClick={() => setTag(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <label className="stop-form__group">
        <span className="stop-form__label">Notes for the squad</span>
        <textarea
          className="stop-form__notes"
          rows={3}
          placeholder="Tickets, what to carry, where to meet…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && (
        <p className="stop-form__label" role="alert">
          {error}
        </p>
      )}
    </OnboardingLayout>
  )
}
