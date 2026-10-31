import { useState } from 'react'
import { InvitePage } from './InvitePage'
import { COLOURS, type OnboardingStep, type SignUpDetails } from './onboardingData'
import { PermissionsPage } from './PermissionsPage'
import { ProfilePage } from './ProfilePage'
import { SelfiePage } from './SelfiePage'
import { SignInPage } from './SignInPage'
import { VerifyPage } from './VerifyPage'
import { WelcomePage } from './WelcomePage'

type OnboardingFlowProps = {
  step: OnboardingStep
  go: (step: OnboardingStep) => void
  onDone: () => void
}

/**
 * Welcome → (Invite) → Sign in → Verify → Profile → Selfie → Permissions → app.
 * Holds what the user enters so it survives moving back and forth between steps.
 */
export function OnboardingFlow({ step, go, onDone }: OnboardingFlowProps) {
  const [details, setDetails] = useState<SignUpDetails>({
    phone: '',
    name: '',
    username: '',
    colour: COLOURS[0].value,
    photo: null,
    selfie: null,
  })
  const [fromInvite, setFromInvite] = useState(false)
  const update = (patch: Partial<SignUpDetails>) => setDetails((d) => ({ ...d, ...patch }))

  switch (step) {
    case 'welcome':
      return <WelcomePage onGetStarted={() => go('sign-in')} onHaveInvite={() => go('invite')} />
    case 'invite':
      return (
        <InvitePage
          onBack={() => go('welcome')}
          onJoin={() => {
            setFromInvite(true)
            go('sign-in')
          }}
          onDecline={() => go('welcome')}
        />
      )
    case 'sign-in':
      return (
        <SignInPage
          phone={details.phone}
          onPhoneChange={(phone) => update({ phone })}
          onBack={() => go(fromInvite ? 'invite' : 'welcome')}
          onSendCode={() => go('verify')}
          onSocialSignIn={() => go('profile')}
        />
      )
    case 'verify':
      return (
        <VerifyPage
          phone={details.phone}
          onBack={() => go('sign-in')}
          onEditNumber={() => go('sign-in')}
          onVerified={() => go('profile')}
        />
      )
    case 'profile':
      return <ProfilePage details={details} onChange={update} onBack={() => go('verify')} onContinue={() => go('selfie')} />
    case 'selfie':
      return (
        <SelfiePage
          selfie={details.selfie}
          onSelfie={(selfie) => update({ selfie })}
          onBack={() => go('profile')}
          onContinue={() => go('permissions')}
        />
      )
    case 'permissions':
      return <PermissionsPage onBack={() => go('selfie')} onDone={onDone} />
  }
}
