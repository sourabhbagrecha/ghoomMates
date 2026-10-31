import { useState } from 'react'
import { InvitePage } from './InvitePage'
import { COLOURS, type OnboardingStep, type SignUpDetails } from './onboardingData'
import { PermissionsPage } from './PermissionsPage'
import { ProfilePage } from './ProfilePage'
import { SelfiePage } from './SelfiePage'
import { SignInPage } from './SignInPage'
import { WelcomePage } from './WelcomePage'
import { updateUserProfile } from '../../services/authService'

type OnboardingFlowProps = {
  step: OnboardingStep
  go: (step: OnboardingStep) => void
  onDone: (details: SignUpDetails) => void
}

/**
 * Welcome → (Invite) → Sign in (Google) → Live Selfie → About you → Permissions → app.
 * Holds what the user enters so it survives moving back and forth between steps.
 */
export function OnboardingFlow({ step, go, onDone }: OnboardingFlowProps) {
  const [details, setDetails] = useState<SignUpDetails>({
    email: '',
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
          onBack={() => go(fromInvite ? 'invite' : 'welcome')}
          onSuccess={(result) => {
            const updatedDetails: SignUpDetails = {
              ...details,
              name: result.user.name || details.name,
              email: result.user.email,
              photo: null, // No profile photo from Google; only name & email
              googleId: result.user.googleId,
            }
            update(updatedDetails)
            // Once login is complete, navigate directly to the live selfie photo page
            go('selfie')
          }}
        />
      )
    case 'selfie':
      return (
        <SelfiePage
          userName={details.name}
          selfie={details.selfie}
          onSelfie={(selfieUrl) => {
            update({ selfie: selfieUrl, photo: selfieUrl })
            if (selfieUrl) {
              updateUserProfile({ picture: selfieUrl })
            }
          }}
          onBack={() => go('sign-in')}
          onContinue={() => go('about-you')}
        />
      )
    case 'about-you':
      return (
        <ProfilePage
          details={details}
          onChange={update}
          onBack={() => go('selfie')}
          onContinue={() => go('permissions')}
        />
      )
    case 'permissions':
      return <PermissionsPage onBack={() => go('about-you')} onDone={() => onDone(details)} />
  }
}
