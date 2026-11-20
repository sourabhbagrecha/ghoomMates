// Vibe Swipe: the shared preference model, card shapes and scoring maths.
//
// This file is copied byte for byte to frontend/src/data/taste.ts (the app scores answers live while you swipe;
// the server re-scores every stored answer and is the source of truth). tests/prefs/parity.test.ts fails if the
// two copies differ, so edit one and copy it over. It has no imports so both packages can load it as is.
//
// The model: every interest axis keeps Beta evidence (a = for, b = against, starting at 1/1), so a score comes
// with a confidence and a skipped card simply adds nothing. Style dimensions (pace, mornings, budget, …) are a
// weighted average of the values the member voted for. Tags, deal-breakers and diet are kept as they are.

export const AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const
export type Axis = (typeof AXES)[number]
export type Vibe = Record<Axis, number>

/** 0 → 1: slow → packed · late riser → early bird · thrifty → splurge · avoid crowds → don't mind ·
 * ride everywhere → walk all day · lots of solo time → everything together · don't mind → eco first */
export const STYLE_KEYS = ['pace', 'mornings', 'budget', 'crowds', 'walking', 'together', 'eco'] as const
export type StyleKey = (typeof STYLE_KEYS)[number]

export const DEALBREAKERS = ['water', 'heights', 'early-starts', 'late-nights', 'long-drives', 'crowds', 'spicy'] as const
export type Dealbreaker = (typeof DEALBREAKERS)[number]

/** Least to most restrictive: a squad eats at the strictest member's level */
export const DIETS = ['non-veg', 'eggetarian', 'veg', 'vegan', 'jain'] as const
export type Diet = (typeof DIETS)[number]

export const FORMATS = ['swipe', 'this-or-that', 'pick', 'multi', 'best-worst', 'spectrum'] as const
export type CardFormat = (typeof FORMATS)[number]

/** What choosing an option says about you */
export type Effects = {
  /** How much the option speaks to each interest axis, 0–1 */
  axes?: Partial<Vibe>
  /** The value, 0–1, that choosing this option votes for on each style dimension */
  style?: Partial<Record<StyleKey, number>>
  /** Fine-grained interests (kebab-case, e.g. 'street-food', 'forts', 'sunrise') */
  tags?: string[]
  dealbreaker?: Dealbreaker
  diet?: Diet
}

export type CardOption = {
  id: string
  /** 1–4 words */
  label: string
  /** Icon name in frontend/src/assets/icons (icon-<name>-primary.svg / -white.svg) */
  icon: string
  /** One short line under the label */
  detail?: string
  /** Multi cards: picking this clears the others ("None, I'm easy") */
  exclusive?: boolean
  effects: Effects
}

export type CardArt =
  /** Gradient in the axis colour (or the brand blue for style questions) with a big white icon */
  | { kind: 'illustrated'; tone: Axis | 'style'; icon: string }
  /** A guide experience: the app shows its credited photo from the Explore catalogue */
  | { kind: 'catalog'; experienceId: string }
  | { kind: 'photo'; src: string; alt: string; credit?: string; license?: string; source?: string }

export type CardPlace = {
  area?: string
  priceRupees?: number
  startTime?: string
  duration?: string
  rating?: number
  pitch?: string
}

/** A mate who liked or loved a trip card. Nopes are never attributed to anyone. */
export type Fan = { name: string; colour?: string; verdict: 'like' | 'love' }

export type Card = {
  id: string
  format: CardFormat
  /** Overline, e.g. 'Mornings' */
  topic: string
  /** The question or the experience title, a few words */
  prompt: string
  hint?: string
  art?: CardArt
  place?: CardPlace
  /** swipe: exactly 1 (what you are swiping on) · this-or-that: 2 · pick: 3–5 · multi: 3–7 · best-worst: 4 ·
   * spectrum: 5, left pole to right pole */
  options: CardOption[]
  /** Trip deck only: mates who liked or loved it */
  fans?: Fan[]
}

export type Verdict = 'nope' | 'like' | 'love'

/** How a card was answered. this-or-that, pick and spectrum send one option id; multi sends any number. */
export type Reply =
  | { kind: 'swipe'; verdict: Verdict }
  | { kind: 'choose'; optionIds: string[] }
  | { kind: 'best-worst'; best: string; worst: string }
  | { kind: 'skip' }

/** ms: time from the card showing to the answer (0 when unknown) */
export type Answer = { cardId: string; reply: Reply; ms: number }

export type Beta = { a: number; b: number }
export type StyleStat = { sum: number; weight: number }

export type Taste = {
  v: 2
  axes: Record<Axis, Beta>
  style: Partial<Record<StyleKey, StyleStat>>
  tags: Record<string, number>
  dealbreakers: Dealbreaker[]
  diet: Diet | null
  /** Cards answered (skips don't count) */
  answered: number
}

const PRIOR = 1
/** Evidence a strong yes adds; everything else is a fraction of it */
const W = {
  like: 1,
  love: 2,
  nope: 1,
  chosen: 1,
  multiChosen: 0.8,
  multiUnchosen: 0.3,
  /** Split across the options you passed over on this-or-that and pick cards */
  passedOver: 0.6,
  best: 1.5,
  worst: 1.5,
  /** A liked swipe card's style votes count half: you might like it despite the early start */
  swipeStyle: 0.5,
} as const

export const round2 = (n: number) => Math.round(n * 100) / 100

export function emptyTaste(): Taste {
  const axes = {} as Record<Axis, Beta>
  for (const axis of AXES) axes[axis] = { a: PRIOR, b: PRIOR }
  return { v: 2, axes, style: {}, tags: {}, dealbreakers: [], diet: null, answered: 0 }
}

export function cloneTaste(taste: Taste): Taste {
  const axes = {} as Record<Axis, Beta>
  for (const axis of AXES) axes[axis] = { ...taste.axes[axis] }
  const style: Partial<Record<StyleKey, StyleStat>> = {}
  for (const key of STYLE_KEYS) {
    const stat = taste.style[key]
    if (stat) style[key] = { ...stat }
  }
  return { v: 2, axes, style, tags: { ...taste.tags }, dealbreakers: [...taste.dealbreakers], diet: taste.diet, answered: taste.answered }
}

/** Snap decisions count a little more, long hesitations a little less */
export function speedWeight(ms: number): number {
  if (!(ms > 0)) return 1
  if (ms < 1500) return 1.15
  if (ms > 8000) return 0.8
  return 1
}

function addAxes(taste: Taste, effects: Effects, side: 'a' | 'b', weight: number) {
  for (const axis of AXES) {
    const v = effects.axes?.[axis]
    if (v) taste.axes[axis][side] = round2(taste.axes[axis][side] + v * weight)
  }
}

function addStyle(taste: Taste, effects: Effects, weight: number) {
  for (const key of STYLE_KEYS) {
    const target = effects.style?.[key]
    if (target === undefined) continue
    const stat = taste.style[key] ?? { sum: 0, weight: 0 }
    stat.sum = round2(stat.sum + target * weight)
    stat.weight = round2(stat.weight + weight)
    taste.style[key] = stat
  }
}

function addTags(taste: Taste, effects: Effects, weight: number) {
  for (const tag of effects.tags ?? []) taste.tags[tag] = round2((taste.tags[tag] ?? 0) + weight)
}

function addFacts(taste: Taste, effects: Effects) {
  if (effects.dealbreaker && !taste.dealbreakers.includes(effects.dealbreaker)) taste.dealbreakers.push(effects.dealbreaker)
  if (effects.diet) taste.diet = effects.diet
}

/** Adds one answer's evidence to taste (mutates and returns it). Unknown option ids are ignored. */
export function applyAnswer(taste: Taste, card: Card, reply: Reply, ms: number): Taste {
  if (reply.kind === 'skip') return taste
  const m = speedWeight(ms)

  if (reply.kind === 'swipe') {
    const subject = card.options[0]
    if (!subject) return taste
    taste.answered++
    const e = subject.effects
    if (reply.verdict === 'nope') {
      addAxes(taste, e, 'b', W.nope * m)
      addTags(taste, e, -1)
    } else {
      const strong = reply.verdict === 'love'
      addAxes(taste, e, 'a', (strong ? W.love : W.like) * m)
      addStyle(taste, e, (strong ? 1 : W.swipeStyle) * m)
      addTags(taste, e, strong ? 2 : 1)
      addFacts(taste, e)
    }
    return taste
  }

  if (reply.kind === 'best-worst') {
    const best = card.options.find((o) => o.id === reply.best)
    const worst = card.options.find((o) => o.id === reply.worst)
    if (!best && !worst) return taste
    taste.answered++
    if (best) {
      addAxes(taste, best.effects, 'a', W.best * m)
      addStyle(taste, best.effects, m)
      addTags(taste, best.effects, 1.5)
    }
    if (worst && worst !== best) {
      addAxes(taste, worst.effects, 'b', W.worst * m)
      addTags(taste, worst.effects, -1)
    }
    return taste
  }

  const picked = card.options.filter((o) => reply.optionIds.includes(o.id))
  if (!picked.length) return taste
  taste.answered++
  const exclusive = picked.find((o) => o.exclusive)
  const chosen = exclusive ? [exclusive] : picked
  const multi = card.format === 'multi'

  for (const option of chosen) {
    addAxes(taste, option.effects, 'a', (multi ? W.multiChosen : W.chosen) * m)
    addStyle(taste, option.effects, (multi ? 1 / chosen.length : 1) * m)
    addTags(taste, option.effects, 1)
    addFacts(taste, option.effects)
  }

  // A spectrum is a scale, not a choice between things, so the stops you didn't pick say nothing against them
  if (card.format === 'spectrum') return taste
  const passed = card.options.filter((o) => !chosen.includes(o) && !o.exclusive)
  const against = multi ? W.multiUnchosen : passed.length ? W.passedOver / passed.length : 0
  for (const option of passed) addAxes(taste, option.effects, 'b', against * m)
  return taste
}

/** Re-scores a list of answers from scratch (or on top of base). Answers to unknown cards are ignored. */
export function scoreAnswers(cards: Record<string, Card>, answers: Answer[], base?: Taste): Taste {
  const taste = base ? cloneTaste(base) : emptyTaste()
  for (const answer of answers) {
    const card = cards[answer.cardId]
    if (card) applyAnswer(taste, card, answer.reply, answer.ms)
  }
  return taste
}

export const axisMean = (beta: Beta) => beta.a / (beta.a + beta.b)

/** 0 with no evidence, 0.5 after about four cards' worth, → 1 */
export function axisConfidence(beta: Beta): number {
  const n = Math.max(0, beta.a + beta.b - 2 * PRIOR)
  return n / (n + 4)
}

/** 0.5 (no opinion) until there is a vote */
export const styleValue = (stat?: StyleStat) => (stat && stat.weight > 0 ? stat.sum / stat.weight : 0.5)
export const styleConfidence = (stat?: StyleStat) => (stat ? stat.weight / (stat.weight + 2) : 0)

/** The six numbers the rest of the app reads as users.preferences.vibe */
export function vibeOf(taste: Taste): Vibe {
  const vibe = {} as Vibe
  for (const axis of AXES) vibe[axis] = round2(axisMean(taste.axes[axis]))
  return vibe
}

export function confidenceOf(taste: Taste): Vibe {
  const confidence = {} as Vibe
  for (const axis of AXES) confidence[axis] = round2(axisConfidence(taste.axes[axis]))
  return confidence
}

export function overallConfidence(taste: Taste): number {
  return round2(AXES.reduce((sum, axis) => sum + axisConfidence(taste.axes[axis]), 0) / AXES.length)
}

export function styleOf(taste: Taste): Record<StyleKey, number> {
  const style = {} as Record<StyleKey, number>
  for (const key of STYLE_KEYS) style[key] = round2(styleValue(taste.style[key]))
  return style
}

export function styleConfidenceOf(taste: Taste): Record<StyleKey, number> {
  const confidence = {} as Record<StyleKey, number>
  for (const key of STYLE_KEYS) confidence[key] = round2(styleConfidence(taste.style[key]))
  return confidence
}

/** Strongest liked tags first */
export function topTags(taste: Taste, count = 5): string[] {
  return Object.entries(taste.tags)
    .filter(([, score]) => score > 0)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, count)
    .map(([tag]) => tag)
}

/** A member who only has the old six-number vibe: treat it as about four cards' worth of evidence */
export function tasteFromVibe(vibe: Partial<Vibe>): Taste {
  const taste = emptyTaste()
  for (const axis of AXES) {
    const v = vibe[axis]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const clamped = Math.min(1, Math.max(0, v))
    taste.axes[axis] = { a: round2(PRIOR + 4 * clamped), b: round2(PRIOR + 4 * (1 - clamped)) }
  }
  return taste
}

const PERSONA_ADJECTIVE: Record<Axis, string> = {
  adventure: 'Thrill-Seeking',
  food: 'Hungry',
  nightlife: 'Night-Owl',
  culture: 'Curious',
  chill: 'Laid-Back',
  shops: 'Bargain-Hunting',
}

const PERSONA_NOUN: Record<Axis, string> = {
  adventure: 'Explorer',
  food: 'Foodie',
  nightlife: 'Party Starter',
  culture: 'Culture Buff',
  chill: 'Beach Bum',
  shops: 'Shopaholic',
}

const PERSONA_TAGLINE: Record<Axis, string> = {
  adventure: 'First in the water, last to say “let’s head back”.',
  food: 'You plan the day around where you’ll eat next.',
  nightlife: 'The trip really starts after sunset.',
  culture: 'Every fort, festival and back lane has a story for you.',
  chill: 'A hammock, a view and no plan: holiday sorted.',
  shops: 'You know every market and still haggle like a local.',
}

export type Persona = {
  /** “The Thrill-Seeking Foodie”: adjective from your strongest axis, noun from the next */
  name: string
  tagline: string
  top: Axis[]
  /** Style traits you were clear about, e.g. 'Early bird', 'Crowd dodger' */
  badges: string[]
}

const BADGES: { key: StyleKey; high?: string; low?: string }[] = [
  { key: 'mornings', high: 'Early bird', low: 'Night owl' },
  { key: 'pace', high: 'Go-go-go', low: 'Slow traveller' },
  { key: 'budget', high: 'Splurger', low: 'Budget boss' },
  { key: 'crowds', low: 'Crowd dodger' },
  { key: 'walking', high: 'Walk-it-all', low: 'Ride-it-all' },
  { key: 'eco', high: 'Green traveller' },
  { key: 'together', high: 'Squad-first', low: 'Lone wanderer' },
]

export function personaFor(taste: Taste): Persona {
  const vibe = vibeOf(taste)
  const [first, second] = [...AXES].sort((x, y) => vibe[y] - vibe[x] || AXES.indexOf(x) - AXES.indexOf(y))
  const badges: string[] = []
  for (const { key, high, low } of BADGES) {
    const stat = taste.style[key]
    if (styleConfidence(stat) < 0.3) continue
    const value = styleValue(stat)
    if (high && value >= 0.7) badges.push(high)
    else if (low && value <= 0.3) badges.push(low)
  }
  return {
    name: `The ${PERSONA_ADJECTIVE[first]} ${PERSONA_NOUN[second]}`,
    tagline: PERSONA_TAGLINE[first],
    top: [first, second],
    badges: badges.slice(0, 3),
  }
}
