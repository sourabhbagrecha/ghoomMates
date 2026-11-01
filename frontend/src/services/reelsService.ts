import { getToken } from './authService'
import { ApiRequestError, request } from './tripsService'

/* Types mirror backend/src/reels/plan.ts and service.ts */

export type ReelStyle = 'cinematic' | 'energetic' | 'dreamy' | 'retro' | 'playful'
export type ReelKind = 'photo' | 'collage' | 'map' | 'stats' | 'text'
export type ReelMotion = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up'
export type ReelTransition = 'fade' | 'slide' | 'wipe' | 'flip' | 'clock-wipe' | 'iris' | 'push' | 'cut'
export type ReelEffect = 'none' | 'light-leak' | 'confetti' | 'sparkle' | 'grain'
export type ReelLayout = 'grid' | 'stack' | 'split'

export type ReelPlace = { name: string; lat: number; lng: number }
/** A true number about the trip, counted up in the stats scene */
export type ReelFact = { value: number; label: string }

export type ReelScene = {
  kind: ReelKind
  /** One for a photo scene, 2–4 for a collage, none for the others; each with a fresh signed link */
  photos: { id: string; url: string }[]
  /** A photo's caption, a map or stats heading, or a text card's words */
  caption: string
  seconds: number
  motion: ReelMotion
  /** How this scene comes in from the one before */
  transition: ReelTransition
  /** Emoji that pop onto the scene */
  stickers: string[]
  effect: ReelEffect
  layout?: ReelLayout
  /** Map pins in route order */
  places?: ReelPlace[]
}

export type ReelPlan = {
  title: string
  tagline: string
  style: ReelStyle
  scenes: ReelScene[]
  facts?: ReelFact[]
}

export type Reel = {
  id: string
  prompt: string
  plan: ReelPlan
  /** Photo time, without the title and end cards */
  seconds: number
  /** 'claude' when Gemini failed and Claude wrote it; 'template' when both did and the quick cut was used */
  source: 'gemini' | 'claude' | 'template'
  createdAt: string
  createdBy: { userId: string; name: string }
}

/** Gemini usually answers in 5–20 s; with the Claude fallback the server gives up at 105 s, so the app waits a little longer. */
const CUT_TIMEOUT_MS = 115_000

// Reels cut on this device, so the reel screen can show one straight away
const cut = new Map<string, Reel>()

const reels = (tripId: string) => `/api/reels/trips/${encodeURIComponent(tripId)}`

export const reelsApi = {
  /** The squad's reels, newest first */
  /** `mapTiles` says where map scenes get their tiles: CARTO through the backend (with a key) or Esri */
  list: (tripId: string) => request<{ items: Reel[]; mapTiles?: 'carto' | 'esri' }>(reels(tripId)),

  /** A reel this device just cut, if it still has it */
  cached: (id: string) => cut.get(id) ?? null,

  /**
   * Cuts a reel from the trip's photos (or just `photoIds`). Rejects with an ApiRequestError
   * (VALIDATION_ERROR, NOT_ENOUGH_PHOTOS, REEL_TIMEOUT, NETWORK_ERROR, …).
   */
  async create(tripId: string, prompt: string, photoIds?: string[]): Promise<Reel> {
    const token = getToken()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), CUT_TIMEOUT_MS)
    try {
      const res = await fetch(reels(tripId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt, ...(photoIds?.length ? { photoIds } : {}) }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new ApiRequestError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`)
      }
      cut.set(data.id, data)
      return data
    } catch (err) {
      if (err instanceof ApiRequestError) throw err
      if ((err as DOMException)?.name === 'AbortError') {
        throw new ApiRequestError(504, 'REEL_TIMEOUT', 'GhoomMate is taking too long to cut this one. Try again in a moment.')
      }
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'Can’t reach Ghoommates. Check your connection.')
    } finally {
      window.clearTimeout(timer)
    }
  },
}
