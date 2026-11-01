import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import photoCruise from '../../assets/figma/photo-cruise.svg'
import photoNightMarket from '../../assets/figma/photo-night-market.svg'
import photoReel from '../../assets/figma/photo-reel.svg'
import photoSeafood from '../../assets/figma/photo-seafood.svg'
import photoSunrise from '../../assets/figma/photo-sunrise.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import iconInstagram from '../../assets/brands/instagram-white.svg'
import iconWhatsApp from '../../assets/brands/whatsapp-white.svg'

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

export const SHARE_TARGETS = [
  { id: 'instagram', label: 'Instagram', icon: iconInstagram },
  { id: 'whatsapp', label: 'WhatsApp', icon: iconWhatsApp },
] as const

export const NOTIFICATION_SETTINGS = [
  { id: 'itinerary', title: 'Itinerary changes', description: 'New stops, time changes and votes' },
  { id: 'expenses', title: 'New expenses', description: 'When someone adds a spend you’re in' },
  { id: 'photos', title: 'Photos and reels', description: 'New uploads and photos you’re tagged in' },
  { id: 'briefing', title: 'GhoomMate morning briefing', description: 'Your day’s plan at 7 AM' },
] as const

export type NotificationSettingId = (typeof NOTIFICATION_SETTINGS)[number]['id']
