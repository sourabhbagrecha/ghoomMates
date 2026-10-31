import photoCruise from '../../assets/figma/photo-cruise.svg'
import photoSeafood from '../../assets/figma/photo-seafood.svg'
import photoSunrise from '../../assets/figma/photo-sunrise.svg'
import type { PersonId } from '../../data/people'

export type Stop = {
  id: string
  time: string
  title: string
  photo: string
  people: PersonId[]
  reaction: string
  tag: string
  done: boolean
}

export type TripDay = {
  id: string
  label: string
  title: string
  stops: Stop[]
}

export const TRIP = {
  name: 'Goa Trip',
  group: 'Goa Gang',
  dayNumber: 2,
  totalDays: 4,
}

export const VIBE_CHECK = {
  card: 3,
  totalCards: 8,
  question: 'Your perfect evening looks like…',
  options: [
    { id: 'street-food', label: 'Street food crawl', selected: true },
    { id: 'sunset-cruise', label: 'Sunset cruise', selected: true },
    { id: 'beach-club', label: 'Beach club', selected: false },
    { id: 'live-gig', label: 'Live gig', selected: false },
  ],
}

export const DAYS: TripDay[] = [
  {
    id: 'd2',
    label: 'D2',
    title: 'Day 2 · Sat, 31 Oct',
    stops: [
      {
        id: 'chapora-sunrise',
        time: '06:00 AM',
        title: 'Sunrise at Chapora Fort',
        photo: photoSunrise,
        people: ['you', 'riya', 'kabir', 'meera'],
        reaction: '4/5 loved it',
        tag: 'Adventure',
        done: true,
      },
      {
        id: 'seafood-crawl',
        time: '01:00 PM',
        title: 'Beach-shack seafood crawl',
        photo: photoSeafood,
        people: ['you', 'riya', 'kabir', 'meera', 'dev'],
        reaction: 'Whole squad',
        tag: 'Food',
        done: false,
      },
      {
        id: 'mandovi-cruise',
        time: '05:30 PM',
        title: 'Mandovi sunset cruise',
        photo: photoCruise,
        people: ['you', 'riya', 'kabir'],
        reaction: '3/5 picked',
        tag: 'Chill',
        done: false,
      },
    ],
  },
  { id: 'd3', label: 'D3', title: 'Day 3 · Sun, 1 Nov', stops: [] },
  { id: 'd4', label: 'D4', title: 'Day 4 · Mon, 2 Nov', stops: [] },
]
