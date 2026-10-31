import iconCompass from '../../assets/figma/icon-compass-primary.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary-20.svg'
import iconSunrise from '../../assets/figma/icon-sunrise-primary.svg'
import iconUsers from '../../assets/figma/icon-users-primary.svg'
import iconUtensils from '../../assets/figma/icon-utensils-primary.svg'
import iconWallet from '../../assets/figma/icon-wallet-primary.svg'
import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'

// Mock profile content until the profile service exists.

export const ACCOUNT = {
  fallbackName: 'Aditi',
  username: '@aditi.travels',
  memberSince: 'Member since Mar 2025',
  phone: '+91 98765 43210',
  email: 'aditi.travels@gmail.com',
  upi: 'aditi@okaxis',
}

export const STATS = [
  { label: 'Trips', value: '4' },
  { label: 'Places', value: '4' },
  { label: 'Photos', value: (1248).toLocaleString('en-IN') },
  { label: 'Mates', value: '4' },
]

export type PlaceStatus = 'now' | 'upcoming' | 'visited'

export const PLACES: { id: string; name: string; when: string; status: PlaceStatus; photo: string; route: string }[] = [
  { id: 'goa', name: 'Goa', when: 'Oct 2026', status: 'now', photo: photoVagator, route: 'trip/itinerary' },
  { id: 'manali', name: 'Manali', when: 'Dec 2026', status: 'upcoming', photo: grid1, route: 'plan' },
  { id: 'rishikesh', name: 'Rishikesh', when: 'Aug 2026', status: 'visited', photo: grid3, route: 'past/rishikesh' },
  { id: 'udaipur', name: 'Udaipur', when: 'Mar 2026', status: 'visited', photo: grid5, route: 'past/udaipur' },
  { id: 'hampi', name: 'Hampi', when: 'Dec 2025', status: 'visited', photo: grid6, route: 'past/hampi' },
]

export const PLACE_STATUS: Record<PlaceStatus, string> = {
  now: 'Here now',
  upcoming: 'Upcoming',
  visited: 'Visited',
}

export const BADGES: { id: string; title: string; detail: string; icon: string; earned: boolean }[] = [
  { id: 'early-bird', title: 'Early bird', detail: 'Up for 3 sunrises', icon: iconSunrise, earned: true },
  { id: 'squad-planner', title: 'Squad planner', detail: 'Planned 2 trips', icon: iconUsers, earned: true },
  { id: 'settled', title: 'Settled in a tap', detail: '12 UPI settles', icon: iconWallet, earned: true },
  { id: 'foodie', title: 'Foodie scout', detail: '9 food spots added', icon: iconUtensils, earned: true },
  { id: 'trailblazer', title: 'Trailblazer', detail: '6 more places to go', icon: iconCompass, earned: false },
  { id: 'reel-maker', title: 'Reel maker', detail: 'Make 2 more reels', icon: iconSparkles, earned: false },
]

export const SQUADS: { id: string; name: string; members: PersonId[]; detail: string }[] = [
  { id: 'goa-gang', name: 'Goa Gang', members: ['you', 'riya', 'kabir', 'meera', 'dev'], detail: '5 mates · Goa live now' },
  { id: 'mountain-crew', name: 'Mountain Crew', members: ['you', 'riya', 'meera', 'dev'], detail: '4 mates · Manali in 42 days' },
  { id: 'cafe-hoppers', name: 'Café Hoppers', members: ['you', 'kabir', 'riya'], detail: '3 mates · Pondicherry in Jan' },
]

/* Settings */

export type NotificationPrefId = 'trip' | 'votes' | 'payments' | 'photos' | 'tips'

export const NOTIFICATION_PREFS: { id: NotificationPrefId; title: string; description: string }[] = [
  { id: 'trip', title: 'Trip updates', description: 'Plan changes and day-of reminders' },
  { id: 'votes', title: 'Votes', description: 'When the squad needs your pick' },
  { id: 'payments', title: 'Payment requests', description: 'Splits and settle-up nudges' },
  { id: 'photos', title: 'Photos of you', description: 'When face match finds you in an album' },
  { id: 'tips', title: 'GhoomMate tips', description: 'One idea a day, never more' },
]

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPrefId, boolean> = {
  trip: true,
  votes: true,
  payments: true,
  photos: true,
  tips: false,
}

export type LanguageId = 'en' | 'hi'

export const LANGUAGES: { id: LanguageId; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
]

export const APP_VERSION = 'Ghoomate v0.1.0 · Build 2026.10'

/** "name@bank" style UPI handle */
export const isValidUpi = (value: string) => /^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(value.trim())

/* Help & FAQ */

export const FAQS: { id: string; question: string; answer: string }[] = [
  {
    id: 'splits',
    question: 'How do splits work?',
    answer:
      'Add an expense, pick who was in and Ghoomate splits it equally or by amount. We simplify the balances so the squad settles in as few payments as possible.',
  },
  {
    id: 'upi',
    question: 'How do I settle up with UPI?',
    answer:
      'Open Expenses and tap “Settle all”. We open your UPI app with the amount and your mate’s UPI ID filled in, then mark it settled once the payment goes through.',
  },
  {
    id: 'face-match',
    question: 'How does face matching keep my photos private?',
    answer:
      'Your selfie is only used to find you in your own trip albums. It’s never shared outside your squads, and you can turn face match off or delete your selfie in Settings.',
  },
  {
    id: 'invite',
    question: 'How do I invite mates to a trip?',
    answer:
      'Tap “+ Invite” on any trip to copy a link or show a QR code. Anyone with the link can join, and you can remove people from Members.',
  },
  {
    id: 'ghoommate',
    question: 'How do I talk to GhoomMate?',
    answer:
      'Tap the octopus in the bottom-right corner and just say what you need, like “Find a café near our stay” or “Who owes me money?”.',
  },
  {
    id: 'offline',
    question: 'Can I use Ghoomate offline?',
    answer:
      'Your itinerary, tickets and expenses are saved on your phone, so you can check them without signal. New expenses sync as soon as you’re back online.',
  },
  {
    id: 'dates',
    question: 'How do I change trip dates?',
    answer:
      'The trip organiser can change dates in Trip settings before the trip starts. GhoomMate moves the plan around and tells the squad what changed.',
  },
  {
    id: 'delete-data',
    question: 'How do I delete my data?',
    answer:
      'Delete your selfie anytime in Settings · Privacy. To remove everything, choose “Delete account” at the bottom of Settings and we’ll erase your data within 30 days.',
  },
]

export const SUPPORT_EMAIL = 'help@ghoomate.app'

/* Vibe quiz */

export type VibeAxis = 'adventure' | 'food' | 'nightlife' | 'culture' | 'chill' | 'shops'

/** Spiderweb order, clockwise from the top (matches spiderweb.svg) */
export const AXES: { id: VibeAxis; label: string }[] = [
  { id: 'adventure', label: 'Adventure' },
  { id: 'food', label: 'Food' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'culture', label: 'Culture' },
  { id: 'chill', label: 'Chill' },
  { id: 'shops', label: 'Shops' },
]

/** The squad's blended vibe, as drawn in spiderweb.svg (0–1 per axis) */
export const SQUAD_SCORES = [0.9, 0.85, 0.6, 0.5, 0.75, 0.4]

export type QuizOption = {
  id: string
  label: string
  weights: Partial<Record<VibeAxis, number>>
  /** What GhoomMate does differently when this is picked */
  change?: string
}

export type QuizQuestion = {
  id: string
  topic: string
  question: string
  multi: boolean
  tip: string
  options: QuizOption[]
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'pace',
    topic: 'Trip pace',
    question: 'Your ideal trip pace is…',
    multi: false,
    tip: 'I’ll use this to decide how many stops go in a day.',
    options: [
      { id: 'packed', label: 'Packed, see it all', weights: { adventure: 1, culture: 1 }, change: 'Fit 5–6 stops into a day' },
      { id: 'balanced', label: 'A few big things', weights: { culture: 1, chill: 1 }, change: 'Plan 3–4 stops a day, not 6' },
      { id: 'slow', label: 'Slow and easy', weights: { chill: 2 }, change: 'Keep it to 2 stops and long lunches' },
    ],
  },
  {
    id: 'budget',
    topic: 'Budget',
    question: 'Your daily budget sits around…',
    multi: false,
    tip: 'Only you see this. I’ll keep picks inside it.',
    options: [
      { id: 'shoestring', label: 'Under ₹1,500', weights: { adventure: 1 }, change: 'Keep stays under ₹1,500 a night' },
      { id: 'comfy', label: '₹1,500–3,000', weights: {}, change: 'Keep stays around ₹2,500 a night' },
      { id: 'treat', label: '₹3,000+', weights: { shops: 1, chill: 1 }, change: 'Suggest boutique stays and fine dining' },
    ],
  },
  {
    id: 'mornings',
    topic: 'Mornings',
    question: 'Mornings on a trip are for…',
    multi: false,
    tip: 'So I know whether to book that 06:00 AM sunrise.',
    options: [
      { id: 'sunrise', label: 'Sunrise hikes', weights: { adventure: 2 }, change: 'Save sunrise slots for you' },
      { id: 'breakfast', label: 'Slow breakfast', weights: { chill: 1, food: 1 }, change: 'Start days at 10:00 AM with breakfast' },
      { id: 'market', label: 'Market runs', weights: { shops: 2 }, change: 'Add morning markets before it gets hot' },
      { id: 'sleep', label: 'Sleeping in', weights: { nightlife: 1, chill: 1 }, change: 'Never book anything before noon' },
    ],
  },
  {
    id: 'food',
    topic: 'Food',
    question: 'You plan your day around…',
    multi: true,
    tip: 'Pick as many as you like. Food is serious business.',
    options: [
      { id: 'street', label: 'Street food crawls', weights: { food: 2 } },
      { id: 'thali', label: 'Local thalis', weights: { food: 1, culture: 1 } },
      { id: 'cafes', label: 'Cafés with a view', weights: { chill: 1, food: 1 } },
      { id: 'fine', label: 'Fancy dinners', weights: { food: 1, nightlife: 1 } },
    ],
  },
  {
    id: 'evenings',
    topic: 'Evenings',
    question: 'Your perfect evening looks like…',
    multi: true,
    tip: 'This is how I fill the gap between sunset and sleep.',
    options: [
      { id: 'street-food', label: 'Street food crawl', weights: { food: 1 } },
      { id: 'sunset-cruise', label: 'Sunset cruise', weights: { chill: 2 } },
      { id: 'beach-club', label: 'Beach club', weights: { nightlife: 2 } },
      { id: 'live-gig', label: 'Live gig', weights: { nightlife: 1, culture: 1 } },
      { id: 'night-market', label: 'Night market', weights: { shops: 2 } },
    ],
  },
  {
    id: 'adventure',
    topic: 'Adventure',
    question: 'How brave are we feeling?',
    multi: true,
    tip: 'I’ll only suggest the scary stuff if you’re in.',
    options: [
      { id: 'water', label: 'Scuba or rafting', weights: { adventure: 2 } },
      { id: 'treks', label: 'Treks and hikes', weights: { adventure: 2 } },
      { id: 'scooter', label: 'Scooter rides', weights: { adventure: 1 } },
      { id: 'ground', label: 'Feet on the ground', weights: { chill: 1 } },
    ],
  },
  {
    id: 'stays',
    topic: 'Stays',
    question: 'You’re happiest crashing in a…',
    multi: false,
    tip: 'I’ll shortlist these first when the squad books.',
    options: [
      { id: 'hostel', label: 'Hostel with a common room', weights: { nightlife: 1 } },
      { id: 'homestay', label: 'Homestay with a host', weights: { culture: 1 } },
      { id: 'boutique', label: 'Boutique hotel', weights: { shops: 1, chill: 1 } },
      { id: 'beach-hut', label: 'Beach hut', weights: { chill: 2 } },
    ],
  },
  {
    id: 'planning',
    topic: 'Planning style',
    question: 'When it comes to planning, you…',
    multi: false,
    tip: 'Last one! This tells me how much to plan for you.',
    options: [
      { id: 'mapped', label: 'Map every hour', weights: { culture: 1 }, change: 'Send a timed plan the night before' },
      { id: 'loose', label: 'Keep a loose list', weights: {}, change: 'Leave afternoons open to wing it' },
      { id: 'wing', label: 'Wing it', weights: { adventure: 1 }, change: 'Suggest things live, as you go' },
    ],
  },
]

export type QuizAnswers = Readonly<Record<string, readonly string[]>>

/** Your answers from sign-up, which add up to The Thrill-Seeking Foodies */
export const DEFAULT_ANSWERS: QuizAnswers = {
  pace: ['balanced'],
  budget: ['comfy'],
  mornings: ['sunrise'],
  food: ['street', 'thali'],
  evenings: ['street-food', 'sunset-cruise'],
  adventure: ['water', 'scooter'],
  stays: ['homestay'],
  planning: ['loose'],
}

const ADJECTIVES: Record<VibeAxis, string> = {
  adventure: 'Thrill-Seeking',
  food: 'Snack-Hunting',
  nightlife: 'Night-Owl',
  culture: 'Story-Chasing',
  chill: 'Slow-Travelling',
  shops: 'Bazaar-Hopping',
}

const NOUNS: Record<VibeAxis, string> = {
  adventure: 'Adrenaline Junkies',
  food: 'Foodies',
  nightlife: 'Party Starters',
  culture: 'Culture Buffs',
  chill: 'Sunset Chasers',
  shops: 'Market Mavens',
}

export const TRAITS: Record<VibeAxis, { title: string; detail: string }> = {
  adventure: { title: 'Up for anything', detail: 'Treks, scuba, scooters: you say yes first' },
  food: { title: 'Eats like a local', detail: 'You’d cross town for the right vada pav' },
  nightlife: { title: 'Last one home', detail: 'Gigs, beach clubs and late-night chai' },
  culture: { title: 'Story collector', detail: 'Forts, temples and the tales behind them' },
  chill: { title: 'Sunset person', detail: 'You know when to put the phone down' },
  shops: { title: 'Bargain hunter', detail: 'Flea markets are your cardio' },
}

const AXIS_CHANGES: Record<VibeAxis, string> = {
  adventure: 'Put one adventure on every day',
  food: 'Pin the best local food spots first',
  nightlife: 'Keep evenings free for gigs and clubs',
  culture: 'Add a heritage walk to each city',
  chill: 'Block out a lazy afternoon each day',
  shops: 'Route you past markets and bazaars',
}

export type VibeResult = {
  persona: string
  /** 0–1 per axis, in AXES order */
  scores: number[]
  traits: { title: string; detail: string }[]
  changes: string[]
}

/** Turns quiz answers into a spiderweb, a persona name, traits and plan changes. */
export function computeVibe(answers: QuizAnswers): VibeResult {
  const raw: Record<VibeAxis, number> = { adventure: 0, food: 0, nightlife: 0, culture: 0, chill: 0, shops: 0 }
  const changes: string[] = []

  for (const question of QUIZ) {
    for (const option of question.options) {
      if (!answers[question.id]?.includes(option.id)) continue
      for (const [axis, weight] of Object.entries(option.weights) as [VibeAxis, number][]) raw[axis] += weight
      if (option.change && ['pace', 'budget', 'planning'].includes(question.id)) changes.push(option.change)
    }
  }

  const max = Math.max(...Object.values(raw))
  const ranked = AXES.map((a) => a.id).sort((a, b) => raw[b] - raw[a])
  const [first, second, third] = ranked

  if (max === 0) {
    return {
      persona: 'The Easy-Going Explorers',
      scores: AXES.map(() => 0.5),
      traits: [TRAITS.chill],
      changes: ['Ask your squad’s vibe before planning'],
    }
  }

  return {
    persona: `The ${ADJECTIVES[first]} ${NOUNS[second]}`,
    scores: AXES.map((a) => 0.3 + (0.65 * raw[a.id]) / max),
    traits: [first, second, third].map((axis) => TRAITS[axis]),
    changes: [AXIS_CHANGES[first], ...changes].slice(0, 4),
  }
}
