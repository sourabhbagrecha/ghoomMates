import photoGuideTrip from '../../assets/figma/photo-guide-trip.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import photoCruise from '../../assets/figma/photo-cruise.svg'
import photoNightMarket from '../../assets/figma/photo-night-market.svg'
import photoReel from '../../assets/figma/photo-reel.svg'
import photoSeafood from '../../assets/figma/photo-seafood.svg'
import photoSunrise from '../../assets/figma/photo-sunrise.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'
import { LIVE_TRIP } from '../../data/trips'
import { SETTLEMENTS } from '../Expenses/expensesData'
import { GUIDE_TRIP } from '../Explore/exploreData'
import { DAYS, type Stop } from '../Itinerary/itineraryData'
import { PHOTOS } from '../Photos/photosData'

/** Stop with the extra detail the stop screen needs. Seeded from the itinerary data. */
export type TripStop = Stop & {
  dayId: string
  place: string
  notes: string
  /** Travel time from where the squad is staying */
  away: string
}

const STOP_EXTRAS: Record<string, Pick<TripStop, 'place' | 'notes' | 'away'>> = {
  'chapora-sunrise': {
    place: 'Chapora Fort, Vagator',
    notes: 'Leave by 5:30 AM. Steep last stretch, wear proper shoes and carry water. Chai stall at the bottom opens at 7.',
    away: '15 min by scooter',
  },
  'seafood-crawl': {
    place: 'Baga beach shacks',
    notes: 'Start at Britto’s, then Souza Lobo. Kabir wants the tiger prawns. Budget about ₹800 each.',
    away: '10 min by scooter',
  },
  'mandovi-cruise': {
    place: 'Santa Monica Jetty, Panaji',
    notes: 'Boarding closes at 5:15 PM. Tickets are with Riya. Live Goan music on the top deck.',
    away: '35 min by cab',
  },
}

export const SEED_STOPS: TripStop[] = DAYS.flatMap((day) =>
  day.stops.map((stop) => ({
    ...stop,
    dayId: day.id,
    ...(STOP_EXTRAS[stop.id] ?? { place: '', notes: '', away: '' }),
  })),
)

export const STOP_TAGS = ['Adventure', 'Food', 'Chill', 'Culture', 'Nightlife', 'Shops']

/** Placeholder photo for a new stop, by tag */
export const TAG_PHOTOS: Record<string, string> = {
  Adventure: photoSunrise,
  Food: photoSeafood,
  Chill: photoCruise,
  Culture: grid4,
  Nightlife: photoNightMarket,
  Shops: grid2,
}

export const RSVP_OPTIONS = [
  { id: 'going', label: 'Going' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'skip', label: 'Skip' },
] as const

export type Rsvp = (typeof RSVP_OPTIONS)[number]['id']

export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food' },
  { id: 'stays', label: 'Stays' },
  { id: 'travel', label: 'Travel' },
  { id: 'fun', label: 'Fun' },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id']

const amountOf = (value: string) => Number(value.replace(/[^\d]/g, ''))

/** Your outgoing dues and incoming money, from the Expenses tab */
export const DUES = SETTLEMENTS.filter((s) => s.from === 'you').map((s) => ({ ...s, value: amountOf(s.amount) }))
export const INCOMING = SETTLEMENTS.filter((s) => s.to === 'you').map((s) => ({ ...s, value: amountOf(s.amount) }))
export const NET_PAYMENT =
  DUES.reduce((sum, d) => sum + d.value, 0) - INCOMING.reduce((sum, d) => sum + d.value, 0)

export const UPI_APPS = [
  { id: 'gpay', name: 'GPay', initial: 'G' },
  { id: 'phonepe', name: 'PhonePe', initial: 'Pe' },
  { id: 'paytm', name: 'Paytm', initial: 'Pt' },
  { id: 'bhim', name: 'BHIM', initial: 'B' },
] as const

export type UpiAppId = (typeof UPI_APPS)[number]['id']

/** Who's in each of the 6 grid photos, and where it was taken */
export const PHOTO_DETAILS: { people: PersonId[]; caption: string; time: string }[] = [
  { people: ['you', 'riya', 'kabir'], caption: 'Chapora Fort', time: 'Sat, 31 Oct · 06:12 AM' },
  { people: ['kabir', 'meera'], caption: 'Vagator beach', time: 'Sat, 31 Oct · 07:40 AM' },
  { people: ['you', 'riya', 'kabir', 'meera', 'dev'], caption: 'Breakfast at Artjuna', time: 'Sat, 31 Oct · 09:05 AM' },
  { people: ['dev', 'kabir'], caption: 'Scooter run to Anjuna', time: 'Fri, 30 Oct · 04:20 PM' },
  { people: ['riya', 'meera'], caption: 'Anjuna flea market', time: 'Fri, 30 Oct · 05:45 PM' },
  { people: ['you', 'kabir', 'dev'], caption: 'Curlies at sunset', time: 'Fri, 30 Oct · 06:30 PM' },
]

export const VIEWER_PHOTOS = PHOTOS

/** Camera-roll photos offered on the upload screen */
export const CAMERA_ROLL = [...PHOTOS, photoVagator, photoNightMarket, photoReel]

export const UPLOAD_STEPS = ['Ingest', 'Faces', 'Embed', 'Match']

export const SHARE_TARGETS = [
  { id: 'instagram', label: 'Instagram', initial: 'Ig' },
  { id: 'whatsapp', label: 'WhatsApp', initial: 'W' },
] as const

export const GUIDE_DETAIL = {
  ...GUIDE_TRIP,
  cover: photoGuideTrip,
  date: 'Sun, 2 Nov',
  duration: '7 hrs',
  pickup: 'Pickup from Baga',
  hostBio: 'Local guide · 126 trips · Speaks Konkani, Hindi, English',
  timeline: [
    { time: '07:00 AM', title: 'Pickup from your stay', note: 'AC tempo traveller from Baga' },
    { time: '08:30 AM', title: 'Sahakari spice farm walk', note: 'Tasting + Goan breakfast' },
    { time: '10:30 AM', title: 'Jeep safari to Dudhsagar', note: 'Through Bhagwan Mahaveer sanctuary' },
    { time: '11:30 AM', title: 'Waterfall trek and swim', note: 'Life jackets provided' },
    { time: '01:00 PM', title: 'Goan thali lunch', note: 'Veg and fish options' },
    { time: '02:00 PM', title: 'Drop back at Baga', note: 'Nap in the van, promise' },
  ],
  included: ['Pickup and drop', 'Jeep safari permit', 'Breakfast and thali lunch', 'Life jackets and guide'],
  interested: ['riya', 'kabir', 'dev'] as PersonId[],
}

export type Member = {
  id: PersonId
  role: string
  vibe: string
  depositPaid: boolean
}

export const MEMBERS: Member[] = [
  { id: 'you', role: 'Organiser', vibe: 'Thrill-seeker', depositPaid: true },
  { id: 'riya', role: 'Co-organiser', vibe: 'Foodie', depositPaid: true },
  { id: 'kabir', role: 'Treasurer', vibe: 'Night owl', depositPaid: true },
  { id: 'meera', role: 'Mate', vibe: 'Culture buff', depositPaid: true },
  { id: 'dev', role: 'Mate', vibe: 'Beach bum', depositPaid: false },
]

export const TRIP_DEPOSIT = '₹5,000'

export const INVITE_LINK = 'https://ghoomate.app/j/goa-gang'

export const TRIP_INFO = {
  name: LIVE_TRIP.name,
  group: LIVE_TRIP.group,
  dates: LIVE_TRIP.dates,
  currency: '₹ INR · Indian rupee',
}

export const NOTIFICATION_SETTINGS = [
  { id: 'itinerary', title: 'Itinerary changes', description: 'New stops, time changes and votes' },
  { id: 'expenses', title: 'New expenses', description: 'When someone adds a spend you’re in' },
  { id: 'photos', title: 'Photos and reels', description: 'New uploads and photos you’re tagged in' },
  { id: 'briefing', title: 'GhoomMate morning briefing', description: 'Your day’s plan at 7 AM' },
] as const

export type NotificationSettingId = (typeof NOTIFICATION_SETTINGS)[number]['id']
