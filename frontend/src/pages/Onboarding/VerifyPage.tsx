import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { OtpInput } from '../../components/OtpInput'
import { useNavigate } from '../../hooks/navigation'
import { COUNTRY_CODE, OTP_LENGTH, RESEND_SECONDS, formatPhone } from './onboardingData'
import './VerifyPage.css'

type VerifyPageProps = {
  phone: string
  onBack: () => void
  onEditNumber: () => void
  onVerified: () => void
}

export function VerifyPage({ phone, onBack, onEditNumber, onVerified }: VerifyPageProps) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (secondsLeft === 0) return
    const timer = setTimeout(() => setSecondsLeft((s: number) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  return (
    <OnboardingLayout
      eyebrow="Step 2 of 4 · Verify"
      title="Enter the code"
      subtitle={
        <>
          Sent to {COUNTRY_CODE} {phone ? formatPhone(phone) : 'your number'} ·{' '}
          <button type="button" className="verify__edit" onClick={onEditNumber}>
            Edit
          </button>
        </>
      }
      step={2}
      onBack={onBack}
      headerRight={
        <button type="button" className="onboarding__header-link" onClick={() => navigate('profile/help')}>
          Help
        </button>
      }
      bodyClassName="verify__body"
      actions={
        <Button variant="primary" disabled={code.length < OTP_LENGTH} onClick={onVerified}>
          Verify and continue
        </Button>
      }
    >
      <OtpInput value={code} onChange={setCode} length={OTP_LENGTH} autoFocus />
      <p className="verify__resend">
        Didn’t get it?{' '}
        {secondsLeft > 0 ? (
          <span>Resend in 0:{String(secondsLeft).padStart(2, '0')}</span>
        ) : (
          <button type="button" onClick={() => setSecondsLeft(RESEND_SECONDS)}>
            Resend code
          </button>
        )}
      </p>
      <GhoomMateTip>I’ll fill it in automatically as soon as the SMS arrives.</GhoomMateTip>
    </OnboardingLayout>
  )
}
