import { getToken } from './authService'
import { ApiRequestError, request } from './tripsService'

/* Types mirror backend/src/artworks/service.ts */

export type ArtworkStyleId = 'mewar-miniature' | 'royal-procession' | 'jharokha-portrait' | 'phad-scroll'

export type Artwork = {
  id: string
  style: ArtworkStyleId | string
  styleName: string
  /** A fresh signed link, valid for 12 hours */
  url: string
  createdAt: string
  /** The trip photo it was painted from, or null once that photo is deleted */
  photoId: string | null
  createdBy: { userId: string; name: string }
}

/** How many paintings the squad has left today */
export type ArtworkLimit = { perDay: number; used: number; remaining: number }

export type ArtworkGallery = { items: Artwork[]; limit: ArtworkLimit }

/** Painting takes 10–20 s; the server gives up at 90 s, so the app stops waiting just after that. */
const PAINT_TIMEOUT_MS = 100_000

const gallery = (tripId: string) => `/api/artworks/trips/${encodeURIComponent(tripId)}`

export const artworksApi = {
  /** The squad's paintings, newest first */
  list: (tripId: string) => request<ArtworkGallery>(gallery(tripId)),

  /**
   * Paints one of the trip's photos in a style. Rejects with an ApiRequestError whose code says why it couldn't
   * (ARTWORK_UNAVAILABLE, ARTWORK_FAILED, ARTWORK_TIMEOUT, ARTWORK_BLOCKED, ARTWORK_LIMIT, NETWORK_ERROR, …).
   */
  async paint(tripId: string, photoId: string, style: ArtworkStyleId): Promise<Artwork & { limit: ArtworkLimit }> {
    const token = getToken()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), PAINT_TIMEOUT_MS)
    try {
      const res = await fetch(gallery(tripId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ photoId, style }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new ApiRequestError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`)
      }
      return data
    } catch (err) {
      if (err instanceof ApiRequestError) throw err
      if ((err as DOMException)?.name === 'AbortError') {
        throw new ApiRequestError(504, 'ARTWORK_TIMEOUT', 'The painter is taking too long. Try again in a moment.')
      }
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'Can’t reach Ghoomates. Check your connection.')
    } finally {
      window.clearTimeout(timer)
    }
  },
}
