import {
  personaFor as tastePersona,
  tasteFromVibe,
  type Dealbreaker,
  type Diet,
  type Fan,
  type StyleKey,
} from '../../data/taste'
import { VIBE_AXES, type VibeAxis, type VibeScores } from '../../data/vibe'
import type { StyleRule } from '../../services/prefsService'

/**
 * #/quiz (intro) · #/quiz/play (the core deck; old #/quiz/1 … links land here too) · #/quiz/persona (your result)
 * · #/quiz/trip/<tripId> (a trip's deck) · #/quiz/squad/<tripId> (Squad DNA)
 */
export type QuizRoute =
  | { screen: 'intro' }
  | { screen: 'play' }
  | { screen: 'persona' }
  | { screen: 'trip'; tripId: string }
  | { screen: 'squad'; tripId: string }

export const parseQuizRoute = (route: string): QuizRoute | null => {
  if (route === 'quiz') return { screen: 'intro' }
  if (route === 'quiz/play' || /^quiz\/\d+$/.test(route)) return { screen: 'play' }
  if (route === 'quiz/persona') return { screen: 'persona' }
  const deck = route.match(/^quiz\/(trip|squad)\/([^/]+)$/)
  return deck ? { screen: deck[1] === 'trip' ? 'trip' : 'squad', tripId: deck[2] } : null
}

export const tripDeckRoute = (tripId: string) => `quiz/trip/${tripId}`
export const squadRoute = (tripId: string) => `quiz/squad/${tripId}`

export type Persona = {
  name: string
  tagline: string
  /** Your two strongest axes */
  top: VibeAxis[]
}

/** “The Thrill-Seeking Foodie” from an old six-number vibe (adjective from the strongest axis, noun from the next) */
export function personaFor(scores: VibeScores): Persona {
  const { name, tagline, top } = tastePersona(tasteFromVibe(scores))
  return { name, tagline, top }
}

// ---- Copy ----

/** The core deck at a glance (intro, Profile) */
export const VIBE_SWIPE_LINE = '17 quick swipes · about 2 minutes'
/** Answers sent per request while swiping (signed in) */
export const SEND_EVERY = 4

export const axisLabel = (axis: VibeAxis) => VIBE_AXES.find((a) => a.id === axis)?.label ?? axis

/** 'street-food' → 'Street food' */
export const tagLabel = (tag: string) => {
  const words = tag.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Mate'

/** "Riya", "Riya and Kabir", "Riya, Kabir and Meera", "Riya, Kabir and 3 more" */
export function listNames(names: string[]): string {
  if (names.length > 4) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** "Riya and Kabir loved this" · "Riya liked this" · "Riya loved it, Kabir liked it". Only likes and loves exist here. */
export function fansLine(fans: Fan[]): string {
  const loved = fans.filter((f) => f.verdict === 'love').map((f) => firstName(f.name))
  const liked = fans.filter((f) => f.verdict === 'like').map((f) => firstName(f.name))
  if (loved.length && liked.length) return `${listNames(loved)} loved it, ${listNames(liked)} liked it`
  return loved.length ? `${listNames(loved)} loved this` : `${listNames(liked)} liked this`
}

/** “Riya’s must-do” · “Riya and Kabir’s must-do” */
export const mustDoLine = (fans: string[]) => (fans.length ? `${listNames(fans.map(firstName))}’s must-do` : 'A must-do')

/** The twin match may come as 0–1 or 0–100 */
export const percent = (value: number) => Math.round(value <= 1 ? value * 100 : value)

// ---- Style ----

export type StyleMeterSpec = { key: StyleKey; label: string; low: string; high: string }

/** The style dimensions the persona shows as meters, with the words at each end */
export const STYLE_METERS: StyleMeterSpec[] = [
  { key: 'pace', label: 'Pace', low: 'Slow', high: 'Packed' },
  { key: 'mornings', label: 'Mornings', low: 'Late riser', high: 'Early bird' },
  { key: 'budget', label: 'Budget', low: 'Thrifty', high: 'Splurge' },
  { key: 'walking', label: 'Getting around', low: 'Ride it', high: 'Walk it' },
]

/** “Leaning packed”, “Right in the middle” */
export function meterWords({ low, high }: StyleMeterSpec, value: number): string {
  if (value >= 0.8) return `Very ${high.toLowerCase()}`
  if (value >= 0.6) return `Leaning ${high.toLowerCase()}`
  if (value <= 0.2) return `Very ${low.toLowerCase()}`
  if (value <= 0.4) return `Leaning ${low.toLowerCase()}`
  return 'Right in the middle'
}

export const STYLE_NAMES: Record<StyleKey, string> = {
  pace: 'Pace',
  mornings: 'Mornings',
  budget: 'Budget',
  crowds: 'Crowds',
  walking: 'Getting around',
  together: 'Squad time',
  eco: 'Footprint',
}

/** How the squad's value was picked; never names anyone */
export const RULE_CAPTIONS: Record<StyleRule, string> = {
  'least-misery': 'Nobody left out',
  median: 'Middle ground',
  mean: 'Squad average',
  'most-pleasure': 'If anyone’s keen',
}

// ---- Diet and hard noes ----

const DIET_LABELS: Record<Diet, string> = {
  'non-veg': 'Non-veg',
  eggetarian: 'Eggetarian',
  veg: 'Veg',
  vegan: 'Vegan',
  jain: 'Jain',
}

const DEALBREAKER_LABELS: Record<Dealbreaker, string> = {
  water: 'no deep water',
  heights: 'no heights',
  'early-starts': 'no early starts',
  'late-nights': 'no late nights',
  'long-drives': 'no long drives',
  crowds: 'no big crowds',
  spicy: 'go easy on spice',
}

/** "Veg · no deep water"; null when neither is set */
export function dietLine(diet: Diet | null, dealbreakers: Dealbreaker[]): string | null {
  const parts = [diet && DIET_LABELS[diet], ...dealbreakers.map((d) => DEALBREAKER_LABELS[d] ?? d)].filter(Boolean) as string[]
  if (!parts.length) return null
  const line = parts.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}
