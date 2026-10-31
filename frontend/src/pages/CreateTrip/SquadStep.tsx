import iconLink from '../../assets/figma/icon-link-primary.svg'
import iconQr from '../../assets/figma/icon-qr-primary.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import type { TripDetails } from './createTripData'
import './SquadStep.css'

type SquadStepProps = {
  trip: TripDetails
  /** Your own name for the "You" row */
  userName: string
  onChange: (patch: Partial<TripDetails>) => void
  onBack: () => void
  onContinue: () => void
}

export function SquadStep({ trip, userName, onChange, onBack, onContinue }: SquadStepProps) {
  return (
    <OnboardingLayout
      eyebrow="New trip · Step 3 of 4"
      title="Who’s coming?"
      subtitle="Name the trip and the squad. You’re always in."
      step={3}
      onBack={onBack}
      bodyClassName="create-squad__body"
      actions={
        <Button variant="primary" disabled={!trip.name.trim()} onClick={onContinue}>
          Continue
        </Button>
      }
    >
      <TextField
        label="Trip name"
        placeholder="Udaipur Lake Escape"
        maxLength={60}
        value={trip.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <TextField
        label="Group name"
        placeholder="Mountain Crew"
        maxLength={40}
        value={trip.group}
        onChange={(e) => onChange({ group: e.target.value })}
      />

      <section className="card create-mates" aria-labelledby="create-mates-title">
        <div className="create-mates__header">
          <h2 id="create-mates-title" className="create-mates__title">
            Your squad
          </h2>
        </div>
        <ul className="create-mates__list">
          <li className="create-mate">
            <Avatar person="you" size={34} />
            <span className="create-mate__text">
              {userName || 'You'}
              <span>Organiser</span>
            </span>
            <span className="tag">Always in</span>
          </li>
        </ul>
      </section>

      <section className="card create-invite" aria-label="Invite mates">
        <p className="overline">Invite your mates</p>
        <div className="create-invite__options">
          <span className="create-invite__option">
            <img src={iconLink} alt="" width={18} height={18} />
            Invite link
          </span>
          <span className="create-invite__option">
            <img src={iconQr} alt="" width={18} height={18} />
            QR code
          </span>
        </div>
        <p className="create-invite__notice">
          Your trip’s invite link and QR are ready as soon as GhoomMate drafts the plan. Mates join in one tap and their vibe joins the plan.
        </p>
      </section>
    </OnboardingLayout>
  )
}
