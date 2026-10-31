import type { CSSProperties } from 'react'
import iconCamera from '../../assets/figma/icon-camera-white.svg'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { COLOURS, type SignUpDetails } from './onboardingData'
import './ProfilePage.css'

type ProfilePageProps = {
  details: SignUpDetails
  onChange: (patch: Partial<SignUpDetails>) => void
  onBack: () => void
  onContinue: () => void
}

export function ProfilePage({ details, onChange, onBack, onContinue }: ProfilePageProps) {
  const initial = details.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <OnboardingLayout
      eyebrow="Step 3 of 3 · Profile"
      title="Who’s travelling?"
      subtitle="This is how your squad will see you."
      step={3}
      totalSteps={3}
      onBack={onBack}
      bodyClassName="profile__body"
      actions={
        <Button variant="primary" disabled={!details.name.trim()} onClick={onContinue}>
          Let’s go
        </Button>
      }
    >
      <label className="profile__photo-picker">
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onChange({ photo: URL.createObjectURL(file) })
          }}
        />
        <span className="profile__photo">
          <span className="profile__avatar" style={{ background: details.colour }}>
            {details.photo ? <img src={details.photo} alt="Your profile photo" /> : initial}
          </span>
          <span className="profile__camera">
            <img src={iconCamera} alt="" width={16} height={16} />
          </span>
        </span>
        <span className="profile__photo-label">{details.photo ? 'Change photo' : 'Add a photo'}</span>
      </label>

      <TextField
        label="Your name"
        placeholder="Aditi"
        autoComplete="given-name"
        autoFocus
        value={details.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <TextField
        label="Username"
        placeholder="@aditi.travels"
        autoComplete="username"
        value={details.username}
        onChange={(e) => {
          const handle = e.target.value.replace(/[^a-z0-9._]/gi, '').toLowerCase()
          onChange({ username: handle ? `@${handle}` : '' })
        }}
      />

      <fieldset className="colour-picker">
        <legend className="colour-picker__label">
          Your colour <span>· on your avatar, charts and splits</span>
        </legend>
        <div className="colour-picker__swatches">
          {COLOURS.map((c) => {
            const selected = c.value === details.colour
            return (
              <button
                key={c.id}
                type="button"
                className={`colour-picker__swatch${selected ? ' colour-picker__swatch--selected' : ''}`}
                style={{ '--swatch': c.value } as CSSProperties}
                aria-label={c.label}
                aria-pressed={selected}
                onClick={() => onChange({ colour: c.value })}
              >
                {selected && <img src={iconCheck} alt="" width={18} height={18} />}
              </button>
            )
          })}
        </div>
      </fieldset>
    </OnboardingLayout>
  )
}
