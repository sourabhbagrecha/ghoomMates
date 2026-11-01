// The demo trip behind `npm run seed:demo` (backend/docs/demo.md): who is in the squad, the plan, the spends and the
// promises. Data and date maths only, no I/O, so a test can hold it against the heritage crowd model and the makers
// and farm-to-table data it books into.

export const VIBE_AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const;
export type VibeAxis = (typeof VIBE_AXES)[number];
export type Vibe = Record<VibeAxis, number>;

/* Dates: the trip starts today in India (IST), whatever zone this laptop is set to */

const IST_OFFSET_MS = 330 * 60_000;

export const TRIP_DAYS = 4;

/** "2026-11-01" */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Day N (1-based) of a trip that starts on `start` */
export const dateOfDay = (start: string, day: number) => addDays(start, day - 1);

/* The trip */

export const TRIP = {
  name: 'Mewar Mates · Udaipur',
  groupName: 'Mewar Mates',
  destination: 'Udaipur',
  /** A create-flow destination id: picks the cover photo */
  cover: 'udaipur',
  budget: '₹10–20k',
  tweaks: ['More food stops', 'Slower mornings'],
} as const;

/* The squad. The first is the account the seed is run for (the organiser); the others are dev test users created the
   way the sign-in page's quick test accounts are. An account that already exists keeps its name, picture and username,
   and only gets the preferences it has none of. */

export type Mate = {
  email: string;
  /** For a new account; an existing one keeps its own */
  name: string;
  username: string;
  /** How the app stores a member's colour: a design token */
  colour: string;
  diet?: 'jain' | 'vegan';
  vibe: Vibe;
  /** Pledges this mate ticks (ids from src/impact/pledges.ts) */
  pledges: string[];
};

export const DEMO_EMAIL = 'aditi.travels@gmail.com';

export const POOL: Mate[] = [
  {
    email: DEMO_EMAIL, name: 'Aditi Sharma', username: 'aditi_sharma', colour: 'var(--color-amber)',
    vibe: { adventure: 0.4, food: 1, nightlife: 0.45, culture: 0.6, chill: 0.8, shops: 0.95 },
    // Most of hers are left open on purpose: the presenter ticks them live and watches the squad's score move
    pledges: ['refill', 'quiet-hours'],
  },
  {
    email: 'kabir.mehta@gmail.com', name: 'Kabir Mehta', username: 'kabir_mehta', colour: 'var(--color-person-kabir)',
    vibe: { adventure: 0.9, food: 0.7, nightlife: 0.6, culture: 0.45, chill: 0.4, shops: 0.3 },
    pledges: ['refill', 'no-plastic', 'walk-erickshaw'],
  },
  {
    email: 'riya.kapoor@ghoomates.test', name: 'Riya Kapoor', username: 'riya_kapoor', colour: 'var(--color-person-riya)',
    vibe: { adventure: 0.3, food: 0.8, nightlife: 0.3, culture: 0.95, chill: 0.6, shops: 0.7 },
    pledges: ['refill', 'dress-code', 'no-flash', 'buy-direct', 'family-kitchens'],
  },
  {
    email: 'meera.iyer@ghoomates.test', name: 'Meera Iyer', username: 'meera_iyer', colour: 'var(--color-person-meera)', diet: 'jain',
    vibe: { adventure: 0.35, food: 0.6, nightlife: 0.2, culture: 0.85, chill: 0.9, shops: 0.5 },
    pledges: ['refill', 'no-plastic', 'dress-code', 'family-kitchens'],
  },
  {
    email: 'dev.malhotra@ghoomates.test', name: 'Dev Malhotra', username: 'dev_malhotra', colour: 'var(--color-person-dev)', diet: 'vegan',
    vibe: { adventure: 0.8, food: 0.7, nightlife: 0.75, culture: 0.4, chill: 0.5, shops: 0.35 },
    pledges: ['refill', 'walk-erickshaw'],
  },
  {
    email: 'ishaan.verma@ghoomates.test', name: 'Ishaan Verma', username: 'ishaan_verma', colour: 'var(--color-primary)',
    vibe: { adventure: 0.5, food: 1, nightlife: 0.5, culture: 0.7, chill: 0.7, shops: 0.6 },
    pledges: ['refill', 'buy-direct', 'quiet-hours'],
  },
];

export const SQUAD_SIZE = 6;

/** The organiser plus five mates from the pool. An organiser outside the pool leaves the demo account out, so the squad stays six. */
export function squadFor(organiser: { email: string; name: string }): { organiser: Mate; mates: Mate[] } {
  const email = organiser.email.trim().toLowerCase();
  const own = POOL.find(m => m.email === email);
  const others = POOL.filter(m => m.email !== email);
  const base = own ?? {
    email, name: organiser.name, username: '', colour: 'var(--color-sky)',
    vibe: POOL[0].vibe, pledges: ['refill', 'quiet-hours'],
  };
  // The pool is ordered by who is most worth keeping: with an outsider as organiser the demo account is the one left out
  return { organiser: base, mates: (own ? others : others.slice(1)).slice(0, SQUAD_SIZE - 1) };
}

/* The plan: four days, every heritage stop timed against the crowd model (a mix of quiet and packed hours on purpose:
   the quiet ones earn the Green Trip its crowd-hours, the packed ones give the app something to nudge). The maker
   workshop and the farm-to-table dinner are booked through their own services and land on day 2. */

export type PlanStop = { time: string; title: string; tag: string; place: string; notes: string };
export type PlanDay = { title: string; stops: PlanStop[] };

export const PLAN: PlanDay[] = [
  {
    title: 'Hello, City of Lakes',
    stops: [
      {
        time: '12:00 PM', title: 'Check in at a lakeside haveli homestay', tag: 'Stay', place: 'Lal Ghat, old city',
        notes: 'Three rooms booked ahead. Family-run havelis keep the money in the old city; refill bottles at the host’s RO tap.',
      },
      {
        time: '01:30 PM', title: 'Dal baati churma at a family kitchen', tag: 'Food', place: 'Jagdish Chowk',
        notes: 'Around ₹250 a head. Ask for the ghee on the side.',
      },
      {
        time: '04:00 PM', title: 'Bagore ki Haveli rooms by daylight', tag: 'Culture', place: 'Bagore ki Haveli, Gangaur Ghat',
        notes: 'Quiet before the evening show crowd arrives. Tickets at the gate, cash or UPI.',
      },
      {
        time: '05:30 PM', title: 'Sunset boat ride on Lake Pichola', tag: 'Chill', place: 'Lake Pichola, Rameshwar Ghat jetty',
        notes: 'The sunset boats are the busiest of the day. Noon boats are half empty if the squad would rather skip the queue.',
      },
    ],
  },
  {
    title: 'Palaces before the rush',
    stops: [
      {
        time: '09:30 AM', title: 'City Palace museum at opening', tag: 'Culture', place: 'City Palace',
        notes: 'Tour buses land around 11. Book online and be at the gate by 9:20 AM.',
      },
      {
        time: '05:00 PM', title: 'Gulab Bagh garden walk', tag: 'Chill', place: 'Gulab Bagh',
        notes: 'Shady and almost empty on weekday evenings. The rose beds are over a century old; stay on the paths.',
      },
    ],
  },
  {
    title: 'Hidden Udaipur',
    stops: [
      {
        time: '09:00 AM', title: 'Moti Magri and the Maharana Pratap memorial', tag: 'Culture', place: 'Moti Magri',
        notes: 'Ask a gate guide for the Haldighati story; they come from the families who have told it for generations.',
      },
      {
        time: '11:30 AM', title: 'Ahar royal cenotaphs and museum', tag: 'Culture', place: 'Ahar cenotaphs',
        notes: '250 royal chhatris and a 4,000-year-old dig. Almost no one comes here.',
      },
      {
        time: '01:30 PM', title: 'Lunch at a village dhaba', tag: 'Food', place: 'Ahar',
        notes: 'Makki ki roti and lassi from the farms around the city.',
      },
      {
        time: '03:30 PM', title: 'Meet the makers at Shilpgram', tag: 'Shops', place: 'Shilpgram crafts village',
        notes: 'Buy straight from potters and weavers at their huts.',
      },
      {
        time: '05:30 PM', title: 'Sunset at Sajjangarh Monsoon Palace', tag: 'Culture', place: 'Sajjangarh Monsoon Palace',
        notes: 'Popular. Share one cab for the squad: the single hill road jams at sunset.',
      },
    ],
  },
  {
    title: 'Last chai, then home',
    stops: [
      {
        time: '08:00 AM', title: 'Chai on Gangaur Ghat in the early light', tag: 'Chill', place: 'Gangaur Ghat',
        notes: 'Washermen and pigeons, no tour groups yet. Keep plastic out of the lake.',
      },
      {
        time: '10:30 AM', title: 'Pick up a miniature painting at Hathi Pol', tag: 'Shops', place: 'Hathi Pol Bazaar',
        notes: 'Before the evening crowd. Ask who painted it: a print shows a dot pattern, a painting shows brush wobbles.',
      },
      {
        time: '12:00 PM', title: 'Check out', tag: 'Stay', place: '',
        notes: 'Settle up in Ghoomates before you leave!',
      },
      {
        time: '03:00 PM', title: 'Head home', tag: 'Travel', place: '',
        notes: 'Share one cab to the station and leave a buffer for traffic.',
      },
    ],
  },
];

/* Booked through the real services */

export const WORKSHOP = {
  /** Tried in this order: the first with a free slot on day 2 */
  makerIds: ['mahendra-chitera', 'lalit-vyas'],
  day: 2,
  /** Midday keeps clear of the City Palace visit before it and the garden walk after it */
  slots: ['12:30 PM', '11:00 AM', '03:00 PM', '04:00 PM'],
  note: 'Squad of six, first time holding a brush. Please start with the elephant.',
} as const;

export const TABLE = {
  hostId: 'kesar-pol-haveli',
  day: 2,
  meal: 'dinner',
  time: '08:00 PM',
  note: 'The rooftop long table, please. One Jain and one vegan thali.',
} as const;

/* Spends so far: a stay and train tickets paid ahead, then the first day's lunch, tickets and chai. Paid by different
   mates so Settle up has something to say; descriptions say where the money went, which is how the Green Trip decides
   what stayed local. */

export type PlanExpense = {
  description: string;
  rupees: number;
  payer: string;
  category: 'food' | 'stays' | 'travel' | 'fun' | 'other';
  /** Who shares it; everyone when left out */
  among?: string[];
};

const E = {
  aditi: POOL[0].email, kabir: POOL[1].email, riya: POOL[2].email, meera: POOL[3].email, dev: POOL[4].email, ishaan: POOL[5].email,
};

export const EXPENSES: PlanExpense[] = [
  { description: 'Lal Ghat homestay · 3 rooms for 3 nights', rupees: 19_800, payer: E.aditi, category: 'stays' },
  { description: 'Train tickets, Delhi to Udaipur', rupees: 8_400, payer: E.kabir, category: 'travel' },
  { description: 'Two e-rickshaws from Udaipur City station to Lal Ghat', rupees: 500, payer: E.meera, category: 'travel' },
  { description: 'Dal baati churma lunch at a family kitchen, Jagdish Chowk', rupees: 2_340, payer: E.riya, category: 'food' },
  { description: 'Kachori and chai at Bada Bazaar', rupees: 540, payer: E.ishaan, category: 'food' },
  { description: 'Bagore ki Haveli entry tickets', rupees: 720, payer: E.dev, category: 'fun' },
  { description: 'Lake Pichola sunset boat tickets', rupees: 3_000, payer: E.dev, category: 'fun' },
  { description: 'Domino’s pizza on the station platform', rupees: 1_180, payer: E.kabir, category: 'food', among: [E.kabir, E.ishaan, E.dev, E.riya] },
  { description: 'Kulhad chai at Lal Ghat', rupees: 180, payer: E.aditi, category: 'food' },
];

/* Who is going to what: everyone to shared meals and check-ins, most of the squad to the rest */

export type Rsvp = 'going' | 'maybe' | 'skip';

const SHARED_TAGS = new Set(['Stay', 'Food', 'Travel']);

/** Deterministic, so a re-run settles on the same answers. The organiser (mate 0) is always going. */
export function rsvpFor(stop: { tag: string }, stopIndex: number, mateIndex: number): Rsvp {
  if (mateIndex === 0 || SHARED_TAGS.has(stop.tag)) return 'going';
  const roll = (stopIndex * 7 + mateIndex * 13 + stopIndex * mateIndex) % 10;
  return roll < 7 ? 'going' : roll < 9 ? 'maybe' : 'skip';
}

/* Photos: AI-generated pictures of fictional friends (backend/scripts/demo-assets, backend/docs/demo.md), uploaded the way the app does it */

export type PlanPhoto = { file: string; caption: string; by: string; width: number; height: number };

/** Uploaded in this order, so the last one is the newest in the album */
export const PHOTOS: PlanPhoto[] = [
  { file: 'squad-ghat.jpg', caption: 'Golden hour on the ghat, the whole squad', by: E.kabir, width: 900, height: 656 },
  { file: 'haveli-courtyard.jpg', caption: 'Looking up at the painted ceilings of Bagore ki Haveli', by: E.riya, width: 900, height: 656 },
  { file: 'boat-pichola.jpg', caption: 'Sunset boat on Lake Pichola', by: E.dev, width: 900, height: 656 },
  { file: 'thali-rooftop.jpg', caption: 'Dinner with a lake view, first night', by: E.meera, width: 900, height: 656 },
];
