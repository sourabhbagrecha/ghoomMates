import photoDinner from '../../assets/figma/photo-dinner.svg'
import photoScooter from '../../assets/figma/photo-scooter.svg'
import photoScuba from '../../assets/figma/photo-scuba.svg'
import type { PersonId } from '../../data/people'

export const BALANCES = [
  { id: 'owe', label: 'You owe', value: '₹2,340', highlight: false },
  { id: 'owed', label: 'You’re owed', value: '₹1,150', highlight: true },
  { id: 'total', label: 'Trip total', value: '₹48.6k', highlight: false },
]

export const SETTLE_ALL = {
  dues: 3,
  net: '₹1,190',
}

export type Settlement = {
  id: string
  from: PersonId
  to: PersonId
  note: string
  amount: string
  incoming: boolean
}

export const SETTLEMENTS: Settlement[] = [
  { id: 'you-kabir', from: 'you', to: 'kabir', note: 'Auto-simplified', amount: '₹1,890', incoming: false },
  { id: 'you-meera', from: 'you', to: 'meera', note: 'Auto-simplified', amount: '₹450', incoming: false },
  { id: 'riya-you', from: 'riya', to: 'you', note: 'Incoming via UPI', amount: '+₹1,150', incoming: true },
]

export const TRANSFERS_SAVED = 4

export const CATEGORIES = [
  { id: 'food', label: 'Food', percent: 42, color: 'var(--color-primary)' },
  { id: 'stays', label: 'Stays', percent: 30, color: 'var(--color-sky)' },
  { id: 'travel', label: 'Travel', percent: 18, color: 'var(--color-amber)' },
  { id: 'fun', label: 'Fun', percent: 10, color: 'var(--color-sky-light)' },
]

export const EXPENSES = [
  { id: 'scuba', title: 'Scuba diving', detail: 'Kabir paid · split 4 ways · Fun', amount: '₹6,000', photo: photoScuba },
  { id: 'dinner', title: 'Beach-shack dinner', detail: 'You paid · split 5 ways · Food', amount: '₹3,200', photo: photoDinner },
  { id: 'scooter', title: 'Scooter rentals', detail: 'Dev paid · split 5 ways · Travel', amount: '₹1,500', photo: photoScooter },
]
