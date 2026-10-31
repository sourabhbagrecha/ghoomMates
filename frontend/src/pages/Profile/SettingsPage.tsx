import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { Toast } from '../../components/Toast'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { signOut } from '../../services/onboardingStorage'
import { ACCOUNT, APP_VERSION, LANGUAGES, NOTIFICATION_PREFS, isValidUpi } from './profileData'
import { ConfirmBox, Switch } from './ProfileParts'
import { displayName, profileActions, useProfileStore } from './profileStore'
import './SettingsPage.css'

type Confirm = 'selfie' | 'logout' | 'delete' | null

export function SettingsPage() {
  const navigate = useNavigate()
  const profile = useProfileStore()
  const [toast, showToast] = useToast()
  const [upiDraft, setUpiDraft] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const upiValid = upiDraft !== null && isValidUpi(upiDraft)

  const saveUpi = () => {
    if (!upiValid) return
    // TODO: verify the UPI ID with the payments provider
    profileActions.setUpi(upiDraft)
    setUpiDraft(null)
    showToast('UPI ID updated')
  }

  const logOut = () => {
    // TODO: end the server session too
    signOut()
    profileActions.reset()
    navigate('welcome')
  }

  return (
    <>
      <OnboardingLayout
        eyebrow={`${displayName(profile)} · ${profile.username}`}
        title="Settings"
        onBack={() => navigate('profile')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="app-settings__body"
      >
        <section className="card app-settings__card" aria-labelledby="app-settings-account">
          <h2 id="app-settings-account" className="overline">
            Account
          </h2>
          <div className="app-settings__row">
            <span className="app-settings__row-text">
              <span className="app-settings__label">Phone</span>
              <span className="app-settings__value">
                {ACCOUNT.phone}
                <span className="app-settings__verified">
                  <img src={iconCheck} alt="" width={12} height={12} />
                  Verified
                </span>
              </span>
            </span>
            {/* TODO: change number with a fresh OTP */}
            <button type="button" className="text-link" onClick={() => showToast('Changing your number needs a new OTP · coming soon')}>
              Change
            </button>
          </div>
          {upiDraft === null ? (
            <div className="app-settings__row">
              <span className="app-settings__row-text">
                <span className="app-settings__label">UPI ID · for settling up</span>
                <span className="app-settings__value">{profile.upi}</span>
              </span>
              <button type="button" className="text-link" onClick={() => setUpiDraft(profile.upi)}>
                Edit
              </button>
            </div>
          ) : (
            <form
              className="app-settings__row app-settings__upi"
              onSubmit={(e) => {
                e.preventDefault()
                saveUpi()
              }}
            >
              <TextField
                label="UPI ID"
                placeholder="name@bank"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={upiDraft}
                aria-invalid={!upiValid}
                aria-describedby="app-settings-upi-hint"
                onChange={(e) => setUpiDraft(e.target.value)}
              />
              <p id="app-settings-upi-hint" className="app-settings__hint">
                {upiValid ? 'Your mates pay you here when they settle up' : 'Use the name@bank format, e.g. aditi@okaxis'}
              </p>
              <div className="app-settings__upi-actions">
                <button type="submit" className="pill-button" disabled={!upiValid}>
                  Save
                </button>
                <button type="button" className="text-link" onClick={() => setUpiDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="app-settings__row">
            <span className="app-settings__row-text">
              <span className="app-settings__label">Email</span>
              <span className="app-settings__value">{ACCOUNT.email}</span>
            </span>
            {/* TODO: email change with a verification link */}
            <button type="button" className="text-link" onClick={() => showToast('We’ll send a link to confirm · coming soon')}>
              Change
            </button>
          </div>
        </section>

        <section className="card app-settings__card" aria-labelledby="app-settings-notifications">
          <h2 id="app-settings-notifications" className="overline">
            Notifications
          </h2>
          <ul className="app-settings__toggles">
            {NOTIFICATION_PREFS.map((n) => (
              <li key={n.id} className="app-settings__toggle-row">
                <span className="app-settings__row-text">
                  <span className="app-settings__title">{n.title}</span>
                  <span className="app-settings__label">{n.description}</span>
                </span>
                <Switch on={profile.notifications[n.id]} label={n.title} onChange={() => profileActions.toggleNotification(n.id)} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card app-settings__card" aria-labelledby="app-settings-privacy">
          <h2 id="app-settings-privacy" className="overline">
            Privacy
          </h2>
          <ul className="app-settings__toggles">
            <li className="app-settings__toggle-row">
              <span className="app-settings__row-text">
                <span className="app-settings__title">Face match in photos</span>
                <span className="app-settings__label">Find you in your squads’ albums</span>
              </span>
              <Switch
                on={profile.faceMatch}
                label="Face match in photos"
                onChange={(on) => {
                  profileActions.setFaceMatch(on)
                  showToast(on ? 'Face match on' : 'Face match off · you won’t be tagged in new photos')
                }}
              />
            </li>
            <li className="app-settings__toggle-row app-settings__toggle-row--stacked">
              <div className="app-settings__selfie">
                <span className="app-settings__row-text">
                  <span className="app-settings__title">Your selfie</span>
                  <span className="app-settings__label">
                    {profile.hasSelfie ? 'Saved · only used for face match' : 'Not saved'}
                  </span>
                </span>
                {profile.hasSelfie ? (
                  confirm !== 'selfie' && (
                    <button type="button" className="text-link" onClick={() => setConfirm('selfie')}>
                      Delete my selfie
                    </button>
                  )
                ) : (
                  <button type="button" className="text-link" onClick={() => navigate('profile/edit')}>
                    Add one
                  </button>
                )}
              </div>
              {confirm === 'selfie' && (
                <ConfirmBox
                  title="Delete your selfie?"
                  confirmLabel="Delete selfie"
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => {
                    // TODO: delete the selfie and face index on the server
                    profileActions.deleteSelfie()
                    setConfirm(null)
                    showToast('Selfie deleted')
                  }}
                >
                  GhoomMate won’t find you in trip albums until you add a new one.
                </ConfirmBox>
              )}
            </li>
            <li className="app-settings__toggle-row">
              <span className="app-settings__row-text">
                <span className="app-settings__title">Share location during trips</span>
                <span className="app-settings__label">Only with that trip’s squad, only while it’s live</span>
              </span>
              <Switch
                on={profile.locationSharing}
                label="Share location during trips"
                onChange={profileActions.setLocationSharing}
              />
            </li>
          </ul>
        </section>

        <section className="card app-settings__card" aria-labelledby="app-settings-app">
          <h2 id="app-settings-app" className="overline">
            App
          </h2>
          <div className="app-settings__stack">
            <span className="app-settings__title" id="app-settings-language">
              Language
            </span>
            <div className="app-settings__chips" role="group" aria-labelledby="app-settings-language">
              {LANGUAGES.map((l) => (
                <Chip
                  key={l.id}
                  selected={profile.language === l.id}
                  onClick={() => {
                    profileActions.setLanguage(l.id)
                    // TODO: translations
                    if (l.id !== 'en') showToast('हिन्दी is coming soon. We’ll switch once it’s ready')
                  }}
                >
                  {l.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="app-settings__row">
            <span className="app-settings__row-text">
              <span className="app-settings__label">Currency</span>
              <span className="app-settings__value">₹ INR</span>
            </span>
            <span className="app-settings__note">More currencies soon</span>
          </div>
        </section>

        <section className="card app-settings__card" aria-labelledby="app-settings-legal">
          <h2 id="app-settings-legal" className="overline">
            Legal
          </h2>
          {/* TODO: link to the hosted documents */}
          {['Terms of service', 'Privacy policy'].map((doc) => (
            <button key={doc} type="button" className="app-settings__row app-settings__link" onClick={() => showToast(`${doc} opens soon`)}>
              <span className="app-settings__title">{doc}</span>
              <img src={iconChevron} alt="" width={16} height={16} />
            </button>
          ))}
        </section>

        <div className="app-settings__exit">
          {confirm === 'logout' ? (
            <ConfirmBox title="Log out of Ghoomate?" confirmLabel="Yes, log out" onConfirm={logOut} onCancel={() => setConfirm(null)}>
              Your trips stay safe. You’ll sign in with your phone number next time.
            </ConfirmBox>
          ) : (
            <Button variant="outline" onClick={() => setConfirm('logout')}>
              Log out
            </Button>
          )}
          {confirm === 'delete' ? (
            <ConfirmBox
              title="Delete your account?"
              confirmLabel="Delete my account"
              onCancel={() => setConfirm(null)}
              onConfirm={() => {
                // TODO: account deletion request on the server
                setConfirm(null)
                showToast(`We’ve emailed ${ACCOUNT.email} to confirm`)
              }}
            >
              This removes your profile, selfie and photos within 30 days. Squads keep the expenses you shared so their
              balances still add up.
            </ConfirmBox>
          ) : (
            <LinkButton onClick={() => setConfirm('delete')}>Delete account</LinkButton>
          )}
          <p className="onboarding__footnote">{APP_VERSION}</p>
          {/* For the team: preview the shared loading / empty / error / offline states */}
          <button type="button" className="text-link app-settings__states" onClick={() => navigate('states')}>
            Preview system states
          </button>
        </div>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
