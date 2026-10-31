import { VIBE_AXES, type VibeScores } from '../data/vibe'

// Remembers your personality-quiz result on this device. Replace with your
// profile on the backend once it exists.
const KEY = 'ghoomates:vibe'

export function loadVibe(): VibeScores | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const scores = saved as Record<string, unknown>
    return VIBE_AXES.every(({ id }) => typeof scores[id] === 'number') ? (saved as VibeScores) : null
  } catch {
    return null
  }
}

export function saveVibe(scores: VibeScores): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(scores))
  } catch {
    // Private mode / blocked storage: the Itinerary just shows the sample vibe
  }
}
