import photoNightMarket from '../../assets/figma/photo-night-market.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'
import { EXPERIENCE_TAGS } from './experiencesData'

/** 'Trending' shows every guide trip; the rest filter by tag */
export const CATEGORIES = ['Trending', ...EXPERIENCE_TAGS]

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
