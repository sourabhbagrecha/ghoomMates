import { getStoredUser, updateUserProfile } from './authService'
import { VIBE_AXES, type VibeScores } from '../data/vibe'

// Remembers your personality-quiz result on this device. Replace with your
// profile on the backend once it exists.
const KEY = 'ghoomates:vibe'

export function loadVibe(): VibeScores | null {
  try {
    const saved: unknown = getStoredUser() ? getStoredUser()?.preferences?.vibe : JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const scores = saved as Record<string, unknown>
    return VIBE_AXES.every(({ id }) => typeof scores[id] === 'number') ? (saved as VibeScores) : null
  } catch {
    return null
  }
}

export function saveVibe(scores: VibeScores): void {
  void updateUserProfile({ preferences: { vibe: scores } }).catch((error) => console.warn('Could not save vibe:', error))
  try {
    localStorage.setItem(KEY, JSON.stringify(scores))
  } catch {
    // Private mode / blocked storage: the Itinerary just shows the sample vibe
  }
}
