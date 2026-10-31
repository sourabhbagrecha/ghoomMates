import { VIBE_AXES, type VibeAxis, type VibeScores } from '../../data/vibe'

/** #/quiz (intro) · #/quiz/1 … #/quiz/8 (cards) · #/quiz/persona (result) */
export type QuizRoute = { screen: 'intro' } | { screen: 'card'; index: number } | { screen: 'persona' }

export type QuizOption = {
  id: string
  /** 1–3 words; the icon carries the rest */
  label: string
  /** Name of an icon in src/assets/icons */
  icon: string
  /** How much picking this nudges each axis of the vibe chart */
  vibe: Partial<VibeScores>
}

export type QuizCard = {
  id: string
  topic: string
  question: string
  multi: boolean
  options: QuizOption[]
}

/** Card id → picked option ids */
export type QuizAnswers = Record<string, string[]>

export const QUIZ_CARDS: QuizCard[] = [
  {
    id: 'pace',
    topic: 'Pace',
    question: 'Your trip pace?',
    multi: false,
    options: [
      { id: 'packed', label: 'Non-stop', icon: 'rocket', vibe: { adventure: 0.25, nightlife: 0.15, culture: 0.1 } },
      { id: 'balanced', label: 'Balanced', icon: 'scale', vibe: { culture: 0.1, chill: 0.1, food: 0.1 } },
      { id: 'slow', label: 'Slow and lazy', icon: 'bed', vibe: { chill: 0.35 } },
    ],
  },
  {
    id: 'budget',
    topic: 'Budget',
    question: 'Your budget style?',
    multi: false,
    options: [
      { id: 'shoestring', label: 'Thrifty', icon: 'piggy-bank', vibe: { adventure: 0.1, food: 0.05 } },
      { id: 'smart', label: 'Smart spends', icon: 'wallet', vibe: { food: 0.15, shops: 0.1 } },
      { id: 'treat', label: 'Splurge', icon: 'gem', vibe: { shops: 0.3, nightlife: 0.1 } },
    ],
  },
  {
    id: 'food',
    topic: 'Food',
    question: 'Worth the queue?',
    multi: true,
    options: [
      { id: 'street-food', label: 'Street food', icon: 'sandwich', vibe: { food: 0.25 } },
      { id: 'seafood', label: 'Seafood shacks', icon: 'fish', vibe: { food: 0.2, chill: 0.05 } },
      { id: 'tasting-menu', label: 'Fine dining', icon: 'wine', vibe: { food: 0.15, shops: 0.05 } },
      { id: 'home-kitchen', label: 'Home-cooked', icon: 'soup', vibe: { food: 0.15, culture: 0.15 } },
    ],
  },
  {
    id: 'nightlife',
    topic: 'Nightlife',
    question: 'Your perfect evening?',
    multi: true,
    options: [
      { id: 'street-food', label: 'Food crawl', icon: 'utensils', vibe: { food: 0.15 } },
      { id: 'sunset-cruise', label: 'Sunset cruise', icon: 'sailboat', vibe: { chill: 0.2 } },
      { id: 'beach-club', label: 'Beach club', icon: 'martini', vibe: { nightlife: 0.3 } },
      { id: 'live-gig', label: 'Live gig', icon: 'guitar', vibe: { nightlife: 0.25, culture: 0.05 } },
    ],
  },
  {
    id: 'adventure',
    topic: 'Adventure',
    question: 'Scuba? Paragliding?',
    multi: false,
    options: [
      { id: 'all', label: 'All in', icon: 'mountain', vibe: { adventure: 0.45 } },
      { id: 'one', label: 'Just one', icon: 'camera', vibe: { adventure: 0.2 } },
      { id: 'none', label: 'I’ll watch', icon: 'backpack', vibe: { chill: 0.2 } },
    ],
  },
  {
    id: 'mornings',
    topic: 'Mornings',
    question: '5 AM sunrise trek?',
    multi: false,
    options: [
      { id: 'early', label: 'I’m up', icon: 'sunrise', vibe: { adventure: 0.15, culture: 0.1 } },
      { id: 'coffee', label: 'With coffee', icon: 'coffee', vibe: { adventure: 0.05 } },
      { id: 'asleep', label: 'Hard pass', icon: 'moon', vibe: { nightlife: 0.15, chill: 0.1 } },
    ],
  },
  {
    id: 'culture',
    topic: 'Culture',
    question: 'Worth skipping a nap?',
    multi: true,
    options: [
      { id: 'forts', label: 'Old forts', icon: 'castle', vibe: { culture: 0.2, adventure: 0.05 } },
      { id: 'museums', label: 'Museums', icon: 'landmark', vibe: { culture: 0.25 } },
      { id: 'festivals', label: 'Festivals', icon: 'party-popper', vibe: { culture: 0.15, nightlife: 0.1 } },
      { id: 'flea-markets', label: 'Flea markets', icon: 'shopping-bag', vibe: { shops: 0.25, culture: 0.05 } },
    ],
  },
  {
    id: 'souvenirs',
    topic: 'Souvenirs',
    question: 'You bring home…',
    multi: true,
    options: [
      { id: 'tan', label: 'A tan', icon: 'sun', vibe: { chill: 0.25 } },
      { id: 'snacks', label: 'Snacks', icon: 'cookie', vibe: { food: 0.15, shops: 0.1 } },
      { id: 'outfits', label: 'New outfits', icon: 'shirt', vibe: { shops: 0.3 } },
      { id: 'photos', label: 'Photos', icon: 'image', vibe: { adventure: 0.1, culture: 0.1 } },
    ],
  },
]

export const QUIZ_TOPICS = QUIZ_CARDS.map((c) => c.topic)

export const parseQuizRoute = (route: string): QuizRoute | null => {
  if (route === 'quiz') return { screen: 'intro' }
  if (route === 'quiz/persona') return { screen: 'persona' }
  const index = Number(route.match(/^quiz\/(\d+)$/)?.[1]) - 1
  return index >= 0 && index < QUIZ_CARDS.length ? { screen: 'card', index } : null
}

export const cardRoute = (index: number) => `quiz/${index + 1}`

/** Single choice replaces the pick; multi choice toggles it */
export const togglePick = (card: QuizCard, picked: string[], id: string) =>
  !card.multi ? [id] : picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]

// Everyone starts with a little of every vibe, so skipped cards don't flatten the chart
const BASE_SCORE = 0.2

export function scoreQuiz(answers: QuizAnswers): VibeScores {
  const scores = Object.fromEntries(VIBE_AXES.map(({ id }) => [id, BASE_SCORE])) as VibeScores
  for (const card of QUIZ_CARDS) {
    for (const option of card.options) {
      if (!answers[card.id]?.includes(option.id)) continue
      for (const [axis, value] of Object.entries(option.vibe) as [VibeAxis, number][]) {
        scores[axis] = Math.min(1, scores[axis] + value)
      }
    }
  }
  return scores
}

const PERSONA_ADJECTIVE: Record<VibeAxis, string> = {
  adventure: 'Thrill-Seeking',
  food: 'Hungry',
  nightlife: 'Night-Owl',
  culture: 'Curious',
  chill: 'Laid-Back',
  shops: 'Bargain-Hunting',
}

const PERSONA_NOUN: Record<VibeAxis, string> = {
  adventure: 'Explorer',
  food: 'Foodie',
  nightlife: 'Party Starter',
  culture: 'Culture Buff',
  chill: 'Beach Bum',
  shops: 'Shopaholic',
}

const PERSONA_TAGLINE: Record<VibeAxis, string> = {
  adventure: 'First in the water, last to say “let’s head back”.',
  food: 'You plan the day around where you’ll eat next.',
  nightlife: 'The trip really starts after sunset.',
  culture: 'Every fort, festival and back lane has a story for you.',
  chill: 'A hammock, a view and no plan: holiday sorted.',
  shops: 'You know every market and still haggle like a local.',
}

export type Persona = {
  name: string
  tagline: string
  /** Your two strongest axes */
  top: VibeAxis[]
}

/** “The Thrill-Seeking Foodie”: adjective from your strongest axis, noun from the next one */
export function personaFor(scores: VibeScores): Persona {
  const [first, second] = [...VIBE_AXES].sort((a, b) => scores[b.id] - scores[a.id]).map((a) => a.id)
  return {
    name: `The ${PERSONA_ADJECTIVE[first]} ${PERSONA_NOUN[second]}`,
    tagline: PERSONA_TAGLINE[first],
    top: [first, second],
  }
}
