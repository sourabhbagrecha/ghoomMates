import spiderweb from '../../assets/figma/spiderweb.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { personaFor, VIBE_AXES, type VibeAxis } from '../../data/vibe'
import { loadVibe } from '../../services/vibeStorage'
import { SPIDERWEB_LABELS, VIBE, type TripDetails } from './createTripData'
import './VibeStep.css'

const PRIORITIES: Record<VibeAxis, { title: string; detail: string }> = {
  adventure: { title: 'One big adventure a day', detail: 'Treks, water sports and the best viewpoints' },
  food: { title: 'Local food over tourist traps', detail: 'Street food, regional thalis and cafés locals love' },
  nightlife: { title: 'Fun nights out', detail: 'Live music and the liveliest spots after dark' },
  culture: { title: 'History and local culture', detail: 'Forts, temples, museums and old-town walks' },
  chill: { title: 'Easy, unhurried pacing', detail: 'Sunsets, cafés and slow mornings' },
  shops: { title: 'Time for markets', detail: 'Local crafts and souvenir stops' },
}

type VibeStepProps = {
  trip: TripDetails
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onBuild: () => void
}

export function VibeStep({ trip, onChange, onBack, onBuild }: VibeStepProps) {
  // Your quiz result shapes the first draft; mates' vibes blend in as they join
  const vibe = loadVibe()
  const top = vibe ? [...VIBE_AXES].sort((a, b) => vibe[b.id] - vibe[a.id]).slice(0, 3) : null
  const priorities = top ? top.map((a) => PRIORITIES[a.id]) : VIBE.priorities

  const toggleTweak = (id: string) =>
    onChange({ tweaks: trip.tweaks.includes(id) ? trip.tweaks.filter((t) => t !== id) : [...trip.tweaks, id] })

  return (
    <OnboardingLayout
      eyebrow="New trip · Step 4 of 4"
      title="Your squad’s vibe"
      subtitle="I’ll blend everyone’s vibe checks into one plan style."
      step={4}
      onBack={onBack}
      bodyClassName="create-vibe__body"
      actions={
        <Button variant="primary" onClick={onBuild}>
          Build my plan
        </Button>
      }
    >
      <section className="card create-vibe-card">
        <div className="create-vibe-card__top">
          <p className="overline">Squad spiderweb</p>
          <span className="create-vibe-card__squad">
            <AvatarStack people={['you']} size={18} overlap={6} />
            {vibe ? 'Your vibe check' : 'Sample vibe'}
          </span>
        </div>
        <div
          className="create-web"
          role="img"
          aria-label="Squad vibe chart: high on adventure and food, medium on culture and chill, low on nightlife and shops"
        >
          <img src={spiderweb} alt="" width={264} height={210} />
          {SPIDERWEB_LABELS.map(({ label, x, y, anchor }) => (
            <span key={label} className={`create-web__label create-web__label--${anchor}`} style={{ left: x, top: y }}>
              {label}
            </span>
          ))}
        </div>
        <div className="create-vibe-card__legend">
          <span className="create-vibe-card__legend-item">
            <span className="create-vibe-card__swatch create-vibe-card__swatch--squad" />
            Squad
          </span>
          <span className="create-vibe-card__legend-item">
            <span className="create-vibe-card__swatch create-vibe-card__swatch--you" />
            You
          </span>
        </div>
        <h2 className="create-vibe-card__persona">{vibe ? personaFor(vibe) : VIBE.persona}</h2>
        <p className="create-vibe-card__summary">
          {vibe ? 'Mates who join add their vibe, and the plan adapts to the whole squad.' : VIBE.summary}
        </p>
      </section>

      <section className="card create-priorities" aria-labelledby="create-priorities-title">
        <h2 id="create-priorities-title" className="overline">
          GhoomMate will prioritise
        </h2>
        <ol className="create-priorities__list">
          {priorities.map((p, i) => (
            <li key={p.title} className="create-priorities__item">
              <span className="create-priorities__number" aria-hidden="true">
                {i + 1}
              </span>
              <span className="create-priorities__text">
                {p.title}
                <span>{p.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="create-tweaks">
        <h2 className="create-tweaks__label">
          Want to tweak it? <span>· optional</span>
        </h2>
        <div className="create-tweaks__chips" role="group" aria-label="Tweaks">
          {VIBE.tweaks.map((t) => (
            <Chip key={t.id} selected={trip.tweaks.includes(t.id)} onClick={() => toggleTweak(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
    </OnboardingLayout>
  )
}
