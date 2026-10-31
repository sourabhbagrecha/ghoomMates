import { useSyncExternalStore } from 'react'
import { SAMPLE_YOU_VIBE } from '../../data/vibe'
import { getStoredUser, subscribeAuth, updateUserProfile } from '../../services/authService'
import { getProfileName } from '../../services/onboardingStorage'
import { loadVibe } from '../../services/vibeStorage'
import { COLOURS } from '../Onboarding/onboardingData'
import {
  ACCOUNT,
  DEFAULT_NOTIFICATION_PREFS,
  vibeResultFor,
  type LanguageId,
  type NotificationPrefId,
  type VibeResult,
} from './profileData'

// Your profile and settings. Shared by every Profile screen (they remount on
// each route). Name and photo are saved to the signed-in account; the rest
// resets on reload until there's a profile service.
type ProfileState = {
  /** null until edited here; falls back to the name from sign-up */
  name: string | null
  username: string
  /** Id from the onboarding COLOURS */
  colour: string
  photo: string | null
  hasSelfie: boolean
  selfie: string | null
  upi: string
  notifications: Readonly<Record<NotificationPrefId, boolean>>
  faceMatch: boolean
  locationSharing: boolean
  language: LanguageId
}

const initialState = (): ProfileState => ({
  name: null,
  username: ACCOUNT.username,
  colour: COLOURS[0].id,
  photo: getStoredUser()?.picture || null,
  // Taken during sign-up
  hasSelfie: true,
  selfie: null,
  upi: ACCOUNT.upi,
  notifications: DEFAULT_NOTIFICATION_PREFS,
  faceMatch: true,
  locationSharing: true,
  language: 'en',
})

let state = initialState()
/** One-off message for the next profile screen to show, e.g. after saving */
let notice: string | null = null
const listeners = new Set<() => void>()

const set = (patch: Partial<ProfileState>) => {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Follow the account: a new selfie or sign-in brings its photo, signing out starts over
subscribeAuth((user) => (user ? set({ photo: user.picture || null }) : set(initialState())))

export const useProfileStore = () => useSyncExternalStore(subscribe, () => state)

/** Display name: edited here, else from sign-up, else the mock user */
export const displayName = (s: ProfileState) => s.name?.trim() || getProfileName() || ACCOUNT.fallbackName

export const colourValue = (id: string) => (COLOURS.find((c) => c.id === id) ?? COLOURS[0]).value

/** Amber is too light for a white initial, so it gets a primary one (like the header avatar) */
export const isLightColour = (id: string) => id === COLOURS[0].id

export const profileActions = {
  saveProfile: (patch: Pick<ProfileState, 'name' | 'username' | 'colour' | 'photo'>) => {
    set(patch)
    notice = 'Profile saved'
    void updateUserProfile({ name: patch.name ?? undefined, picture: patch.photo ?? '' })
  },
  setSelfie: (selfie: string) => set({ hasSelfie: true, selfie }),
  deleteSelfie: () => set({ hasSelfie: false, selfie: null }),
  setUpi: (upi: string) => set({ upi: upi.trim() }),
  toggleNotification: (id: NotificationPrefId) =>
    set({ notifications: { ...state.notifications, [id]: !state.notifications[id] } }),
  setFaceMatch: (on: boolean) => set({ faceMatch: on }),
  setLocationSharing: (on: boolean) => set({ locationSharing: on }),
  setLanguage: (language: LanguageId) => set({ language }),
  /** Returns the pending notice once, then clears it */
  takeNotice: () => {
    const message = notice
    notice = null
    return message
  },
  reset: () => {
    notice = null
    set(initialState())
  },
}

/** Your vibe from the personality quiz (#/quiz), or the sample one until you've taken it */
export const currentVibe = (): VibeResult => vibeResultFor(loadVibe() ?? SAMPLE_YOU_VIBE)
