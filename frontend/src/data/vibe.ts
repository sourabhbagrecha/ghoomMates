// The six axes of the vibe chart (“spiderweb”), clockwise from the top
export const VIBE_AXES = [
  { id: 'adventure', label: 'Adventure' },
  { id: 'food', label: 'Food' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'culture', label: 'Culture' },
  { id: 'chill', label: 'Chill' },
  { id: 'shops', label: 'Shops' },
] as const

export type VibeAxis = (typeof VIBE_AXES)[number]['id']

/** 0–1 per axis */
export type VibeScores = Record<VibeAxis, number>

/** Example shape for the quiz intro's “You’ll unlock” preview; never shown as anyone's real vibe */
export const EXAMPLE_VIBE: VibeScores = {
  adventure: 0.9,
  food: 0.85,
  nightlife: 0.6,
  culture: 0.5,
  chill: 0.75,
  shops: 0.4,
}

/** 100% when two vibes are identical */
export const vibeMatch = (a: VibeScores, b: VibeScores) => {
  const diff = VIBE_AXES.reduce((sum, { id }) => sum + Math.abs(a[id] - b[id]), 0) / VIBE_AXES.length
  return Math.round((1 - diff) * 100)
}

const isScores = (value: unknown): value is VibeScores =>
  !!value && typeof value === 'object' && VIBE_AXES.every(({ id }) => typeof (value as Record<string, unknown>)[id] === 'number')

/** Average of everyone's quiz scores; null when nobody has taken the quiz */
export function blendVibes(list: unknown[]): VibeScores | null {
  const scores = list.filter(isScores)
  if (!scores.length) return null
  return Object.fromEntries(
    VIBE_AXES.map(({ id }) => [id, scores.reduce((sum, s) => sum + s[id], 0) / scores.length]),
  ) as VibeScores
}

/** Everyone else in a trip who has taken the quiz, blended; null when nobody has */
export function othersVibe(trip: { memberId: string; members: { memberId: string; vibe?: unknown }[] } | null) {
  return trip ? blendVibes(trip.members.filter((m) => m.memberId !== trip.memberId).map((m) => m.vibe)) : null
}

const PERSONA_WORDS: Record<VibeAxis, [adjective: string, noun: string]> = {
  adventure: ['Thrill-Seeking', 'Adventurers'],
  food: ['Hungry', 'Foodies'],
  nightlife: ['Night-Owl', 'Party Crew'],
  culture: ['Curious', 'Culture Buffs'],
  chill: ['Laid-Back', 'Chillers'],
  shops: ['Bargain-Hunting', 'Shoppers'],
}

/** Squad persona from its two strongest axes, e.g. "The Thrill-Seeking Foodies" */
export function personaFor(scores: VibeScores) {
  const [first, second] = [...VIBE_AXES].sort((a, b) => scores[b.id] - scores[a.id])
  return `The ${PERSONA_WORDS[first.id][0]} ${PERSONA_WORDS[second.id][1]}`
}
