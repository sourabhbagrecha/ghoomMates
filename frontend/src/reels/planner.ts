import { PEOPLE, SQUAD } from '../data/people'
import { LIVE_TRIP } from '../data/trips'
import { PHOTO_DETAILS, VIEWER_PHOTOS } from '../pages/Trip/tripDetailData'
import { getToken } from '../services/authService'
import type { ReelMotion, ReelPhoto, ReelPlan, ReelScene, ReelStyle, ReelTransition } from './types'

export type ReelRequest = {
  direction: string
  /** null lets GhoomMate pick from the direction */
  style: ReelStyle | null
  /** Indexes of photos picked with "Add to reel"; empty means every trip photo */
  picks: number[]
  /** Title of the cut being replaced, so a regenerate tries something new */
  previousTitle?: string
}

export type PlannedReel = {
  plan: ReelPlan
  photos: Record<string, ReelPhoto>
  /** Who planned it: Gemini on the backend, or the on-device fallback */
  source: 'gemini' | 'on-device'
}

/** A reel direction the planner refused, shown to the user as is */
export class ReelDirectionError extends Error {}

const DEFAULT_SECONDS = 30
const THUMBNAIL_SIZE = 512

/** The trip photos a reel can use: the "Add to reel" picks when there are at least two, else all of them */
export function reelPhotos(picks: number[]): ReelPhoto[] {
  const indexes = picks.length >= 2 ? [...picks].sort((a, b) => a - b) : VIEWER_PHOTOS.map((_, i) => i)
  return indexes.map((i) => ({
    id: `p${i}`,
    src: VIEWER_PHOTOS[i],
    caption: PHOTO_DETAILS[i]?.caption ?? '',
    time: PHOTO_DETAILS[i]?.time ?? '',
    people: PHOTO_DETAILS[i]?.people ?? [],
  }))
}

/** "30s", "45 sec", "1 min" in the direction, else 30 seconds */
export function durationFrom(direction: string): number {
  const seconds = direction.match(/(\d{1,2})\s*(?:s|sec|secs|seconds)\b/i)
  if (seconds) return Math.min(90, Math.max(6, Number(seconds[1])))
  const minutes = direction.match(/(\d)\s*(?:min|mins|minute|minutes)\b/i)
  if (minutes) return Math.min(90, Number(minutes[1]) * 60)
  return DEFAULT_SECONDS
}

/** Plans a reel with Gemini through the backend, falling back to the on-device planner when it isn't available */
export async function planReel(request: ReelRequest): Promise<PlannedReel> {
  const photos = reelPhotos(request.picks)
  const byId = Object.fromEntries(photos.map((p) => [p.id, p]))
  const durationSeconds = durationFrom(request.direction)

  const token = getToken()
  if (token) {
    try {
      const response = await fetch('/reels/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          direction: request.direction,
          style: request.style ?? 'auto',
          durationSeconds,
          previousTitle: request.previousTitle,
          squad: SQUAD.map((id) => PEOPLE[id].name),
          photos: await Promise.all(
            photos.map(async (p) => ({
              id: p.id,
              caption: p.caption,
              time: p.time,
              people: p.people.map((id) => PEOPLE[id].name),
              image: await thumbnail(p.src),
            })),
          ),
        }),
      })
      const body = await response.json().catch(() => null)
      if (response.status === 422) throw new ReelDirectionError(body?.error?.message ?? 'Try a different direction')
      const plan = body?.plan as ReelPlan | undefined
      const scenes = plan?.scenes?.filter((s) => byId[s.photoId])
      if (response.ok && plan && scenes?.length) return { plan: { ...plan, scenes }, photos: byId, source: 'gemini' }
      console.warn('Reel planner unavailable, planning on-device:', body?.error?.message ?? response.status)
    } catch (err) {
      if (err instanceof ReelDirectionError) throw err
      console.warn('Reel planner unreachable, planning on-device:', err)
    }
  }

  return { plan: planOnDevice(request, photos, durationSeconds), photos: byId, source: 'on-device' }
}

/** Downscales a photo to a JPEG for Gemini to look at. SVG and other formats Gemini can't read come out as JPEG too. */
async function thumbnail(src: string): Promise<{ mimeType: 'image/jpeg'; data: string }> {
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(img.naturalWidth, img.naturalHeight))
  // Tiny vector placeholders are scaled up so the model gets something to look at
  const upscale = img.naturalWidth < 200 ? THUMBNAIL_SIZE / Math.max(img.naturalWidth, img.naturalHeight) : scale
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * upscale)
  canvas.height = Math.round(img.naturalHeight * upscale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] }
}

// --- On-device planner -------------------------------------------------------------------------
// Keyword rules standing in for Gemini when the backend has no GEMINI_API_KEY or you aren't signed in.

const STYLE_KEYWORDS: [ReelStyle, RegExp][] = [
  ['cinematic', /cinematic|film|slow|aesthetic|moody|dreamy|sunset/i],
  ['diary', /day by day|diary|journey|story|chronolog|timeline|itinerary/i],
  ['scrapbook', /polaroid|scrapbook|collage|memor/i],
  ['highlights', /fast|hype|recap|highlight|funn|party|energy|beat/i],
]

const STYLE_DEFAULTS: Record<ReelStyle, { seconds: number; transition: ReelTransition; soundtrack: string }> = {
  highlights: { seconds: 1.6, transition: 'cut', soundtrack: 'Bollywood beat' },
  cinematic: { seconds: 4.5, transition: 'fade', soundtrack: 'Lo-fi sunset' },
  diary: { seconds: 3.5, transition: 'slide', soundtrack: 'Acoustic road trip' },
  spotlight: { seconds: 3, transition: 'wipe', soundtrack: 'Hype anthem' },
  scrapbook: { seconds: 2.6, transition: 'cut', soundtrack: 'Indie summer' },
}

const MOTION_CYCLE: ReelMotion[] = ['zoom-in', 'pan-left', 'zoom-out', 'pan-right', 'drift']

/** Sortable key for times like "Sat, 31 Oct · 06:12 AM" */
function timeKey(time: string): number {
  const m = time.match(/(\d{1,2}) \w{3} · (\d{1,2}):(\d{2}) (AM|PM)/)
  if (!m) return 0
  const hours = (Number(m[2]) % 12) + (m[4] === 'PM' ? 12 : 0)
  return Number(m[1]) * 24 * 60 + hours * 60 + Number(m[3])
}

export function planOnDevice(request: ReelRequest, photos: ReelPhoto[], durationSeconds: number): ReelPlan {
  const direction = request.direction
  const star = SQUAD.find((id) => id !== 'you' && new RegExp(`\\b${PEOPLE[id].name}\\b`, 'i').test(direction)) ?? null
  const style =
    request.style ?? (star ? 'spotlight' : STYLE_KEYWORDS.find(([, re]) => re.test(direction))?.[0] ?? 'highlights')
  const defaults = STYLE_DEFAULTS[style]

  // The star's photos first; diaries run in the order they were taken
  let ordered = star ? [...photos].sort((a, b) => Number(b.people.includes(star)) - Number(a.people.includes(star))) : photos
  if (style === 'diary') ordered = [...photos].sort((a, b) => timeKey(a.time) - timeKey(b.time))
  // A regenerate shuffles the order so the new take looks different
  if (request.previousTitle && style !== 'diary') ordered = [...ordered.slice(1), ordered[0]]

  const budget = Math.max(durationSeconds - 3, 3)
  const count = Math.max(1, Math.min(30, Math.round(budget / defaults.seconds)))
  const scenes: ReelScene[] = Array.from({ length: count }, (_, i) => {
    const photo = ordered[i % ordered.length]
    const names = photo.people.filter((p) => p !== 'you').map((p) => PEOPLE[p].name)
    return {
      photoId: photo.id,
      seconds: Math.round((budget / count) * 10) / 10,
      caption:
        style === 'spotlight' && star && photo.people.includes(star)
          ? `${PEOPLE[star].name} at ${photo.caption}`
          : i >= ordered.length && names.length
            ? `${names[0]} again`
            : photo.caption,
      motion: MOTION_CYCLE[(i + (request.previousTitle ? 2 : 0)) % MOTION_CYCLE.length],
      transition: defaults.transition,
    }
  })

  const place = LIVE_TRIP.place.replace(/^North /, '')
  const title = star ? `Starring ${PEOPLE[star].name}` : style === 'diary' ? `${place}, day by day` : `${place} in ${durationSeconds} seconds`
  return {
    title: request.previousTitle === title ? `${title}, take 2` : title,
    subtitle: `${LIVE_TRIP.group} · ${LIVE_TRIP.dates}`,
    style,
    soundtrack: defaults.soundtrack,
    starring: star ? PEOPLE[star].name : null,
    outro: 'Same squad, next trip?',
    scenes,
  }
}
