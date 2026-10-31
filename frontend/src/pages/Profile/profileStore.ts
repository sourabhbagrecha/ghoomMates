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

// Profile and settings hydrate from the signed-in account.
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

// The face-match selfie stays on this device, per account (too big for the profile request)
const selfieKey = () => {
  const id = getStoredUser()?.id
  return id ? `ghoomates:selfie:${id}` : null
}
const storedSelfie = () => {
  const key = selfieKey()
  try {
    return key ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}
const storeSelfie = (selfie: string | null) => {
  const key = selfieKey()
  if (!key) return
  try {
    if (selfie) localStorage.setItem(key, selfie)
    else localStorage.removeItem(key)
  } catch {
    // Storage full or blocked: the selfie still works until the next reload
  }
}

const initialState = (): ProfileState => ({
  name: null,
  username: getStoredUser()?.username || '',
  colour: COLOURS[0].id,
  photo: getStoredUser()?.picture || null,
  // Taken during sign-up
  hasSelfie: true,
  selfie: storedSelfie(),
  upi: ACCOUNT.upi,
  notifications: DEFAULT_NOTIFICATION_PREFS,
  faceMatch: true,
  locationSharing: true,
  language: 'en',
})

function accountState(): ProfileState {
  const user = getStoredUser()
  const prefs = user?.preferences || {}
  const base = initialState()
  return { ...base, name: user?.name || null,
    colour: typeof prefs.colour === 'string' ? prefs.colour : base.colour,
    upi: typeof prefs.upi === 'string' ? prefs.upi : base.upi,
    notifications: { ...base.notifications, ...(prefs.notifications as Partial<ProfileState['notifications']> || {}) },
    faceMatch: typeof prefs.faceMatch === 'boolean' ? prefs.faceMatch : base.faceMatch,
    locationSharing: typeof prefs.locationSharing === 'boolean' ? prefs.locationSharing : base.locationSharing,
    language: prefs.language === 'hi' ? 'hi' : 'en',
  }
}
let state = accountState()
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
subscribeAuth((user) => set(user ? accountState() : initialState()))

export const useProfileStore = () => useSyncExternalStore(subscribe, () => state)

/** Display name: edited here, else from sign-up, else the mock user */
export const displayName = (s: ProfileState) => s.name?.trim() || getProfileName() || ACCOUNT.fallbackName

export const colourValue = (id: string) => (COLOURS.find((c) => c.id === id) ?? COLOURS[0]).value

/** Amber is too light for a white initial, so it gets a primary one (like the header avatar) */
export const isLightColour = (id: string) => id === COLOURS[0].id

const persist = (patch: Partial<ProfileState>) => {
  set(patch)
  void updateUserProfile({ preferences: patch }).catch(() => { notice = 'Could not save settings. Please try again.' })
}

export const profileActions = {
  saveProfile: async (patch: Pick<ProfileState, 'name' | 'username' | 'colour' | 'photo'>) => {
    await updateUserProfile({ name: patch.name ?? undefined, username: patch.username,
      picture: patch.photo ?? '', preferences: { colour: patch.colour } })
    notice = 'Profile saved'
  },
  /** Takes a data URL so it can be kept across reloads */
  setSelfie: (selfie: string) => {
    storeSelfie(selfie)
    set({ hasSelfie: true, selfie })
  },
  deleteSelfie: () => {
    storeSelfie(null)
    set({ hasSelfie: false, selfie: null })
  },
  setUpi: (upi: string) => persist({ upi: upi.trim() }),
  toggleNotification: (id: NotificationPrefId) =>
    persist({ notifications: { ...state.notifications, [id]: !state.notifications[id] } }),
  setFaceMatch: (on: boolean) => persist({ faceMatch: on }),
  setLocationSharing: (on: boolean) => persist({ locationSharing: on }),
  setLanguage: (language: LanguageId) => persist({ language }),
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
