import { useEffect } from 'react'
import { activeTrip } from '../../data/activeTrip'
import type { FaceSummary, TripPhotos } from '../../services/tripsService'

const POLL_MS = 8_000
const POLL_MAX_MS = 5 * 60_000
const SELFIE_EDGE = 640

/** Trips where a find-me search has worked this session (lights up the Match pipeline step) */
const matchedTrips = new Set<string>()
export const markMatched = (tripId: string) => matchedTrips.add(tripId)
export const hasMatched = (tripId: string | null) => !!tripId && matchedTrips.has(tripId)

/** The server's trip-wide summary, or the same counts worked out from the loaded photos */
export function faceSummaryOf(photos: TripPhotos | null): FaceSummary | null {
  if (!photos) return null
  if (photos.faceSummary) return photos.faceSummary
  const sum: FaceSummary = { indexed: 0, noFaces: 0, pending: 0, failed: 0, faces: 0 }
  photos.items.forEach((p) => {
    const f = p.faces
    if (!f || f.status === 'pending') sum.pending += 1
    else if (f.status === 'indexed') {
      sum.indexed += 1
      sum.faces += f.count
    } else if (f.status === 'no_faces') sum.noFaces += 1
    else sum.failed += 1
  })
  return sum
}

/** Re-fetches the photos every few seconds while the cloud pipeline still has some to tag, for up to 5 minutes. */
export function useFacePolling(pending: number) {
  const active = pending > 0
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_MAX_MS) window.clearInterval(timer)
      else void activeTrip.loadPhotos()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [active])
}

/**
 * Resizes the selfie to a 640px JPEG data URL: big camera shots shrink so the request stays small, and the
 * small saved profile photo grows so the face detector can still find the face in it.
 */
export async function sizeSelfie(src: string): Promise<string> {
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const scale = SELFIE_EDGE / Math.max(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return src
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return src
  }
}
