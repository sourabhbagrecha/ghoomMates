import { getStoredUser, updateUserProfile, type AuthUser } from './authService'
import { VIBE_AXES, type VibeScores } from '../data/vibe'

// Your personality-quiz result lives on your profile (users.preferences.vibe), where GhoomMate and the squad
// spiderweb read it. A copy stays on this device so a quiz taken before signing up isn't lost.
const KEY = 'ghoomates:vibe'

const asScores = (saved: unknown): VibeScores | null => {
  if (typeof saved !== 'object' || saved === null) return null
  const scores = saved as Record<string, unknown>
  return VIBE_AXES.every(({ id }) => typeof scores[id] === 'number') ? (saved as VibeScores) : null
}

function loadLocalVibe(): VibeScores | null {
  try {
    return asScores(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return null
  }
}

/** Your quiz result: the profile's, else this device's; null until you've taken the quiz */
export function loadVibe(): VibeScores | null {
  return asScores(getStoredUser()?.preferences?.vibe) ?? loadLocalVibe()
}

let synced = false

/** Signed in with a quiz result only on this device (taken before signing up): save it to the profile once */
export function syncVibeToProfile(user: AuthUser | null) {
  if (synced || !user || asScores(user.preferences?.vibe)) return
  const local = loadLocalVibe()
  if (!local) return
  synced = true
  void updateUserProfile({ preferences: { vibe: local } }).catch((error) => {
    synced = false
    console.warn('Could not save vibe:', error)
  })
}

export function saveVibe(scores: VibeScores): void {
  void updateUserProfile({ preferences: { vibe: scores } }).catch((error) => console.warn('Could not save vibe:', error))
  try {
    localStorage.setItem(KEY, JSON.stringify(scores))
  } catch {
    // Private mode / blocked storage: the Itinerary just shows the sample vibe
  }
}
