import { useState } from 'react'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconCamera from '../../assets/figma/icon-camera-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconCompass from '../../assets/figma/icon-compass-primary.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import { iconUrl } from '../../assets/icons'
import { CrowdChip } from '../../components/crowd/Crowd'
import type { AnyEvent } from '../../services/eventsService'
import { directionsUrl, isInstance, isRecurring, relativeLabel, tileFor } from './eventsLogic'
import './EventCard.css'

const iconShirt = iconUrl('shirt', 'primary')

type EventCardProps = {
  event: AnyEvent
  /** Which day of the squad's trip the event falls on, if it does */
  tripDay: number | null
  /** Days of the plan that already have this event */
  addedDays: number[]
  /** A trip is open to add to */
  canAdd: boolean
  /** Opened from a link: expanded and ringed so the eye finds it */
  focus?: boolean
  onAdd: () => void
  onPlan: () => void
}

/**
 * One festival, fair or show: when and where, how crowded it gets, why it matters, how to join respectfully, and the two
 * things a squad does with it, put it in the plan or plan around the crowd.
 */
export function EventCard({ event, tripDay, addedDays, canAdd, focus = false, onAdd, onPlan }: EventCardProps) {
  const [open, setOpen] = useState(focus)
  const tile = tileFor(event)
  const crowd = 'crowd' in event ? event.crowd : null
  const instance = isInstance(event) ? event : null
  const badge = instance ? relativeLabel(instance) : { text: isRecurring(event) ? 'Every night' : 'Dates TBA', soon: false }
  const firstPlace = event.places[0]
  const mapPlace = event.places.find((p) => p.lat !== null && p.lng !== null)
  const tone = crowd?.label ?? 'moderate'

  return (
    <article className={`card event-card${focus ? ' event-card--focus' : ''}`} id={`event-${event.id}`} aria-labelledby={`event-${event.id}-name`}>
      <header className="event-card__head">
        <div className="event-card__tile" aria-hidden="true">
          <span className="event-card__tile-top">{tile.top}</span>
          <span className="event-card__tile-big">{tile.big}</span>
          <span className="event-card__tile-bottom">{tile.bottom}</span>
        </div>
        <div className="event-card__title">
          <div className="event-card__badges">
            <span className={`event-card__badge${badge.soon ? ' event-card__badge--soon' : ''}`}>{badge.text}</span>
            {tripDay !== null && <span className="event-card__badge event-card__badge--trip">Day {tripDay} of your trip</span>}
          </div>
          <h3 id={`event-${event.id}-name`} className="event-card__name">
            {event.name}
          </h3>
          <p className="event-card__hindi" lang="hi">
            {event.nameHi}
          </p>
        </div>
      </header>

      <ul className="event-card__facts">
        <li>
          <img src={iconMapPin} alt="" width={14} height={14} />
          <span>{firstPlace?.name}</span>
        </li>
        <li>
          <img src={iconClock} alt="" width={14} height={14} />
          <span>{event.time.label}</span>
        </li>
        {event.price && (
          <li>
            <img src={iconCalendar} alt="" width={14} height={14} />
            <span>{event.price}</span>
          </li>
        )}
      </ul>

      {crowd ? (
        <div className={`event-card__crowd event-card__crowd--${tone}`}>
          <CrowdChip label={crowd.label} size="large" />
          <p>{crowd.headline}</p>
        </div>
      ) : (
        <div className="event-card__crowd event-card__crowd--moderate">
          <img src={iconCalendar} alt="" width={14} height={14} />
          <p>{'datesNote' in event ? event.datesNote : ''}</p>
        </div>
      )}

      <p className={`event-card__about${open ? '' : ' event-card__about--clamped'}`}>{event.significance}</p>

      {open && (
        <div className="event-card__details">
          <section className="event-card__section">
            <h4 className="overline">Join respectfully</h4>
            <ul className="event-card__list">
              {event.join.etiquette.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="event-card__row">
              <img src={iconShirt} alt="" width={16} height={16} />
              <span>{event.join.dress}</span>
            </p>
            <p className="event-card__row">
              <img src={iconCamera} alt="" width={16} height={16} />
              <span>{event.join.photography}</span>
            </p>
          </section>

          <section className="event-card__section">
            <h4 className="overline">For the squad</h4>
            <ul className="event-card__list">
              {event.tips.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {mapPlace && (
              <a className="text-link event-card__link" href={directionsUrl({ lat: mapPlace.lat!, lng: mapPlace.lng! })} target="_blank" rel="noopener noreferrer">
                Directions to {mapPlace.name.split(' (')[0]}
              </a>
            )}
          </section>

          <section className="event-card__section">
            <h4 className="overline">
              <img src={iconUsers} alt="" width={12} height={12} /> Where this comes from
            </h4>
            {instance && <p className="event-card__source">Dates: {instance.datesBasis}.</p>}
            <p className="event-card__source">
              {event.sources.map((source, i) => (
                <span key={source.url}>
                  {i > 0 && ' · '}
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                </span>
              ))}
            </p>
          </section>
        </div>
      )}

      <button type="button" className="text-link event-card__more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Show less' : 'How to join respectfully'}
      </button>

      {addedDays.length > 0 && (
        <p className="event-card__added" role="status">
          <img src={iconCheck} alt="" width={12} height={12} />
          On our itinerary · Day {addedDays.join(', ')}
        </p>
      )}

      {(event.stop || crowd) && (
        <div className="event-card__actions">
          {event.stop && (
            <button type="button" className="pill-button event-card__primary" disabled={!canAdd} onClick={onAdd}>
              <img src={iconPlus} alt="" width={14} height={14} />
              Add to our itinerary
            </button>
          )}
          {crowd && (
            <button type="button" className="event-card__ghost" onClick={onPlan}>
              <img src={iconCompass} alt="" width={14} height={14} />
              Plan around it
            </button>
          )}
        </div>
      )}
    </article>
  )
}
