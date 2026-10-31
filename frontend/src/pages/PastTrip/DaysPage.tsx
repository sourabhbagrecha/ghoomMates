import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { useNavigate } from '../../hooks/navigation'
import type { PastTripDetails } from './pastTripData'
import { StarRating } from './StarRating'
import './DaysPage.css'

/** What the squad actually did, day by day, with how each stop was rated. */
export function DaysPage({ details }: { details: PastTripDetails }) {
  const navigate = useNavigate()
  const [dayIndex, setDayIndex] = useState(0)
  const { trip } = details
  const day = details.days[dayIndex]

  return (
    <OnboardingLayout
      eyebrow={`${trip.name} · ${details.dates}`}
      title="Day by day"
      onBack={() => navigate(`past/${trip.id}`)}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="days__body"
    >
      <SectionHeader
        title={day.title}
        action={
          <div className="days__pills">
            {details.days.map((d, i) => (
              <button
                key={d.label}
                type="button"
                className={`days__pill${i === dayIndex ? ' days__pill--active' : ''}`}
                aria-pressed={i === dayIndex}
                onClick={() => setDayIndex(i)}
              >
                D{i + 1}
              </button>
            ))}
          </div>
        }
      />
      <p className="overline days__label">{day.label}</p>
      <ol className="days__stops">
        {day.stops.map((stop) => (
          <li key={stop.title} className="list-card days__stop">
            <img className="days__photo" src={stop.photo} alt="" width={52} height={52} />
            <div className="days__info">
              <p className="days__time">{stop.time}</p>
              <p className="days__title">{stop.title}</p>
              <span className="days__rating">
                <StarRating value={stop.rating} size={12} label="Squad rating" />
                Squad rating
              </span>
            </div>
            <span className="tag">{stop.tag}</span>
          </li>
        ))}
      </ol>
    </OnboardingLayout>
  )
}
