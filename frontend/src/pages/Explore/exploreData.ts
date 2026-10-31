import photoNightMarket from '../../assets/figma/photo-night-market.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'
import { EXPERIENCE_PHOTOS } from './experiencePhotos'
import { EXPERIENCE_TAGS, type ExperienceCity } from './experiencesData'

/** 'Trending' shows every guide trip; the rest filter by tag */
export const CATEGORIES = ['Trending', ...EXPERIENCE_TAGS]

export type Trend = {
  id: string
  title: string
  badge: string
  stats: string
  people: PersonId[]
  photo: string
  /** Guide trip the card opens, if any */
  experienceId?: string
}

export const TRENDING: Record<ExperienceCity, Trend[]> = {
  Udaipur: [
    {
      id: 'pichola-sunset',
      title: 'Pichola sunset boat',
      badge: 'Hot',
      stats: '1.8k going · 94% match',
      people: ['you', 'riya', 'meera'],
      photo: EXPERIENCE_PHOTOS.pichola[0].src,
      experienceId: 'pichola-sunset-boat',
    },
    {
      id: 'ambrai-folk-night',
      title: 'Rooftop folk night',
      badge: 'Tonight',
      stats: '640 going',
      people: ['you', 'kabir', 'dev'],
      photo: EXPERIENCE_PHOTOS.ambraiDinner[0].src,
      experienceId: 'ambrai-rooftop-folk-dinner',
    },
    {
      id: 'molela-clay',
      title: 'Molela pottery class',
      badge: 'New',
      stats: '310 going · 91% match',
      people: ['you', 'meera', 'riya'],
      photo: EXPERIENCE_PHOTOS.molela[1].src,
      experienceId: 'molela-pottery-workshop',
    },
  ],
  Goa: [
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
  ],
}
