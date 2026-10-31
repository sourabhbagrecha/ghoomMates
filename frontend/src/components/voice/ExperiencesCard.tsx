import { experienceById } from '../../pages/Explore/experiencesData'
import { formatINR } from '../../pages/Trip/tripFormat'
import { experienceRoute, type ExperiencePick, type RecommendationBasis } from './protocol'

type ExperiencesCardProps = {
  city: string
  basis: RecommendationBasis
  picks: ExperiencePick[]
  onNavigate: (route: string) => void
}

const HEADINGS: Record<RecommendationBasis, string> = {
  you: 'Picked for your vibe',
  squad: 'Picked for the squad’s vibe',
  rating: 'Top-rated guide trips',
}

/** GhoomMate’s guide-trip picks: tap one to open it in Explore. */
export function ExperiencesCard({ city, basis, picks, onNavigate }: ExperiencesCardProps) {
  // The agent sends ids; anything this build’s catalogue doesn’t know is skipped
  const rows = picks.flatMap((pick) => {
    const experience = experienceById(pick.experienceId)
    return experience ? [{ pick, experience }] : []
  })

  return (
    <section className="voice-card voice-experiences" aria-label={`${HEADINGS[basis]} in ${city}`}>
      <p className="overline voice-card__overline">
        {HEADINGS[basis]} · {city}
      </p>
      {rows.length === 0 ? (
        <p className="voice-card__text">Nothing to show here yet. Have a look in Explore?</p>
      ) : (
        <ul className="voice-experiences__list">
          {rows.map(({ pick, experience }) => (
            <li key={experience.id}>
              <button type="button" className="voice-experiences__row" onClick={() => onNavigate(experienceRoute(experience.id))}>
                <img src={experience.photos[0].src} alt="" width={56} height={56} loading="lazy" />
                <span className="voice-experiences__text">
                  <span className="voice-experiences__title">{experience.title}</span>
                  <span className="voice-experiences__meta">
                    {formatINR(experience.price)} · {experience.date} · {experience.duration}
                  </span>
                  <span className="voice-experiences__why">
                    {pick.matchPercent !== null && <strong>{pick.matchPercent}% match</strong>}
                    {pick.matchPercent !== null && ' · '}
                    {pick.reason}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="text-link voice-experiences__all" onClick={() => onNavigate('trip/explore')}>
        See all guide trips
      </button>
    </section>
  )
}
