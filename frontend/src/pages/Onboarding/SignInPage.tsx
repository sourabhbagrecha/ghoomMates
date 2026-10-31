import iconChevron from '../../assets/figma/icon-chevron-down-muted.svg'
import iconLock from '../../assets/figma/icon-lock-sky.svg'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { COUNTRY_CODE, PHONE_LENGTH, formatPhone } from './onboardingData'
import './SignInPage.css'

type SignInPageProps = {
  phone: string
  onPhoneChange: (digits: string) => void
  onBack: () => void
  onSendCode: () => void
  /** Social sign-in skips the SMS code */
  onSocialSignIn: (provider: 'google' | 'apple') => void
}

export function SignInPage({ phone, onPhoneChange, onBack, onSendCode, onSocialSignIn }: SignInPageProps) {
  return (
    <OnboardingLayout
      eyebrow="Step 1 of 4 · Sign in"
      title="What’s your number?"
      subtitle="We’ll text you a 6-digit code to sign in."
      step={1}
      onBack={onBack}
      headerRight={
        <button type="button" className="onboarding__header-link">
          Help
        </button>
      }
      actions={
        <>
          <Button variant="primary" disabled={phone.length < PHONE_LENGTH} onClick={onSendCode}>
            Send code
          </Button>
          <p className="onboarding__footnote">By continuing you agree to our Terms and Privacy Policy</p>
        </>
      }
    >
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        autoFocus
        value={formatPhone(phone)}
        onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, PHONE_LENGTH))}
        leading={
          <button type="button" className="country-code" aria-label="Country code: India +91">
            IN {COUNTRY_CODE}
            <img src={iconChevron} alt="" width={14} height={14} />
          </button>
        }
      />
      <p className="sign-in__note">
        <img src={iconLock} alt="" width={14} height={14} />
        We never share your number. No spam, promise.
      </p>
      <div className="sign-in__divider">
        <span>or continue with</span>
      </div>
      <Button variant="outline" onClick={() => onSocialSignIn('google')}>
        Continue with Google
      </Button>
      <Button variant="outline" onClick={() => onSocialSignIn('apple')}>
        Continue with Apple
      </Button>
    </OnboardingLayout>
  )
}
