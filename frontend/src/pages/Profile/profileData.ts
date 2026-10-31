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
import type { PersonId } from '../../data/people'
import { SQUAD_VIBE, VIBE_AXES, type VibeAxis, type VibeScores } from '../../data/vibe'
import { UDAIPUR_COVER } from '../Explore/experiencePhotos'
import { personaFor } from '../Quiz/quizData'

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
  { id: 'udaipur', name: 'Udaipur', when: 'Oct 2026', status: 'now', photo: UDAIPUR_COVER, route: 'trip/itinerary' },
  { id: 'manali', name: 'Manali', when: 'Dec 2026', status: 'upcoming', photo: grid1, route: 'plan' },
  { id: 'rishikesh', name: 'Rishikesh', when: 'Aug 2026', status: 'visited', photo: grid3, route: 'past/rishikesh' },
  { id: 'jaipur', name: 'Jaipur', when: 'Mar 2026', status: 'visited', photo: grid5, route: 'past/jaipur' },
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
  { id: 'lake-city-squad', name: 'Lake City Squad', members: ['you', 'riya', 'kabir', 'meera', 'dev'], detail: '5 mates · Udaipur live now' },
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

/* Your vibe, from the personality quiz in src/pages/Quiz */

/** Spiderweb order, clockwise from the top (matches spiderweb.svg) */
export const AXES = VIBE_AXES

/** The squad’s blended vibe, as drawn in spiderweb.svg (0–1 per axis, in AXES order) */
export const SQUAD_SCORES = AXES.map(({ id }) => SQUAD_VIBE[id])

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

/** Your saved quiz vibe as Profile shows it: persona, spiderweb scores, top traits and plan changes. */
export function vibeResultFor(scores: VibeScores): VibeResult {
  const ranked = [...AXES].sort((a, b) => scores[b.id] - scores[a.id]).map((a) => a.id)
  return {
    persona: personaFor(scores).name,
    scores: AXES.map(({ id }) => scores[id]),
    traits: ranked.slice(0, 3).map((axis) => TRAITS[axis]),
    changes: ranked.slice(0, 2).map((axis) => AXIS_CHANGES[axis]),
  }
}
