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
