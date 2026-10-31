import iconBed from '../../assets/figma/icon-bed-primary.svg'
import iconBus from '../../assets/figma/icon-bus-primary.svg'
import iconCar from '../../assets/figma/icon-car-primary.svg'
import iconTicket from '../../assets/figma/icon-ticket-primary.svg'
import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import type { PersonId } from '../../data/people'
import { UPCOMING_TRIPS } from '../../data/trips'

// Mock data until the planning service exists. "Today" is Sat 31 Oct.
export const TRIP = UPCOMING_TRIPS[0]

export const PLAN = {
  eyebrow: 'Starts in 42 days · Planning',
  nights: 4,
  depositPerPerson: 15000,
  depositDue: 'Sun 15 Nov',
}

/** ₹ with Indian digit grouping: 150000 → ₹1,50,000 */
export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

/* Votes */

export type VoteId = 'stay' | 'day3'

export type VoteOption = {
  id: string
  name: string
  details: string
  price: string
  photo: string
  /** Squad members who have already voted for it (never includes you) */
  votes: PersonId[]
}

export type Vote = {
  id: VoteId
  /** Short title for the screen header */
  title: string
  question: string
  startedBy: PersonId
  started: string
  closes: string
  options: VoteOption[]
}

export const VOTES: Record<VoteId, Vote> = {
  stay: {
    id: 'stay',
    title: 'Where to stay',
    question: 'Where should we stay?',
    startedBy: 'meera',
    started: 'Yesterday',
    closes: 'Sun 8 Nov',
    options: [
      {
        id: 'snowpeak',
        name: 'Snowpeak Cottage',
        details: 'Old Manali · 5 min walk to the cafés',
        price: '₹3,200/night',
        photo: grid1,
        votes: ['riya'],
      },
      {
        id: 'pine-crest',
        name: 'Pine Crest Homestay',
        details: 'Vashisht · Hot springs next door',
        price: '₹2,600/night',
        photo: grid2,
        votes: ['meera'],
      },
      {
        id: 'hideout',
        name: 'The Himalayan Hideout',
        details: 'Hadimba Road · Heated rooms, breakfast in',
        price: '₹4,100/night',
        photo: grid4,
        votes: ['dev'],
      },
    ],
  },
  day3: {
    id: 'day3',
    title: 'Day 3 plan',
    question: 'Day 3: Solang Valley or Sissu?',
    startedBy: 'riya',
    started: 'Thu',
    closes: 'Sun 8 Nov',
    options: [
      {
        id: 'solang',
        name: 'Solang Valley',
        details: 'Skiing, ropeway, snow tubing · 14 km',
        price: '₹1,500 each',
        photo: grid3,
        votes: ['riya', 'dev'],
      },
      {
        id: 'sissu',
        name: 'Sissu via Atal Tunnel',
        details: 'Frozen waterfall, snow fields · 40 km',
        price: '₹2,200 each',
        photo: grid5,
        votes: ['meera'],
      },
    ],
  },
}

export const VOTE_IDS = Object.keys(VOTES) as VoteId[]

export const isVoteId = (value: string | undefined): value is VoteId => !!value && value in VOTES

/* Squad */

/** Who has said they’re definitely in. Deposits are tracked separately. */
export const CONFIRMED: Partial<Record<PersonId, boolean>> = { you: true, riya: true, meera: true, dev: false }

export const INITIAL_DEPOSITS: Partial<Record<PersonId, string>> = {
  riya: 'Mon 26 Oct',
  meera: 'Wed 28 Oct',
}

/* Draft itinerary */

export type PlanStop = {
  id: string
  time: string
  title: string
} & (
  | { status: 'locked' }
  | { status: 'keen'; keen: PersonId[] }
  /** `decidedTitle` replaces the title once the vote has a winner; `{winner}` is the option name */
  | { status: 'vote'; voteId: VoteId; decidedTitle: string }
)

export type PlanDay = {
  id: string
  label: string
  date: string
  title: string
  stops: PlanStop[]
}

export const PLAN_DAYS: PlanDay[] = [
  {
    id: 'd1',
    label: 'D1',
    date: 'Sat 12 Dec',
    title: 'Arrive and thaw out',
    stops: [
      { id: 'arrive', time: '09:00 AM', title: 'Volvo rolls into Manali', status: 'locked' },
      { id: 'check-in', time: '11:00 AM', title: 'Check in', status: 'vote', voteId: 'stay', decidedTitle: 'Check in at {winner}' },
      { id: 'cafes', time: '04:00 PM', title: 'Old Manali café hop', status: 'keen', keen: ['you', 'riya', 'meera'] },
    ],
  },
  {
    id: 'd2',
    label: 'D2',
    date: 'Sun 13 Dec',
    title: 'Temples and hot springs',
    stops: [
      { id: 'hadimba', time: '09:30 AM', title: 'Hadimba Temple and the cedar forest', status: 'locked' },
      { id: 'vashisht', time: '12:30 PM', title: 'Vashisht hot springs', status: 'keen', keen: ['riya', 'meera', 'dev'] },
      { id: 'mall-road', time: '06:00 PM', title: 'Momos and shopping on Mall Road', status: 'locked' },
    ],
  },
  {
    id: 'd3',
    label: 'D3',
    date: 'Mon 14 Dec',
    title: 'Snow day',
    stops: [
      { id: 'snow', time: '08:00 AM', title: 'Solang Valley or Sissu?', status: 'vote', voteId: 'day3', decidedTitle: '{winner}' },
      { id: 'bonfire', time: '07:30 PM', title: 'Bonfire and Maggi at the stay', status: 'keen', keen: ['you', 'riya', 'meera', 'dev'] },
    ],
  },
  {
    id: 'd4',
    label: 'D4',
    date: 'Tue 15 Dec',
    title: 'Waterfall trek',
    stops: [
      { id: 'jogini', time: '08:30 AM', title: 'Jogini Falls trek from Vashisht', status: 'locked' },
      { id: 'manu', time: '02:00 PM', title: 'Manu Temple and Old Manali lanes', status: 'keen', keen: ['you', 'meera'] },
      { id: 'farewell', time: '07:30 PM', title: 'Farewell dinner at Johnson’s Café', status: 'keen', keen: ['you', 'riya', 'dev'] },
    ],
  },
  {
    id: 'd5',
    label: 'D5',
    date: 'Wed 16 Dec',
    title: 'Head home',
    stops: [
      { id: 'check-out', time: '11:00 AM', title: 'Check out and one last café run', status: 'locked' },
      { id: 'bus-home', time: '05:00 PM', title: 'Volvo back to Delhi', status: 'locked' },
    ],
  },
]

/* Bookings */

export type BookingKind = 'stay' | 'bus' | 'cab' | 'activity'

export const BOOKING_KINDS: { id: BookingKind; label: string; icon: string }[] = [
  { id: 'stay', label: 'Stay', icon: iconBed },
  { id: 'bus', label: 'Bus', icon: iconBus },
  { id: 'cab', label: 'Cab', icon: iconCar },
  { id: 'activity', label: 'Activity', icon: iconTicket },
]

export const bookingIcon = (kind: BookingKind) => BOOKING_KINDS.find((k) => k.id === kind)?.icon ?? iconTicket

export type Booking = {
  id: string
  kind: BookingKind
  title: string
  details: string
  when: string
  /** One-line version for the overview */
  summary: string
  status: 'booked' | 'to-book'
  /** PNR or confirmation code */
  code?: string
  paidBy?: PersonId
  /** Each person’s share in rupees */
  share?: number
  /** Who has paid their share back to `paidBy` */
  settled?: PersonId[]
  /** Who’s sorting it out, for things not booked yet */
  owner?: PersonId
  note?: string
}

export const TRANSPORT: Booking[] = [
  {
    id: 'bus-there',
    kind: 'bus',
    title: 'Delhi → Manali',
    details: 'HRTC Himsuta Volvo · Seats 21–24',
    when: 'Fri 11 Dec, 08:30 PM → Sat 12 Dec, 09:00 AM',
    summary: 'Fri 11 Dec · Overnight Volvo',
    status: 'booked',
    code: '7741 2093',
    paidBy: 'dev',
    share: 1850,
    settled: ['dev', 'riya', 'meera'],
  },
  {
    id: 'bus-back',
    kind: 'bus',
    title: 'Manali → Delhi',
    details: 'HRTC Himsuta Volvo · Seats 9–12',
    when: 'Wed 16 Dec, 05:00 PM → Thu 17 Dec, 07:00 AM',
    summary: 'Wed 16 Dec · Overnight Volvo',
    status: 'booked',
    code: '7741 9310',
    paidBy: 'riya',
    share: 1750,
    settled: ['riya', 'you', 'meera'],
  },
  {
    id: 'cab',
    kind: 'cab',
    title: 'Local cab',
    details: 'Innova with driver · Snow day + Hadimba run',
    when: 'Sun 13 – Mon 14 Dec',
    summary: 'Dev’s getting quotes',
    status: 'to-book',
    owner: 'dev',
    note: 'Quotes from ₹3,500/day',
  },
]

/** Already-uploaded tickets, by booking id */
export const INITIAL_TICKETS: Record<string, string> = {
  'bus-there': 'hrtc-delhi-manali.pdf',
}

/** Riya places a refundable hold on whichever stay wins the vote */
export const STAY_HOLD = {
  heldBy: 'riya' as PersonId,
  code: 'SNW-48213',
  dates: 'Sat 12 – Wed 16 Dec · 4 nights',
  rooms: '2 rooms · 4 guests',
  cancellation: 'Free cancellation till Tue 1 Dec',
}

/* Checklist */

export type ChecklistItem = {
  id: string
  label: string
  done: boolean
  /** Group to-dos only */
  assignee?: PersonId
}

export const GROUP_TODOS: ChecklistItem[] = [
  { id: 'g-bus', label: 'Book the Volvo both ways', assignee: 'dev', done: true },
  { id: 'g-playlist', label: 'Make the bus playlist', assignee: 'riya', done: true },
  { id: 'g-stay', label: 'Hold the stay once the vote closes', assignee: 'riya', done: false },
  { id: 'g-deposits', label: 'Collect everyone’s deposit', assignee: 'meera', done: false },
  { id: 'g-cab', label: 'Get cab quotes for the snow day', assignee: 'dev', done: false },
  { id: 'g-gear', label: 'Find ski and snow-boot rentals in Solang', assignee: 'you', done: false },
  { id: 'g-tunnel', label: 'Check Atal Tunnel road status the day before', assignee: 'you', done: false },
]

export const BAG_ITEMS: ChecklistItem[] = [
  { id: 'b-thermals', label: 'Thermals (2 sets)', done: true },
  { id: 'b-jacket', label: 'Down jacket', done: true },
  { id: 'b-socks', label: 'Woollen socks and gloves', done: true },
  { id: 'b-boots', label: 'Waterproof boots', done: false },
  { id: 'b-sunglasses', label: 'Sunglasses for the snow glare', done: false },
  { id: 'b-lips', label: 'Lip balm and cold cream', done: false },
  { id: 'b-power', label: 'Power bank (the cold drains batteries)', done: false },
  { id: 'b-id', label: 'Govt ID for check-in', done: false },
  { id: 'b-tablets', label: 'Motion-sickness tablets for the hill roads', done: false },
]

/* Budget */

export const PLANNED_SPEND = [
  { id: 'travel', label: 'Travel', detail: 'Volvo both ways, snow-day cab', amount: 25300, color: 'var(--color-primary)' },
  { id: 'stay', label: 'Stay', detail: '4 nights · 2 rooms', amount: 12800, color: 'var(--color-sky)' },
  { id: 'food', label: 'Food', detail: 'Cafés, dhabas, Maggi points', amount: 12000, color: 'var(--color-amber)' },
  { id: 'fun', label: 'Activities', detail: 'Skiing, ropeway, gear rental', amount: 8400, color: 'var(--color-sky-light)' },
  { id: 'buffer', label: 'Buffer', detail: 'Snow delays and tips', amount: 1500, color: 'var(--color-disabled)' },
]

export const PLANNED_TOTAL = PLANNED_SPEND.reduce((sum, c) => sum + c.amount, 0)

/** Mock UPI reference shown after paying the deposit */
export const UPI_REF = '4312 9876 5012'
