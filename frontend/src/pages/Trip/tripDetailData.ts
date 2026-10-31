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
import { GUIDE_TRIP } from '../Explore/exploreData'
import { REEL } from '../Photos/photosData'

export const STOP_TAGS = ['Adventure', 'Food', 'Chill', 'Culture', 'Nightlife', 'Shops', 'Stay', 'Travel']

/** Placeholder photo for a new stop, by tag */
export const TAG_PHOTOS: Record<string, string> = {
  Adventure: photoSunrise,
  Food: photoSeafood,
  Chill: photoCruise,
  Culture: grid4,
  Nightlife: photoNightMarket,
  Shops: grid2,
  Stay: photoVagator,
  Travel: photoReel,
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

export const UPI_APPS = [
  { id: 'gpay', name: 'GPay', initial: 'G' },
  { id: 'phonepe', name: 'PhonePe', initial: 'Pe' },
  { id: 'paytm', name: 'Paytm', initial: 'Pt' },
  { id: 'bhim', name: 'BHIM', initial: 'B' },
] as const

export type UpiAppId = (typeof UPI_APPS)[number]['id']

export const UPLOAD_STEPS = ['Ingest', 'Faces', 'Embed', 'Match']

export const REEL_RESULT = {
  title: 'Kabir’s funniest moments',
  meta: `${REEL.duration} · Bollywood beat · 24 clips`,
  duration: REEL.duration,
  prompt: REEL.prompt,
  cover: photoReel,
}

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

export const NOTIFICATION_SETTINGS = [
  { id: 'itinerary', title: 'Itinerary changes', description: 'New stops, time changes and votes' },
  { id: 'expenses', title: 'New expenses', description: 'When someone adds a spend you’re in' },
  { id: 'photos', title: 'Photos and reels', description: 'New uploads and photos you’re tagged in' },
  { id: 'briefing', title: 'GhoomMate morning briefing', description: 'Your day’s plan at 7 AM' },
] as const

export type NotificationSettingId = (typeof NOTIFICATION_SETTINGS)[number]['id']
