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

/** The Goa Gang's blended vibe, read off the squad shape in the Itinerary spiderweb */
export const SQUAD_VIBE: VibeScores = {
  adventure: 0.9,
  food: 0.85,
  nightlife: 0.6,
  culture: 0.5,
  chill: 0.75,
  shops: 0.4,
}

/** “You” in the Figma spiderweb, shown until you've taken the personality quiz */
export const SAMPLE_YOU_VIBE: VibeScores = {
  adventure: 0.95,
  food: 0.7,
  nightlife: 0.35,
  culture: 0.65,
  chill: 0.55,
  shops: 0.8,
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
