import { useSyncExternalStore } from 'react'
import { getProfileName } from '../../services/onboardingStorage'
import { COLOURS } from '../Onboarding/onboardingData'
import {
  ACCOUNT,
  DEFAULT_ANSWERS,
  DEFAULT_NOTIFICATION_PREFS,
  computeVibe,
  type LanguageId,
  type NotificationPrefId,
  type QuizAnswers,
  type VibeResult,
} from './profileData'

// Your profile, settings and vibe quiz. Shared by every Profile screen (they
// remount on each route); resets on reload until there's a profile service.
type ProfileState = {
  /** null until edited here; falls back to the name from sign-up */
  name: string | null
  username: string
  /** Id from the onboarding COLOURS */
  colour: string
  photo: string | null
  hasSelfie: boolean
  selfie: string | null
  vibe: VibeResult
  answers: QuizAnswers
  /** Answers in progress, kept while moving between quiz cards */
  draft: QuizAnswers
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
  photo: null,
  // Taken during sign-up
  hasSelfie: true,
  selfie: null,
  vibe: computeVibe(DEFAULT_ANSWERS),
  answers: DEFAULT_ANSWERS,
  draft: DEFAULT_ANSWERS,
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

export const quizActions = {
  answer: (questionId: string, optionIds: readonly string[]) =>
    set({ draft: { ...state.draft, [questionId]: optionIds } }),
  /** Saves the draft as your vibe */
  save: () => {
    const vibe = computeVibe(state.draft)
    set({ vibe, answers: state.draft })
    notice = `Vibe saved · ${vibe.persona}`
  },
  /** Throws away unsaved answers */
  discard: () => set({ draft: state.answers }),
}
