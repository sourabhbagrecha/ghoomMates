import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import { nextRunLabel } from '../../pages/Explore/experienceSchedule'
import { experienceById, type Experience } from '../../pages/Explore/experiencesData'
import { tripActions, useTripStore } from '../../pages/Trip/tripStore'
import { formatINR } from '../../pages/Trip/tripFormat'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { experienceRoute, type ExperiencePick, type RecommendationBasis, type UiAction } from './protocol'
import type { CardAction } from './useGhoomMateUi'

type ExperiencesCardProps = {
  city: string
  basis: RecommendationBasis
  picks: ExperiencePick[]
  pending: CardAction | null
  onAction: (action: UiAction) => void
  onNavigate: (route: string) => void
}

const HEADINGS: Record<RecommendationBasis, string> = {
  you: 'Picked for your vibe',
  squad: 'Picked for the squad',
  mood: 'Picked for your mood',
  rating: 'Top-rated guide trips',
}

type Row = { pick: ExperiencePick; experience: Experience }

/** GhoomMate’s guide-trip picks: the best one up top with Join, two varied alternatives below. */
export function ExperiencesCard({ city, basis, picks, pending, onAction, onNavigate }: ExperiencesCardProps) {
  const { joinedGuides } = useTripStore()
  // The agent sends ids; anything this build’s catalogue doesn’t know is skipped. An agent on older code may
  // send picks without why / when / fits, so those fall back to what the card can work out itself.
  const rows: Row[] = (picks ?? []).flatMap((pick) => {
    const experience = experienceById(pick.experienceId)
    if (!experience) return []
    return [
      {
        experience,
        pick: {
          ...pick,
          matchPercent: pick.matchPercent ?? null,
          why: pick.why ?? pick.reason ?? '',
          when: pick.when ?? `${nextRunLabel(experience)} · ${experience.startTime}`,
          fits: pick.fits ?? [],
        },
      },
    ]
  })
  const [hero, ...alternatives] = rows
  const open = (id: string) => onNavigate(experienceRoute(id))

  const join = (id: string) => {
    // Booking is device-only for now (same as the experience screen); the agent hears about it to reply
    tripActions.joinGuide(id)
    onAction({ type: 'experience.join', experienceId: id })
  }

  return (
    <section className="voice-card voice-picks" aria-label={`${HEADINGS[basis]} in ${city}`}>
      <p className="overline voice-card__overline">
        {HEADINGS[basis]} · {city}
      </p>

      {!hero ? (
        <p className="voice-card__text">Nothing to show here yet. Have a look in Explore?</p>
      ) : (
        <HeroPick row={hero} joined={joinedGuides.includes(hero.experience.id)} busy={pending === 'experience.join'} onOpen={open} onJoin={join} />
      )}

      {alternatives.length > 0 && (
        <ul className="voice-picks__alts" aria-label="Also good">
          {alternatives.map(({ pick, experience }) => (
            <li key={experience.id}>
              <button type="button" className="voice-picks__alt" onClick={() => open(experience.id)}>
                <img src={experience.photos[0].src} alt="" width={48} height={48} loading="lazy" />
                <span className="voice-picks__alt-text">
                  <span className="voice-picks__alt-title">{experience.title}</span>
                  <span className="voice-picks__alt-meta">
                    {pick.matchPercent !== null && <strong>{pick.matchPercent}%</strong>}
                    {pick.matchPercent !== null && ' · '}
                    {pick.when} · {formatINR(experience.price)}
                  </span>
                </span>
                {joinedGuides.includes(experience.id) ? (
                  <img src={iconCheck} alt="Joined" width={16} height={16} />
                ) : (
                  <img src={iconChevron} alt="" width={16} height={16} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(basis === 'mood' || basis === 'rating') && (
        <button type="button" className="voice-picks__quiz" onClick={() => onNavigate('quiz')}>
          <img src={iconSparkles} alt="" width={18} height={18} />
          <span>
            <strong>Take the 1-minute vibe quiz</strong>
            <span>So GhoomMate’s picks really know you</span>
          </span>
        </button>
      )}

      <button type="button" className="text-link voice-picks__all" onClick={() => onNavigate('trip/explore')}>
        See all guide trips
      </button>
    </section>
  )
}

type HeroPickProps = {
  row: Row
  joined: boolean
  busy: boolean
  onOpen: (id: string) => void
  onJoin: (id: string) => void
}

function HeroPick({ row: { pick, experience }, joined, busy, onOpen, onJoin }: HeroPickProps) {
  const seatsLeft = experience.seatsLeft - (joined ? 1 : 0)
  return (
    <article className="voice-picks__hero">
      <button type="button" className="voice-picks__photo" onClick={() => onOpen(experience.id)} aria-label={`Open ${experience.title}`}>
        <img src={experience.photos[0].src} alt={experience.photos[0].alt} />
        {pick.matchPercent !== null && (
          <span className="voice-picks__match">
            {pick.matchPercent}%<small>match</small>
          </span>
        )}
        <span className="voice-picks__seats">{seatsLeft} seats left</span>
      </button>
      <h3 className="voice-picks__title">{experience.title}</h3>
      {pick.why && (
        <p className="voice-picks__why">
          <img src={iconSparkles} alt="" width={14} height={14} />
          {pick.why}
        </p>
      )}
      <p className="voice-picks__meta">
        {pick.when} · {experience.duration} · {formatINR(experience.price)}/person
      </p>
      {pick.fits.length > 1 && (
        <ul className="voice-picks__fits" aria-label="How it suits each of you">
          {pick.fits.map((f) => (
            <li key={f.memberId}>
              <Avatar person={f.memberId} size={20} />
              {f.name} <strong>{f.matchPercent}%</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="voice-card__actions">
        <Button variant="outline" onClick={() => onOpen(experience.id)}>
          Details
        </Button>
        {joined ? (
          <Button variant="highlight" disabled>
            You’re in
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => onJoin(experience.id)}>
            {busy ? 'Joining…' : `Join · ${formatINR(experience.price)}`}
          </Button>
        )}
      </div>
    </article>
  )
}
