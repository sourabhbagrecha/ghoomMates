import { useState } from 'react'
import headerBg from '../../assets/figma/itinerary-header-bg.svg'
import iconStarOutline from '../../assets/figma/icon-star-outline.svg'
import iconStar from '../../assets/figma/icon-star.svg'
import { AvatarStack } from '../../components/Avatar'
import { Chip } from '../../components/Chip'
import { Flashcard } from '../../components/Flashcard'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { VibeChart } from '../../components/VibeChart'
import { SQUAD } from '../../data/people'
import { SAMPLE_YOU_VIBE, SQUAD_VIBE } from '../../data/vibe'
import { loadVibe } from '../../services/vibeStorage'
import { DAYS, TRIP, VIBE_CHECK, type Stop } from './itineraryData'
import './ItineraryPage.css'

export function ItineraryPage() {
  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={190}
        eyebrow={`Day ${TRIP.dayNumber} of ${TRIP.totalDays} · Itinerary`}
        title={TRIP.name}
        withBubble
      >
        <div className="screen__header-row">
          <div className="group-pill">
            <div className="group-pill__info">
              <AvatarStack people={SQUAD} size={26} overlap={9} />
              <span className="group-pill__name">
                {TRIP.group} · {SQUAD.length} mates
              </span>
            </div>
            <button type="button" className="group-pill__invite">
              + Invite
            </button>
          </div>
        </div>

        <main className="screen__body">
          <VibeCard />
          <VibeCheckFlashcards />
          <DayPlan />
        </main>
      </ScreenLayout>
      <GhoomMateSays>Squad loves food! Add a Fontainhas food walk to Day 3?</GhoomMateSays>
    </>
  )
}

function VibeCard() {
  const [rating, setRating] = useState(4)
  // Your own quiz result once you've taken it, otherwise the sample from Figma
  const [youVibe] = useState(() => loadVibe() ?? SAMPLE_YOU_VIBE)

  return (
    <section className="card vibe-card">
      <div className="vibe-card__main">
        <div className="spiderweb">
          <VibeChart
            variant="compact"
            width={176}
            label="Squad spiderweb: your vibe compared with the squad"
            series={[
              { scores: SQUAD_VIBE, color: 'var(--color-sky)', fillOpacity: 0.28 },
              { scores: youVibe, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true },
            ]}
          />
        </div>
        <div className="vibe-card__persona">
          <p className="overline vibe-card__overline">Squad spiderweb</p>
          <h2 className="vibe-card__persona-name">The Thrill-Seeking Foodies</h2>
          <div className="vibe-card__legend">
            <span className="vibe-card__legend-item">
              <span className="vibe-card__swatch vibe-card__swatch--squad" />
              Squad
            </span>
            <span className="vibe-card__legend-item">
              <span className="vibe-card__swatch vibe-card__swatch--you" />
              You
            </span>
          </div>
          <span className="vibe-card__match">92% vibe match</span>
        </div>
      </div>
      <div className="trip-feedback">
        <p className="trip-feedback__text">
          How was Day 1? <span>Rate to tune tomorrow</span>
        </p>
        <div className="trip-feedback__stars" role="radiogroup" aria-label="Rate Day 1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value > 1 ? 's' : ''}`}
              onClick={() => setRating(value)}
            >
              <img src={value <= rating ? iconStar : iconStarOutline} alt="" width={16} height={16} />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function VibeCheckFlashcards() {
  const [selected, setSelected] = useState(
    () => new Set(VIBE_CHECK.options.filter((o) => o.selected).map((o) => o.id)),
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Flashcard
      overline={`Vibe check · Card ${VIBE_CHECK.card} of ${VIBE_CHECK.totalCards}`}
      question={VIBE_CHECK.question}
      hint="Select all that apply to you"
    >
      {VIBE_CHECK.options.map((option) => (
        <Chip key={option.id} selected={selected.has(option.id)} onClick={() => toggle(option.id)}>
          {option.label}
        </Chip>
      ))}
    </Flashcard>
  )
}

function DayPlan() {
  const [dayId, setDayId] = useState(DAYS[0].id)
  const day = DAYS.find((d) => d.id === dayId) ?? DAYS[0]

  return (
    <>
      <SectionHeader
        title={day.title}
        action={
          <div className="day-pills">
            {DAYS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`day-pills__day${d.id === dayId ? ' day-pills__day--active' : ''}`}
                aria-pressed={d.id === dayId}
                onClick={() => setDayId(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      />
      <ol className="timeline">
        {day.stops.map((stop) => (
          <TimelineStop key={stop.id} stop={stop} />
        ))}
      </ol>
    </>
  )
}

function TimelineStop({ stop }: { stop: Stop }) {
  return (
    <li className="timeline__stop">
      <div className="timeline__rail" aria-hidden="true">
        <span className={`timeline__dot${stop.done ? ' timeline__dot--done' : ''}`} />
        <span className="timeline__line" />
      </div>
      <article className="list-card stop-card">
        <img className="stop-card__photo" src={stop.photo} alt="" width={52} height={52} />
        <div className="stop-card__info">
          <p className="stop-card__time">{stop.time}</p>
          <h3 className="stop-card__title">{stop.title}</h3>
          <div className="stop-card__people">
            <AvatarStack people={stop.people} size={18} overlap={6} />
            <span>{stop.reaction}</span>
          </div>
        </div>
        <span className="tag">{stop.tag}</span>
      </article>
    </li>
  )
}
