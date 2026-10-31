import { EXPERIENCE_PHOTOS } from '../../pages/Explore/experiencePhotos'
import type { CrowdLabel, StopCrowd } from '../../services/heritageService'
import { tripsApi, type ItineraryStop } from '../../services/tripsService'

export const CROWD_LABELS: Record<CrowdLabel, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  packed: 'Packed',
  closed: 'Closed',
}

/** Same thresholds as backend/src/heritage/crowd.ts */
export function labelFor(level: number | null): CrowdLabel {
  if (level === null) return 'closed'
  return level >= 82 ? 'packed' : level >= 65 ? 'busy' : level >= 40 ? 'moderate' : 'quiet'
}

/** Rough ticket-and-entry queue, as on the backend */
export const waitMinutes = (level: number | null) => (level === null || level < 50 ? 0 : Math.round(((level - 45) * 0.9) / 5) * 5)

/** Off-peak means quiet or moderate */
export const isOffPeak = (crowd: StopCrowd) => crowd.level !== null && crowd.level < 65

/** "1h 25m", "40 min" */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const P = EXPERIENCE_PHOTOS
/** Real photos for heritage sites we have one of, keyed by site id */
export const SITE_PHOTOS: Record<string, string> = {
  'city-palace': P.cityPalace[0].src,
  'pichola-boat': P.pichola[0].src,
  sajjangarh: P.sajjangarh[0].src,
  'bagore-ki-haveli': P.dharohar[0].src,
  'badi-lake': P.badiLake[0].src,
  shilpgram: P.shilpgram[0].src,
  'ambrai-ghat': P.ambraiDinner[0].src,
  'fateh-sagar': P.sunriseYoga[0].src,
  'hathi-pol': P.miniature[0].src,
}

/** Takes GhoomMate's nudge for a stop: a quieter time, or a quieter site with the same feel. Doesn't reload the plan. */
export function applySuggestion(tripId: string, stop: ItineraryStop) {
  const nudge = stop.crowd?.suggestion
  if (!nudge) return Promise.resolve()
  const base = { dayNumber: stop.dayNumber, time: stop.time, title: stop.title, tag: stop.tag, place: stop.place, notes: stop.notes }
  const next = nudge.type === 'shift' ? { ...base, time: nudge.time } : { ...base, title: nudge.title, place: nudge.place, tag: nudge.tag, notes: nudge.notes }
  return tripsApi.updateStop(tripId, stop.id, next).then(() => undefined)
}
