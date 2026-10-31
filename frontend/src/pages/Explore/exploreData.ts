import photoGuideTrip from '../../assets/figma/photo-guide-trip.svg'
import photoNightMarket from '../../assets/figma/photo-night-market.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'

export const CATEGORIES = ['Trending', 'Food', 'Nightlife', 'Hidden gems', 'Events']

export const TRENDING: { id: string; title: string; badge: string; stats: string; people: PersonId[]; photo: string }[] = [
  {
    id: 'vagator',
    title: 'Vagator sunset jam',
    badge: 'Hot',
    stats: '2.3k going · 92% match',
    people: ['you', 'riya', 'kabir'],
    photo: photoVagator,
  },
  {
    id: 'night-market',
    title: 'Saturday night market',
    badge: 'Tonight',
    stats: '1.1k going',
    people: ['you', 'riya', 'kabir'],
    photo: photoNightMarket,
  },
]

export const GUIDE_TRIP = {
  pick: 'GhoomMate pick · fits your adventure vibe',
  host: 'Rohan',
  /** Figma shows the Dev avatar on the cover */
  hostAvatar: 'dev' as PersonId,
  rating: 4.9,
  title: 'Spice farm + Dudhsagar waterfall trek',
  details: 'Sun, 2 Nov · 7 hrs · Pickup included',
  price: '₹1,499',
  seatsLeft: 8,
  photo: photoGuideTrip,
}
