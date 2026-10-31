import spiderweb from '../../assets/figma/spiderweb.svg'
import { AvatarStack } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SPIDERWEB_LABELS, VIBE, type TripDetails } from './createTripData'
import './VibeStep.css'

type VibeStepProps = {
  trip: TripDetails
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onBuild: () => void
}

export function VibeStep({ trip, onChange, onBack, onBuild }: VibeStepProps) {
  const squad = ['you' as const, ...trip.mates]

  const toggleTweak = (id: string) =>
    onChange({ tweaks: trip.tweaks.includes(id) ? trip.tweaks.filter((t) => t !== id) : [...trip.tweaks, id] })

  return (
    <OnboardingLayout
      eyebrow="New trip · Step 4 of 4"
      title="Your squad’s vibe"
      subtitle="I blended everyone’s vibe checks into one plan style."
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
            <AvatarStack people={squad} size={18} overlap={6} />
            {squad.length} vibe checks
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
        <h2 className="create-vibe-card__persona">{VIBE.persona}</h2>
        <p className="create-vibe-card__summary">{VIBE.summary}</p>
      </section>

      <section className="card create-priorities" aria-labelledby="create-priorities-title">
        <h2 id="create-priorities-title" className="overline">
          GhoomMate will prioritise
        </h2>
        <ol className="create-priorities__list">
          {VIBE.priorities.map((p, i) => (
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
