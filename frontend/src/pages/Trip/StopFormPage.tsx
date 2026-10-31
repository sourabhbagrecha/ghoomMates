import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { SQUAD, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { DAYS } from '../Itinerary/itineraryData'
import { PersonToggle } from './PersonToggle'
import { STOP_TAGS, TAG_PHOTOS, type TripStop } from './tripDetailData'
import { to12h, to24h } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import './StopFormPage.css'

export function StopFormPage({ stopId }: { stopId?: string }) {
  const navigate = useNavigate()
  const { stops } = useTripStore()
  const existing = stopId ? stops.find((s) => s.id === stopId) : undefined

  const [title, setTitle] = useState(existing?.title ?? '')
  const [time, setTime] = useState(existing ? to24h(existing.time) : '')
  const [place, setPlace] = useState(existing?.place ?? '')
  const [dayId, setDayId] = useState(existing?.dayId ?? DAYS[0].id)
  const [tag, setTag] = useState(existing?.tag ?? STOP_TAGS[1])
  const [people, setPeople] = useState<PersonId[]>(existing?.people ?? SQUAD)
  const [notes, setNotes] = useState(existing?.notes ?? '')

  if (stopId && !existing) return null

  const back = () => navigate(existing ? `trip/itinerary/stop/${existing.id}` : 'trip/itinerary')
  const canSave = title.trim().length > 0 && time.length > 0
  const wholeSquad = people.length === SQUAD.length

  const togglePerson = (id: PersonId) =>
    setPeople((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : SQUAD.filter((p) => p === id || prev.includes(p))))

  const save = () => {
    const going = SQUAD.filter((p) => people.includes(p))
    const stop: TripStop = {
      id: existing?.id ?? `stop-${Date.now().toString(36)}`,
      done: existing?.done ?? false,
      away: existing?.away ?? '',
      title: title.trim(),
      time: to12h(time),
      place: place.trim(),
      notes: notes.trim(),
      dayId,
      tag,
      people: going,
      photo: existing && existing.tag === tag ? existing.photo : TAG_PHOTOS[tag],
      reaction:
        existing?.done ? existing.reaction : going.length === SQUAD.length ? 'Whole squad' : `${going.length}/${SQUAD.length} going`,
    }
    // TODO: sync to the trips service and notify the squad
    tripActions.saveStop(stop)
    back()
  }

  return (
    <OnboardingLayout
      eyebrow="Goa Trip · Itinerary"
      title={existing ? 'Edit stop' : 'Add a stop'}
      onBack={back}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="stop-form__body"
      actions={
        <Button variant="primary" disabled={!canSave} onClick={save}>
          {existing ? 'Save changes' : 'Add to plan'}
        </Button>
      }
    >
      {!existing && <GhoomMateTip>Or just say “Add dinner at Thalassa, 8 PM, whole squad”.</GhoomMateTip>}

      <TextField label="What’s the plan?" placeholder="Sunset at Vagator" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="stop-form__row">
        <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextField label="Place" placeholder="Vagator beach" value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>

      <div className="stop-form__group">
        <p className="stop-form__label">Day</p>
        <div className="stop-form__chips">
          {DAYS.map((d) => (
            <Chip key={d.id} selected={d.id === dayId} onClick={() => setDayId(d.id)}>
              {d.title}
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

      <div className="stop-form__group">
        <div className="stop-form__label-row">
          <p className="stop-form__label">Who’s going</p>
          <button type="button" className="text-link" onClick={() => setPeople(wholeSquad ? ['you'] : SQUAD)}>
            {wholeSquad ? 'Just me' : 'Whole squad'}
          </button>
        </div>
        <div className="stop-form__people">
          {SQUAD.map((id) => (
            <PersonToggle key={id} person={id} label="Going" selected={people.includes(id)} onClick={() => togglePerson(id)} />
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
    </OnboardingLayout>
  )
}
