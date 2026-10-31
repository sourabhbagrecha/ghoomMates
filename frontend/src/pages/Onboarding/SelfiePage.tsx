import { useRef } from 'react'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary.svg'
import iconShield from '../../assets/figma/icon-shield-primary.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import './SelfiePage.css'

const PRIVACY_POINTS = [
  'Only used to find you in your trip albums',
  'Never shared outside your squads',
  'Delete it anytime from Settings',
]

type SelfiePageProps = {
  selfie: string | null
  onSelfie: (url: string) => void
  onBack: () => void
  onContinue: () => void
}

export function SelfiePage({ selfie, onSelfie, onBack, onContinue }: SelfiePageProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const openCamera = () => fileInput.current?.click()

  return (
    <OnboardingLayout
      eyebrow="Step 4 of 4 · Face match"
      title="Add a selfie"
      subtitle="So GhoomMate can find you in the squad’s photos."
      step={4}
      onBack={onBack}
      bodyClassName="selfie__body"
      actions={
        selfie ? (
          <>
            <Button variant="primary" onClick={onContinue}>
              Continue
            </Button>
            <LinkButton onClick={openCamera}>Retake</LinkButton>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={openCamera}>
              Take selfie
            </Button>
            <LinkButton onClick={onContinue}>Skip for now</LinkButton>
          </>
        )
      }
    >
      {/* `capture` opens the front camera on phones; desktop falls back to a file picker */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onSelfie(URL.createObjectURL(file))
        }}
      />
      <div className="selfie__camera">
        <svg className="selfie__ring" width="232" height="232" viewBox="0 0 232 232" aria-hidden="true">
          <circle cx="116" cy="116" r="114.5" fill="none" stroke="var(--color-sky)" strokeWidth="3" strokeDasharray="10 8" />
        </svg>
        <span className="selfie__viewfinder">
          {selfie ? (
            <img className="selfie__preview" src={selfie} alt="Your selfie" />
          ) : (
            <img src={iconScanFace} alt="" width={84} height={84} />
          )}
        </span>
        <span className="selfie__hint">{selfie ? 'Looking good!' : 'Look straight · good light'}</span>
      </div>

      <section className="selfie__privacy">
        <h2>
          <img src={iconShield} alt="" width={18} height={18} />
          Your face, your call
        </h2>
        <ul>
          {PRIVACY_POINTS.map((point) => (
            <li key={point}>
              <img src={iconCheck} alt="" width={14} height={14} />
              {point}
            </li>
          ))}
        </ul>
      </section>
    </OnboardingLayout>
  )
}
