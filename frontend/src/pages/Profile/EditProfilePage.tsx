import { useRef, useState, type CSSProperties } from 'react'
import iconCamera from '../../assets/figma/icon-camera-white.svg'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconScanFace from '../../assets/figma/icon-scan-face-primary-20.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary-20.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { Toast } from '../../components/Toast'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { checkSingleFace } from '../../services/faceCheck'
import { toJpegIfHeic } from '../../services/tripsService'
import { COLOURS } from '../Onboarding/onboardingData'
import { ConfirmBox, ProfileAvatar } from './ProfileParts'
import { currentVibe, displayName, profileActions, useProfileStore } from './profileStore'
import './EditProfilePage.css'

export function EditProfilePage() {
  const navigate = useNavigate()
  const profile = useProfileStore()
  const vibe = currentVibe()
  const [toast, showToast] = useToast()
  const [draft, setDraft] = useState(() => ({
    name: displayName(profile),
    username: profile.username,
    colour: profile.colour,
    photo: profile.photo,
  }))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const selfieInput = useRef<HTMLInputElement>(null)
  const update = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const canSave = !!draft.name.trim() && draft.username.length > 1

  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await profileActions.saveProfile({ ...draft, name: draft.name.trim() })
      navigate('profile')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save profile')
    } finally { setSaving(false) }
  }

  return (
    <>
      <OnboardingLayout
        eyebrow="Your profile"
        title="Edit profile"
        subtitle="This is how your squad sees you."
        onBack={() => navigate('profile')}
        bodyClassName="profile-edit__body"
        actions={
          <>
            <Button variant="primary" disabled={saving || !canSave} onClick={save}>
              Save changes
            </Button>
            <LinkButton onClick={() => navigate('profile')}>Cancel</LinkButton>
          </>
        }
      >
        <label className="profile-edit__photo-picker">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) update({ photo: URL.createObjectURL(file) })
            }}
          />
          <span className="profile-edit__photo">
            <ProfileAvatar name={draft.name} colour={draft.colour} photo={draft.photo} size={96} />
            <span className="profile-edit__camera">
              <img src={iconCamera} alt="" width={16} height={16} />
            </span>
          </span>
          <span className="profile-edit__photo-label">{draft.photo ? 'Change photo' : 'Add a photo'}</span>
        </label>
        {draft.photo && (
          <LinkButton className="profile-edit__remove-photo" onClick={() => update({ photo: null })}>
            Use my initial instead
          </LinkButton>
        )}

        <TextField
          label="Your name"
          placeholder="Aditi"
          autoComplete="given-name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
        />
        <TextField
          label="Username"
          placeholder="@aditi.travels"
          autoComplete="username"
          value={draft.username}
          onChange={(e) => {
            const handle = e.target.value.replace(/[^a-z0-9._]/gi, '').toLowerCase()
            update({ username: handle ? `@${handle}` : '' })
          }}
        />

        <fieldset className="profile-edit__colours">
          <legend className="profile-edit__label">
            Your colour <span>· on your avatar, charts and splits</span>
          </legend>
          <div className="profile-edit__swatches">
            {COLOURS.map((c) => {
              const selected = c.id === draft.colour
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`profile-edit__swatch${selected ? ' profile-edit__swatch--selected' : ''}`}
                  style={{ '--swatch': c.value } as CSSProperties}
                  aria-label={c.label}
                  aria-pressed={selected}
                  onClick={() => update({ colour: c.id })}
                >
                  {selected && <img src={iconCheck} alt="" width={18} height={18} />}
                </button>
              )
            })}
          </div>
        </fieldset>

        <section className="card profile-edit__card" aria-labelledby="profile-edit-selfie">
          <input
            ref={selfieInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const picked = e.target.files?.[0]
              e.target.value = ''
              if (!picked) return
              // Camera or photo library; either way it must show just you
              showToast('Checking your photo…')
              const url = URL.createObjectURL(await toJpegIfHeic(picked))
              const result = await checkSingleFace(url)
              if (!result.ok) {
                URL.revokeObjectURL(url)
                showToast(result.message)
                return
              }
              showToast('Saving your selfie…')
              try {
                await profileActions.setSelfie(url)
                setConfirmDelete(false)
                showToast('Selfie updated')
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Could not save your selfie')
              } finally {
                URL.revokeObjectURL(url)
              }
            }}
          />
          <div className="profile-edit__row">
            <span className="profile-edit__tile">
              {profile.selfie ? (
                <img className="profile-edit__selfie" src={profile.selfie} alt="Your selfie" />
              ) : (
                <img src={iconScanFace} alt="" width={20} height={20} />
              )}
            </span>
            <span className="profile-edit__row-text">
              <strong id="profile-edit-selfie">Face match selfie</strong>
              <span>{profile.hasSelfie ? 'Finds you in the squad’s photos' : 'Not added · you won’t be found in photos'}</span>
            </span>
            <span className="profile-edit__row-actions">
              <button type="button" className="text-link" onClick={() => selfieInput.current?.click()}>
                {profile.hasSelfie ? 'Update' : 'Add'}
              </button>
              {profile.hasSelfie && !confirmDelete && (
                <button type="button" className="text-link" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </span>
          </div>
          {confirmDelete && (
            <ConfirmBox
              title="Delete your selfie?"
              confirmLabel="Delete selfie"
              onCancel={() => setConfirmDelete(false)}
              onConfirm={async () => {
                // Deletes the selfie and its face embedding on the server
                try {
                  await profileActions.deleteSelfie()
                  setConfirmDelete(false)
                  showToast('Selfie deleted')
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Could not delete your selfie')
                }
              }}
            >
              GhoomMate won’t be able to find you in trip albums until you add a new one.
            </ConfirmBox>
          )}
        </section>

        <button type="button" className="list-card profile-edit__quiz" onClick={() => navigate('quiz')}>
          <span className="profile-edit__tile">
            <img src={iconSparkles} alt="" width={20} height={20} />
          </span>
          <span className="profile-edit__row-text">
            <strong>{vibe ? 'Retake vibe quiz' : 'Take the vibe quiz'}</strong>
            <span>{vibe ? `You’re ${vibe.persona}` : '8 quick cards · about a minute'}</span>
          </span>
          <img src={iconChevron} alt="" width={16} height={16} />
        </button>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
