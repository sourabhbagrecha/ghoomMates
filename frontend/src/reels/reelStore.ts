import { useSyncExternalStore } from 'react'
import { getTripState } from '../pages/Trip/tripStore'
import { planReel, ReelDirectionError, type PlannedReel } from './planner'
import type { ReelStyle } from './types'

export const DEFAULT_DIRECTION = 'Make a 30s reel of Kabir’s funniest moments with a Bollywood beat'

type ReelState = {
  /** What the user asked for in the Reel studio */
  direction: string
  style: ReelStyle | null
  status: 'idle' | 'planning' | 'ready' | 'error'
  reel: PlannedReel | null
  /** Direction the current reel was made from */
  madeFrom: string
  take: number
  error: string | null
}

// In-memory store shared by the Reel studio card and the reel screen. Resets on reload.
let state: ReelState = {
  direction: DEFAULT_DIRECTION,
  style: null,
  status: 'idle',
  reel: null,
  madeFrom: '',
  take: 0,
  error: null,
}

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const update = (patch: Partial<ReelState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const useReelStore = () => useSyncExternalStore(subscribe, () => state)

// Ignores answers to requests that a newer generate has replaced
let latest = 0

export const reelActions = {
  setDirection: (direction: string) => update({ direction }),
  setStyle: (style: ReelStyle | null) => update({ style }),
  /** Plans a reel from the current direction; regenerate asks for a different take of the same direction */
  generate: async ({ regenerate = false, direction = state.direction } = {}) => {
    const request = ++latest
    const previousTitle = regenerate ? state.reel?.plan.title : undefined
    update({ direction, status: 'planning', error: null })
    try {
      const reel = await planReel({ direction, style: state.style, picks: getTripState().reelPicks, previousTitle })
      if (request !== latest) return
      update({ status: 'ready', reel, madeFrom: direction, take: regenerate ? state.take + 1 : 1 })
    } catch (err) {
      if (request !== latest) return
      console.error('Reel planning failed:', err)
      update({
        status: 'error',
        error: err instanceof ReelDirectionError ? err.message : 'GhoomMate couldn’t cut this reel. Try again?',
      })
    }
  },
}

/** Current snapshot, for non-component code */
export const getReelState = () => state
