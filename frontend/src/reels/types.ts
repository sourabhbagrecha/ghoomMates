import type { PersonId } from '../data/people'

// Mirrors backend/src/reels/plan.ts: the edit decision list GhoomMate (Gemini) writes and the templates play.

export const REEL_STYLES = [
  { id: 'highlights', label: 'Highlights', detail: 'Fast cuts, bold captions' },
  { id: 'cinematic', label: 'Cinematic', detail: 'Slow pans, letterbox, fades' },
  { id: 'diary', label: 'Day by day', detail: 'Your trip in order, with times' },
  { id: 'spotlight', label: 'Spotlight', detail: 'Starring one of the squad' },
  { id: 'scrapbook', label: 'Scrapbook', detail: 'Polaroids on a page' },
] as const

export type ReelStyle = (typeof REEL_STYLES)[number]['id']
export type ReelMotion = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'drift'
export type ReelTransition = 'cut' | 'fade' | 'slide' | 'wipe'

export type ReelScene = {
  photoId: string
  seconds: number
  caption: string
  motion: ReelMotion
  transition: ReelTransition
}

export type ReelPlan = {
  title: string
  subtitle: string
  style: ReelStyle
  /** Kind of music that fits, shown as a label; the reel itself is silent for now */
  soundtrack: string
  /** Squad member's name for spotlight reels */
  starring: string | null
  outro: string
  scenes: ReelScene[]
}

/** A trip photo as the reel templates see it */
export type ReelPhoto = {
  id: string
  src: string
  caption: string
  time: string
  people: PersonId[]
}

export type TripReelProps = {
  plan: ReelPlan
  photos: Record<string, ReelPhoto>
}
