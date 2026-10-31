import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { pastTripActions, usePastTrips } from '../../data/pastTripStore'
import { useNavigate } from '../../hooks/navigation'
import { REMEMBER_OPTIONS, type PastTripDetails } from './pastTripData'
import { StarRating } from './StarRating'
import './RatePage.css'

const VERDICTS = ['', 'Not for us', 'It was okay', 'Pretty good', 'Loved it', 'Best trip yet']

type RatePageProps = {
  details: PastTripDetails
  /** Stars tapped on the recap card, to start from */
  initialStars?: number
}

export function RatePage({ details, initialStars }: RatePageProps) {
  const navigate = useNavigate()
  const { ratings } = usePastTrips()
  const { trip } = details
  const back = () => navigate(`past/${trip.id}`)
  // One highlight per day: the stop the squad rated best
  const highlights = details.days.map((d) => d.stops.reduce((best, s) => (s.rating > best.rating ? s : best)))

  const [overall, setOverall] = useState(initialStars ?? ratings[trip.id] ?? 0)
  const [stopRatings, setStopRatings] = useState<Record<string, number>>({})
  const [remember, setRemember] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  const toggleRemember = (option: string) =>
    setRemember((prev) => {
      const next = new Set(prev)
      if (next.has(option)) next.delete(option)
      else next.add(option)
      return next
    })

  if (saved) {
    return (
      <OnboardingLayout
        eyebrow={`${trip.name} · Rated ${overall} of 5`}
        title="Thanks!"
        onBack={back}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="rate__body"
        actions={
          <Button variant="primary" onClick={back}>
            Back to recap
          </Button>
        }
      >
        <section className="card rate__thanks">
          <GhoomMateAvatar size={96} ring={4} />
          <p className="rate__thanks-title">Got it, I’ll remember this</p>
          <p className="rate__thanks-text">
            Next time the {trip.group} plans a trip, I’ll lean on what you loved here
            {remember.size ? `: ${[...remember].join(', ').toLowerCase()}` : ''}.
          </p>
        </section>
      </OnboardingLayout>
    )
  }

  return (
    <OnboardingLayout
      eyebrow={`${trip.name} · ${details.dates}`}
      title="How was it?"
      onBack={back}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="rate__body"
      actions={
        <Button
          variant="primary"
          disabled={!overall}
          onClick={() => {
            // TODO: send the rating and notes to GhoomMate's trip memory
            pastTripActions.rate(trip.id, overall)
            setSaved(true)
          }}
        >
          Save rating
        </Button>
      }
    >
      <section className="card rate__overall">
        <p className="overline">The whole trip</p>
        <StarRating value={overall} size={36} label={`Rate ${trip.name}`} onChange={setOverall} />
        <p className="rate__verdict">{overall ? VERDICTS[overall] : 'Tap a star'}</p>
      </section>

      <SectionHeader title="Rate the highlights" />
      <ul className="rate__stops">
        {highlights.map((stop) => (
          <li key={stop.title} className="list-card rate__stop">
            <img src={stop.photo} alt="" width={44} height={44} />
            <p className="rate__stop-title">{stop.title}</p>
            <StarRating
              value={stopRatings[stop.title] ?? 0}
              size={18}
              label={`Rate ${stop.title}`}
              onChange={(s) => setStopRatings((prev) => ({ ...prev, [stop.title]: s }))}
            />
          </li>
        ))}
      </ul>

      <SectionHeader title="What should GhoomMate remember?" />
      <div className="rate__remember">
        {REMEMBER_OPTIONS.map((option) => (
          <Chip key={option} selected={remember.has(option)} onClick={() => toggleRemember(option)}>
            {option}
          </Chip>
        ))}
      </div>

      <label className="rate__note">
        <span className="rate__note-label">Anything else? (optional)</span>
        <textarea
          rows={3}
          placeholder="The bonfire night was the best part…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </OnboardingLayout>
  )
}
