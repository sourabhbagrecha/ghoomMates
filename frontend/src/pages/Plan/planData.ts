import iconBed from '../../assets/figma/icon-bed-primary.svg'
import iconBus from '../../assets/figma/icon-bus-primary.svg'
import iconCar from '../../assets/figma/icon-car-primary.svg'
import iconTicket from '../../assets/figma/icon-ticket-primary.svg'
import type { PersonId } from '../../data/people'
import { daysUntil } from '../../data/tripDates'
import { UPCOMING_TRIPS } from '../../data/trips'
import { EXPERIENCE_PHOTOS } from '../Explore/experiencePhotos'

// Mock data until the planning service exists: the Mewar Mates planning a heritage weekend in Udaipur. The places are
// real; the stays, hosts, prices and booking codes are made up for the demo, and prices are estimates.
export const TRIP = UPCOMING_TRIPS[0]

const startsIn = daysUntil(TRIP.startDate ?? null)

export const PLAN = {
  eyebrow: `${startsIn === null ? 'Planning' : startsIn <= 0 ? 'Starts today' : startsIn === 1 ? 'Starts tomorrow' : `Starts in ${startsIn} days`} · Planning`,
  nights: 3,
  depositPerPerson: 4000,
  depositDue: 'Fri 6 Nov',
}

/** ₹ with Indian digit grouping: 150000 → ₹1,50,000 */
export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

/* Votes */

export type VoteId = 'stay' | 'sunset'

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
    question: 'Which haveli should we stay in?',
    startedBy: 'meera',
    started: 'Yesterday',
    closes: 'Wed 4 Nov',
    options: [
      {
        id: 'chandpol-kothi',
        name: 'Kothi at Chandpol',
        details: 'Chandpol · Family haveli, lake-view rooftop',
        price: '≈ ₹3,400/night',
        photo: EXPERIENCE_PHOTOS.ambraiDinner[2].src,
        votes: ['riya'],
      },
      {
        id: 'jharokha-haveli',
        name: 'Jharokha Haveli',
        details: 'Lal Ghat · Solar water, refill tap, no plastic bottles',
        price: '≈ ₹3,000/night',
        photo: EXPERIENCE_PHOTOS.dharohar[4].src,
        votes: ['meera'],
      },
      {
        id: 'ahar-farmstay',
        name: 'Ahar Farm Homestay',
        details: 'Ahar · Farm breakfast, 10 min by cycle',
        price: '≈ ₹2,400/night',
        photo: EXPERIENCE_PHOTOS.horseSafari[1].src,
        votes: ['dev'],
      },
    ],
  },
  sunset: {
    id: 'sunset',
    title: 'Sunset plan',
    question: 'Sunset: Ambrai Ghat or Sajjangarh?',
    startedBy: 'riya',
    started: 'Thu',
    closes: 'Wed 4 Nov',
    options: [
      {
        id: 'ambrai',
        name: 'Ambrai Ghat',
        details: 'City Palace lit up across Pichola · walk over Chandpol bridge',
        price: 'Free · rooftop thali ≈ ₹450',
        photo: EXPERIENCE_PHOTOS.sajjangarh[3].src,
        votes: ['riya', 'dev'],
      },
      {
        id: 'sajjangarh',
        name: 'Sajjangarh Monsoon Palace',
        details: 'The whole valley at golden hour · share one cab, the hill road jams',
        price: '≈ ₹250 each with the cab',
        photo: EXPERIENCE_PHOTOS.sajjangarh[0].src,
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

// Heritage sites sit in their quiet windows (see backend/src/heritage): palaces at opening, boats at noon, temples at aarti
export const PLAN_DAYS: PlanDay[] = [
  {
    id: 'd1',
    label: 'D1',
    date: 'Fri 20 Nov',
    title: 'Arrive and unwind',
    stops: [
      { id: 'arrive', time: '08:30 AM', title: 'Coach rolls into Udaipur', status: 'locked' },
      { id: 'check-in', time: '11:00 AM', title: 'Check in', status: 'vote', voteId: 'stay', decidedTitle: 'Check in at {winner}' },
      { id: 'dal-baati', time: '01:30 PM', title: 'Dal baati churma at a family kitchen', status: 'keen', keen: ['you', 'riya', 'meera'] },
      { id: 'gulab-bagh', time: '04:30 PM', title: 'Gulab Bagh garden walk', status: 'keen', keen: ['you', 'meera', 'dev'] },
    ],
  },
  {
    id: 'd2',
    label: 'D2',
    date: 'Sat 21 Nov',
    title: 'Palaces before the rush',
    stops: [
      { id: 'city-palace', time: '09:30 AM', title: 'City Palace at opening, before the tour buses', status: 'locked' },
      { id: 'pichola-boat', time: '12:00 PM', title: 'Pichola boat from Rameshwar Ghat, half-empty at noon', status: 'locked' },
      { id: 'sunset', time: '05:30 PM', title: 'Sunset: Ambrai Ghat or Sajjangarh?', status: 'vote', voteId: 'sunset', decidedTitle: 'Sunset at {winner}' },
      { id: 'dharohar', time: '07:30 PM', title: 'Folk dance at Bagore ki Haveli', status: 'keen', keen: ['riya', 'meera', 'dev'] },
    ],
  },
  {
    id: 'd3',
    label: 'D3',
    date: 'Sun 22 Nov',
    title: 'Makers and hidden gems',
    stops: [
      { id: 'ahar', time: '09:00 AM', title: 'Ahar royal cenotaphs, almost no crowds', status: 'keen', keen: ['you', 'riya', 'meera', 'dev'] },
      { id: 'shilpgram', time: '11:30 AM', title: 'Meet the makers at Shilpgram', status: 'keen', keen: ['you', 'meera'] },
      { id: 'farm-lunch', time: '01:30 PM', title: 'Farm-kitchen lunch near Ahar', status: 'keen', keen: ['you', 'riya', 'dev'] },
      { id: 'badi-lake', time: '04:30 PM', title: 'Badi Lake at golden hour', status: 'keen', keen: ['you', 'riya', 'meera', 'dev'] },
    ],
  },
  {
    id: 'd4',
    label: 'D4',
    date: 'Mon 23 Nov',
    title: 'Last chai, then home',
    stops: [
      { id: 'jagdish', time: '07:30 AM', title: 'Jagdish Temple morning aarti', status: 'keen', keen: ['riya', 'meera'] },
      { id: 'miniatures', time: '10:30 AM', title: 'Miniature paintings in Hathi Pol, bought from the painter', status: 'keen', keen: ['you', 'dev'] },
      { id: 'check-out', time: '12:00 PM', title: 'Check out, refill bottles at the tap', status: 'locked' },
      { id: 'bus-home', time: '07:30 PM', title: 'Coach back to Delhi', status: 'locked' },
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
    title: 'Delhi → Udaipur',
    details: 'Overnight AC sleeper coach · Berths 5–8',
    when: 'Thu 19 Nov, 08:30 PM → Fri 20 Nov, 08:30 AM',
    summary: 'Thu 19 Nov · Overnight coach',
    status: 'booked',
    code: '5528 1904',
    paidBy: 'dev',
    share: 1200,
    settled: ['dev', 'riya', 'meera'],
  },
  {
    id: 'bus-back',
    kind: 'bus',
    title: 'Udaipur → Delhi',
    details: 'Overnight AC sleeper coach · Berths 9–12',
    when: 'Mon 23 Nov, 07:30 PM → Tue 24 Nov, 07:30 AM',
    summary: 'Mon 23 Nov · Overnight coach',
    status: 'booked',
    code: '5528 2216',
    paidBy: 'riya',
    share: 1200,
    settled: ['riya', 'you', 'meera'],
  },
  {
    id: 'boat',
    kind: 'activity',
    title: 'Lake Pichola boat ride',
    details: 'Private electric boat from Rameshwar Ghat · noon slot',
    when: 'Sat 21 Nov, 12:00 PM',
    summary: 'Sat 21 Nov · Noon boat',
    status: 'booked',
    code: 'PCH-2111',
    paidBy: 'meera',
    share: 600,
    settled: ['meera', 'riya'],
  },
  {
    id: 'cab',
    kind: 'cab',
    title: 'Local cab',
    details: 'One shared cab · Shilpgram, Ahar and the Sajjangarh road',
    when: 'Sat 21 – Sun 22 Nov',
    summary: 'Dev’s getting quotes',
    status: 'to-book',
    owner: 'dev',
    note: 'Quotes from ₹3,000/day',
  },
]

/** Already-uploaded tickets, by booking id */
export const INITIAL_TICKETS: Record<string, string> = {
  'bus-there': 'delhi-udaipur-coach.pdf',
}

/** Riya places a refundable hold on whichever stay wins the vote */
export const STAY_HOLD = {
  heldBy: 'riya' as PersonId,
  code: 'HVL-48213',
  dates: 'Fri 20 – Mon 23 Nov · 3 nights',
  rooms: '2 rooms · 4 guests',
  cancellation: 'Free cancellation till Fri 13 Nov',
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
  { id: 'g-coach', label: 'Book the overnight coach both ways', assignee: 'dev', done: true },
  { id: 'g-playlist', label: 'Make the road-trip playlist: Mewari folk and Coke Studio', assignee: 'riya', done: true },
  { id: 'g-stay', label: 'Hold the haveli once the vote closes', assignee: 'riya', done: false },
  { id: 'g-deposits', label: 'Collect everyone’s deposit', assignee: 'meera', done: false },
  { id: 'g-cab', label: 'Get cab quotes for the Shilpgram and Ahar run', assignee: 'dev', done: false },
  { id: 'g-refill', label: 'Check the haveli has a refill tap, so we skip plastic bottles', assignee: 'you', done: false },
  { id: 'g-sunset', label: 'Check Sajjangarh’s last entry time for sunset', assignee: 'you', done: false },
  { id: 'g-dress', label: 'Agree on temple outfits: shoulders and knees covered', assignee: 'meera', done: false },
]

export const BAG_ITEMS: ChecklistItem[] = [
  { id: 'b-bottle', label: 'Refillable water bottle (top up at the haveli’s tap)', done: true },
  { id: 'b-tote', label: 'Cotton tote for market buys, no plastic bags', done: true },
  { id: 'b-temple', label: 'Temple outfit: shoulders and knees covered', done: true },
  { id: 'b-shawl', label: 'Light shawl or jacket for chilly November nights', done: false },
  { id: 'b-sandals', label: 'Sandals that slip off easily at temples', done: false },
  { id: 'b-sun', label: 'Sunscreen and a cap for the ghats', done: false },
  { id: 'b-power', label: 'Power bank for sunset photos and maps', done: false },
  { id: 'b-id', label: 'Govt ID for check-in', done: false },
  { id: 'b-notes', label: 'Small notes for makers and chai stalls', done: false },
]

/* Budget */

export const PLANNED_SPEND = [
  { id: 'travel', label: 'Travel', detail: 'Coach both ways, shared cab', amount: 15600, color: 'var(--color-primary)' },
  { id: 'stay', label: 'Stay', detail: '3 nights · 2 haveli rooms', amount: 18000, color: 'var(--color-sky)' },
  { id: 'food', label: 'Food', detail: 'Family kitchens, kachori, rooftop thalis', amount: 14400, color: 'var(--color-amber)' },
  { id: 'fun', label: 'Activities', detail: 'City Palace, Pichola boat, Shilpgram', amount: 5200, color: 'var(--color-sky-light)' },
  { id: 'makers', label: 'Makers and tips', detail: 'Miniatures, pottery, puppeteers', amount: 2800, color: 'var(--color-disabled)' },
]

export const PLANNED_TOTAL = PLANNED_SPEND.reduce((sum, c) => sum + c.amount, 0)

/** Mock UPI reference shown after paying the deposit */
export const UPI_REF = '4312 9876 5012'
