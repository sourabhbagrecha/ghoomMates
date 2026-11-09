import { useEffect, useState } from 'react'
import { JoinTripPage } from './JoinTripPage'
import { COLOURS, type OnboardingStep, type SignUpDetails } from './onboardingData'
import { PermissionsPage } from './PermissionsPage'
import { ProfilePage } from './ProfilePage'
import { SelfiePage } from './SelfiePage'
import { SignInPage } from './SignInPage'
import { WelcomePage } from './WelcomePage'
import { getStoredUser, hasCompletedProfile, updateUserProfile, type AuthUser } from '../../services/authService'

type OnboardingFlowProps = {
  step: OnboardingStep
  currentUser?: AuthUser | null
  /** '' is Home, for a returning user who signs in again */
  go: (step: OnboardingStep | '') => void
  onDone: (details: SignUpDetails) => void
}

/**
 * Welcome → (Invite) → Sign in (Google) → Live Selfie → About you → Permissions → app.
 * Holds what the user enters so it survives moving back and forth between steps.
 */
export function OnboardingFlow({ step, currentUser, go, onDone }: OnboardingFlowProps) {
  const initialUser = currentUser || getStoredUser()
  const [details, setDetails] = useState<SignUpDetails>(() => ({
    email: initialUser?.email || '',
    name: initialUser?.name || '',
    username: initialUser?.username || '',
    colour: COLOURS[0].value,
    photo: null,
    selfie: null,
    googleId: initialUser?.googleId,
  }))
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const update = (patch: Partial<SignUpDetails>) => {
    setDetails((d) => ({ ...d, ...patch }))
    setSaveError(null)
  }

  // Synchronize Google user information when session hydrates
  useEffect(() => {
    const u = currentUser || getStoredUser()
    if (u && (!details.email || !details.name)) {
      setDetails((prev) => ({
        ...prev,
        email: prev.email || u.email || '',
        name: prev.name || u.name || '',
        username: prev.username || u.username || '',
        googleId: prev.googleId || u.googleId,
      }))
    }
  }, [currentUser, step])

  switch (step) {
    case 'welcome':
      return <WelcomePage onGetStarted={() => go('sign-in')} onHaveInvite={() => go('invite')} />
    case 'invite':
      // "I have an invite link": paste the link, preview the trip, then sign in to join
      return <JoinTripPage />
    case 'sign-in':
      return (
        <SignInPage
          onBack={() => go('welcome')}
          onSuccess={(result) => {
            const updatedDetails: SignUpDetails = {
              ...details,
              name: result.user.name || details.name,
              email: result.user.email,
              username: result.user.username || details.username,
              photo: null, // No profile photo from Google; only name & email
              googleId: result.user.googleId,
            }
            update(updatedDetails)
            // New users continue to the live selfie; returning users already have a profile
            go(hasCompletedProfile(result.user) ? '' : 'selfie')
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
              void updateUserProfile({ picture: selfieUrl }).catch(() => setSaveError('Photo will be saved when you finish your profile'))
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
          error={saveError}
          saving={saving}
          onContinue={async () => {
            setSaving(true)
            setSaveError(null)
            try {
              await updateUserProfile({ name: details.name, username: details.username,
                picture: details.photo || undefined, preferences: { colour: details.colour } })
              onDone(details)
            } catch (error) {
              setSaveError(error instanceof Error ? error.message : 'Could not save profile')
            } finally { setSaving(false) }
          }}
        />
      )
    case 'permissions':
      return <PermissionsPage onBack={() => go('about-you')} onDone={() => onDone(details)} />
  }
}
