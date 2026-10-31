import cruise from '../../assets/figma/photo-cruise.svg'
import dinner from '../../assets/figma/photo-dinner.svg'
import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'
import guide from '../../assets/figma/photo-guide-trip.svg'
import market from '../../assets/figma/photo-night-market.svg'
import scooter from '../../assets/figma/photo-scooter.svg'
import scuba from '../../assets/figma/photo-scuba.svg'
import sunrise from '../../assets/figma/photo-sunrise.svg'
import vagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'
import { PAST_TRIPS, type Trip } from '../../data/trips'

export type Category = 'Food' | 'Stays' | 'Travel' | 'Fun'

export type PastStop = { time: string; title: string; tag: string; photo: string; rating: number }

export type PastTripDetails = {
  trip: Trip
  dates: string
  days: { label: string; title: string; stops: PastStop[] }[]
  photos: { src: string; people: PersonId[] }[]
  photoCount: number
  stats: { label: string; value: string }[]
  awards: { person: PersonId; title: string; detail: string }[]
  persona: string
  reel: { title: string; clips: number }
  expenses: { title: string; paidBy: PersonId; amount: number; category: Category }[]
  /** What's still unpaid when the trip ended */
  balances: { from: PersonId; to: PersonId; amount: number }[]
}

const byId = (id: string) => PAST_TRIPS.find((t) => t.id === id) as Trip

// Mock archive until the trips service keeps finished trips
export const PAST_TRIP_DETAILS: Record<string, PastTripDetails> = {
  rishikesh: {
    trip: byId('rishikesh'),
    dates: 'Fri 14 – Sun 16 Aug',
    days: [
      {
        label: 'Day 1 · Fri 14 Aug',
        title: 'Riverside camp',
        stops: [
          { time: '02:00 PM', title: 'Check in at Shivpuri riverside camp', tag: 'Stays', photo: grid3, rating: 4 },
          { time: '05:30 PM', title: 'Beach volleyball on the Ganga', tag: 'Fun', photo: sunrise, rating: 5 },
          { time: '08:00 PM', title: 'Bonfire and maggi', tag: 'Food', photo: dinner, rating: 4 },
        ],
      },
      {
        label: 'Day 2 · Sat 15 Aug',
        title: 'Rapids day',
        stops: [
          { time: '09:00 AM', title: 'Rafting from Shivpuri, 16 km', tag: 'Adventure', photo: grid1, rating: 5 },
          { time: '01:30 PM', title: 'Lunch at Little Buddha Café', tag: 'Food', photo: grid4, rating: 4 },
          { time: '06:30 PM', title: 'Ganga aarti at Triveni Ghat', tag: 'Culture', photo: cruise, rating: 5 },
        ],
      },
      {
        label: 'Day 3 · Sun 16 Aug',
        title: 'Slow morning, then home',
        stops: [
          { time: '07:00 AM', title: 'Sunrise at Laxman Jhula', tag: 'Chill', photo: grid2, rating: 3 },
          { time: '11:00 AM', title: 'Beatles Ashram walk', tag: 'Culture', photo: guide, rating: 4 },
        ],
      },
    ],
    photos: [
      { src: grid1, people: ['you', 'riya', 'kabir'] },
      { src: sunrise, people: ['kabir', 'dev'] },
      { src: grid3, people: ['you', 'meera'] },
      { src: cruise, people: ['riya', 'meera', 'kabir'] },
      { src: grid4, people: ['you', 'dev'] },
      { src: dinner, people: ['you', 'riya', 'kabir', 'meera', 'dev'] },
      { src: grid2, people: ['meera'] },
      { src: guide, people: ['kabir', 'riya'] },
      { src: grid6, people: ['you', 'kabir'] },
    ],
    photoCount: 412,
    stats: [
      { label: 'Days', value: '3' },
      { label: 'Photos', value: '412' },
      { label: 'Km on the river', value: '16' },
      { label: 'Spent', value: '₹38,400' },
      { label: 'Top-rated', value: 'Rafting' },
      { label: 'Most tagged', value: 'Kabir' },
    ],
    awards: [
      { person: 'kabir', title: 'Most photographed', detail: 'In 148 of 412 pics' },
      { person: 'riya', title: 'Early bird', detail: 'First up all 3 mornings' },
      { person: 'dev', title: 'Snack sponsor', detail: 'Paid for 6 chai runs' },
    ],
    persona: 'The Thrill-Seeking Foodies',
    reel: { title: 'Rishikesh in 60 seconds', clips: 32 },
    expenses: [
      { title: 'Riverside camp, 2 nights', paidBy: 'riya', amount: 15000, category: 'Stays' },
      { title: 'Rafting, 16 km', paidBy: 'kabir', amount: 7500, category: 'Fun' },
      { title: 'Tempo traveller from Delhi', paidBy: 'dev', amount: 9600, category: 'Travel' },
      { title: 'Little Buddha Café', paidBy: 'you', amount: 3800, category: 'Food' },
      { title: 'Chai and maggi runs', paidBy: 'dev', amount: 2500, category: 'Food' },
    ],
    balances: [],
  },
  jaipur: {
    trip: byId('jaipur'),
    dates: 'Fri 13 – Sun 15 Mar',
    days: [
      {
        label: 'Day 1 · Fri 13 Mar',
        title: 'Old city',
        stops: [
          { time: '03:00 PM', title: 'Check in at a Bapu Bazaar haveli', tag: 'Stays', photo: grid5, rating: 5 },
          { time: '06:00 PM', title: 'Sunset at Nahargarh Fort', tag: 'Chill', photo: vagator, rating: 5 },
        ],
      },
      {
        label: 'Day 2 · Sat 14 Mar',
        title: 'Forts and cafés',
        stops: [
          { time: '10:00 AM', title: 'Amer Fort tour', tag: 'Culture', photo: market, rating: 4 },
          { time: '01:00 PM', title: 'Rooftop thali in Johari Bazaar', tag: 'Food', photo: dinner, rating: 5 },
          { time: '08:00 PM', title: 'Chokhi Dhani folk evening', tag: 'Culture', photo: grid2, rating: 4 },
        ],
      },
      {
        label: 'Day 3 · Sun 15 Mar',
        title: 'Pink City, then home',
        stops: [{ time: '07:30 AM', title: 'Hawa Mahal at sunrise', tag: 'Culture', photo: grid1, rating: 4 }],
      },
    ],
    photos: [
      { src: vagator, people: ['you', 'kabir', 'riya'] },
      { src: grid5, people: ['riya'] },
      { src: market, people: ['you', 'kabir'] },
      { src: dinner, people: ['you', 'kabir', 'riya'] },
      { src: grid2, people: ['kabir'] },
      { src: grid1, people: ['you', 'riya'] },
    ],
    photoCount: 288,
    stats: [
      { label: 'Days', value: '3' },
      { label: 'Photos', value: '288' },
      { label: 'Forts', value: '3' },
      { label: 'Spent', value: '₹27,600' },
      { label: 'Top-rated', value: 'Amer Fort' },
      { label: 'Most tagged', value: 'Riya' },
    ],
    awards: [
      { person: 'riya', title: 'Most photographed', detail: 'In 97 of 288 pics' },
      { person: 'kabir', title: 'Thali champion', detail: 'Three refills, zero regrets' },
    ],
    persona: 'The Culture Café Crawlers',
    reel: { title: 'Jaipur in 60 seconds', clips: 24 },
    expenses: [
      { title: 'Bapu Bazaar haveli, 2 nights', paidBy: 'riya', amount: 12600, category: 'Stays' },
      { title: 'Flights split', paidBy: 'you', amount: 9000, category: 'Travel' },
      { title: 'Johari Bazaar and cafés', paidBy: 'kabir', amount: 4200, category: 'Food' },
      { title: 'Amer Fort and Hawa Mahal', paidBy: 'kabir', amount: 1800, category: 'Fun' },
    ],
    balances: [],
  },
  hampi: {
    trip: byId('hampi'),
    dates: 'Fri 26 – Sun 28 Dec',
    days: [
      {
        label: 'Day 1 · Fri 26 Dec',
        title: 'Across the river',
        stops: [
          { time: '12:00 PM', title: 'Hippie Island guesthouse', tag: 'Stays', photo: grid6, rating: 3 },
          { time: '05:00 PM', title: 'Coracle ride on the Tungabhadra', tag: 'Fun', photo: scuba, rating: 5 },
        ],
      },
      {
        label: 'Day 2 · Sat 27 Dec',
        title: 'Ruins by scooter',
        stops: [
          { time: '06:00 AM', title: 'Sunrise from Matanga Hill', tag: 'Adventure', photo: sunrise, rating: 5 },
          { time: '10:00 AM', title: 'Virupaksha and Vittala temples', tag: 'Culture', photo: guide, rating: 5 },
          { time: '04:00 PM', title: 'Scooter loop to Anegundi', tag: 'Adventure', photo: scooter, rating: 4 },
        ],
      },
      {
        label: 'Day 3 · Sun 28 Dec',
        title: 'Bouldering, then home',
        stops: [{ time: '08:00 AM', title: 'Bouldering session', tag: 'Adventure', photo: grid3, rating: 4 }],
      },
    ],
    photos: [
      { src: sunrise, people: ['you', 'meera', 'dev'] },
      { src: guide, people: ['meera'] },
      { src: scooter, people: ['you', 'dev'] },
      { src: scuba, people: ['you', 'meera'] },
      { src: grid6, people: ['dev'] },
      { src: grid3, people: ['you', 'meera', 'dev'] },
    ],
    photoCount: 196,
    stats: [
      { label: 'Days', value: '3' },
      { label: 'Photos', value: '196' },
      { label: 'Km by scooter', value: '64' },
      { label: 'Spent', value: '₹17,700' },
      { label: 'Top-rated', value: 'Sunrise' },
      { label: 'Most tagged', value: 'Meera' },
    ],
    awards: [
      { person: 'meera', title: 'Most photographed', detail: 'In 71 of 196 pics' },
      { person: 'dev', title: 'Navigator', detail: 'Got the scooters to Anegundi and back' },
    ],
    persona: 'The Sunrise Scramblers',
    reel: { title: 'Hampi in 60 seconds', clips: 21 },
    expenses: [
      { title: 'Hippie Island guesthouse', paidBy: 'meera', amount: 7200, category: 'Stays' },
      { title: 'Sleeper bus from Bengaluru', paidBy: 'dev', amount: 5400, category: 'Travel' },
      { title: 'Scooters and coracle', paidBy: 'meera', amount: 2700, category: 'Fun' },
      { title: 'Mango Tree and thalis', paidBy: 'you', amount: 2400, category: 'Food' },
    ],
    balances: [{ from: 'you', to: 'meera', amount: 320 }],
  },
}

export const CATEGORY_COLOURS: Record<Category, string> = {
  Food: 'var(--color-primary)',
  Stays: 'var(--color-sky)',
  Travel: 'var(--color-amber)',
  Fun: 'var(--color-sky-light)',
}

export const REMEMBER_OPTIONS = [
  'Same squad again',
  'More adventure',
  'More food stops',
  'Fewer early starts',
  'Better stays',
  'Slower pace',
]
