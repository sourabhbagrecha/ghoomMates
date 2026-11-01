import { getStoredUser, updateUserProfile, type AuthUser } from './authService'
import { VIBE_AXES, type VibeScores } from '../data/vibe'

// Your personality-quiz result lives on your profile (users.preferences.vibe), where GhoomMate, the squad
// spiderweb and the itinerary read it. A quiz taken while signed out (before sign-up) is kept on this device
// until you sign in, then moved to your profile. Only that pending copy is ever read, never another account's.
const PENDING_KEY = 'ghoommates:vibe:pending'

const asScores = (saved: unknown): VibeScores | null => {
  if (typeof saved !== 'object' || saved === null) return null
  const scores = saved as Record<string, unknown>
  return VIBE_AXES.every(({ id }) => typeof scores[id] === 'number') ? (saved as VibeScores) : null
}

function loadPendingVibe(): VibeScores | null {
  try {
    return asScores(JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null'))
  } catch {
    return null
  }
}

function clearPendingVibe() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Blocked storage: nothing was kept
  }
}

/** Your quiz result: signed in, your profile's; signed out, the one taken on this device. Null until taken. */
export function loadVibe(): VibeScores | null {
  const user = getStoredUser()
  return user ? asScores(user.preferences?.vibe) : loadPendingVibe()
}

export function saveVibe(scores: VibeScores): void {
  if (getStoredUser()) {
    clearPendingVibe()
    void updateUserProfile({ preferences: { vibe: scores } }).catch((error) => console.warn('Could not save vibe:', error))
    return
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(scores))
  } catch {
    // Private mode / blocked storage: retake the quiz after signing in
  }
}

let syncing = false

/** Just signed in with a quiz taken while signed out: move it to the profile (unless the profile has one) */
export function syncVibeToProfile(user: AuthUser | null) {
  if (syncing || !user) return
  const pending = loadPendingVibe()
  if (!pending) return
  if (asScores(user.preferences?.vibe)) return clearPendingVibe()
  syncing = true
  void updateUserProfile({ preferences: { vibe: pending } })
    .then(clearPendingVibe, (error) => console.warn('Could not save vibe:', error))
    .finally(() => {
      syncing = false
    })
}
