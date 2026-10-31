// The guide experiences GhoomMate can recommend, and pure helpers that rank them against a personality-quiz vibe.
// Agent-side copy of frontend/src/pages/Explore/experiencesData.ts: ids, cities and prices must match it
// (tests/voice/experiences.test.ts checks). Only what the model needs to pitch a trip lives here; the card
// on screen looks up photos and details from the frontend catalogue by id.

export const VIBE_AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const;
export type VibeAxis = (typeof VIBE_AXES)[number];
/** Personality-quiz scores, 0–1 per axis (users.preferences.vibe) */
export type Vibe = Record<VibeAxis, number>;

export const EXPERIENCE_CITIES = ['Udaipur', 'Goa'] as const;
export type ExperienceCity = (typeof EXPERIENCE_CITIES)[number];

export const EXPERIENCE_TAGS = ['Food', 'Culture', 'Workshops', 'Adventure', 'Nature', 'Wellness', 'Nightlife', 'Hidden gems', 'Events'] as const;
export type ExperienceTag = (typeof EXPERIENCE_TAGS)[number];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const EVERY_DAY: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type CatalogueExperience = {
  id: string;
  city: ExperienceCity;
  title: string;
  area: string;
  tags: ExperienceTag[];
  /** How strongly the trip speaks to each vibe axis, 0–1; missing axes don't count */
  vibe: Partial<Vibe>;
  priceRupees: number;
  /** Weekdays it runs */
  days: Weekday[];
  startTime: string;
  groupSize: number;
  duration: string;
  rating: number;
  /** One line GhoomMate can use to sell it */
  pitch: string;
};

export const EXPERIENCES: CatalogueExperience[] = [
  // Goa
  { id: 'dudhsagar-spice-trek', city: 'Goa', title: 'Spice farm + Dudhsagar waterfall trek', area: 'Mollem, South Goa', tags: ['Adventure', 'Hidden gems', 'Food'], vibe: { adventure: 1, food: 0.4, chill: 0.3 }, priceRupees: 1499, days: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], startTime: '07:00 AM', groupSize: 14, duration: '7 hrs', rating: 4.9, pitch: 'Jeep safari through the sanctuary to a giant waterfall, a swim in the plunge pool and a Goan thali' },
  { id: 'fontainhas-heritage-walk', city: 'Goa', title: 'Fontainhas lanes and bakery walk', area: 'Fontainhas, Panaji', tags: ['Culture', 'Hidden gems', 'Food'], vibe: { culture: 1, food: 0.5, chill: 0.4 }, priceRupees: 899, days: EVERY_DAY, startTime: '04:30 PM', groupSize: 10, duration: '2.5 hrs', rating: 4.95, pitch: 'Colourful Portuguese lanes at golden hour with bakery stops for poi and bebinca' },
  { id: 'saligao-fish-curry-class', city: 'Goa', title: 'Cook Goan fish curry in a family kitchen', area: 'Saligao, North Goa', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.5 }, priceRupees: 2199, days: ['Mon', 'Wed', 'Fri', 'Sat'], startTime: '10:30 AM', groupSize: 8, duration: '3.5 hrs', rating: 4.97, pitch: 'Grind recheado masala on a stone and cook fish curry with a Goan aunty, then eat it all' },
  { id: 'mapusa-market-food-trail', city: 'Goa', title: 'Mapusa Friday market food trail', area: 'Mapusa, North Goa', tags: ['Food', 'Events'], vibe: { food: 1, shops: 0.6, culture: 0.3 }, priceRupees: 1199, days: ['Fri'], startTime: '09:00 AM', groupSize: 10, duration: '3 hrs', rating: 4.88, pitch: 'Eat through the Friday market: fresh poee, Goan chorizo, ros omelette and sweets' },
  { id: 'chorao-kayak-birding', city: 'Goa', title: 'Sunrise kayak through the Chorao mangroves', area: 'Chorao island, Mandovi river', tags: ['Adventure', 'Hidden gems'], vibe: { adventure: 0.7, chill: 0.8 }, priceRupees: 1799, days: EVERY_DAY, startTime: '06:15 AM', groupSize: 8, duration: '3 hrs', rating: 4.92, pitch: 'Silent sunrise paddle through a bird sanctuary, kingfishers and maybe a crocodile' },
  { id: 'anjuna-flea-market-crawl', city: 'Goa', title: 'Anjuna Wednesday flea market crawl', area: 'Anjuna, North Goa', tags: ['Events', 'Culture'], vibe: { shops: 1, culture: 0.3, chill: 0.3 }, priceRupees: 799, days: ['Wed'], startTime: '11:00 AM', groupSize: 10, duration: '3 hrs', rating: 4.81, pitch: 'Silver, textiles and vintage with a local who teaches you to bargain, then a shack lunch' },
  { id: 'old-goa-churches-walk', city: 'Goa', title: 'Old Goa churches and stories walk', area: 'Old Goa', tags: ['Culture'], vibe: { culture: 1 }, priceRupees: 999, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], startTime: '08:30 AM', groupSize: 12, duration: '3 hrs', rating: 4.9, pitch: 'UNESCO churches with a historian before the tour buses arrive' },
  { id: 'arambol-sunset-drum-circle', city: 'Goa', title: 'Arambol sunset drum circle and beach jam', area: 'Arambol, North Goa', tags: ['Nightlife', 'Events'], vibe: { nightlife: 0.7, chill: 0.6, culture: 0.3 }, priceRupees: 699, days: EVERY_DAY, startTime: '05:00 PM', groupSize: 20, duration: '3 hrs', rating: 4.86, pitch: 'Learn the djembe and join the beach drum circle as the sun sets, then a fire show' },
  { id: 'sinquerim-dolphin-cruise', city: 'Goa', title: 'Dolphin spotting boat ride + Fort Aguada', area: 'Sinquerim, North Goa', tags: ['Adventure'], vibe: { adventure: 0.6, chill: 0.5 }, priceRupees: 899, days: EVERY_DAY, startTime: '08:00 AM', groupSize: 12, duration: '2.5 hrs', rating: 4.72, pitch: 'Morning boat ride to where the dolphins feed, then the fort and lighthouse view' },
  { id: 'chapora-fort-sunset', city: 'Goa', title: 'Chapora fort sunset hike and photo walk', area: 'Vagator, North Goa', tags: ['Hidden gems', 'Adventure'], vibe: { adventure: 0.6, chill: 0.6, culture: 0.3 }, priceRupees: 599, days: EVERY_DAY, startTime: '04:45 PM', groupSize: 12, duration: '2 hrs', rating: 4.84, pitch: 'Back trail up to Chapora fort for sunset, with a photographer shooting the squad' },
  { id: 'divar-island-cycling', city: 'Goa', title: 'Cycle Divar island by ferry', area: 'Divar island', tags: ['Hidden gems', 'Culture'], vibe: { chill: 0.7, adventure: 0.5, culture: 0.5, food: 0.3 }, priceRupees: 1299, days: ['Tue', 'Thu', 'Sat', 'Sun'], startTime: '07:30 AM', groupSize: 8, duration: '4 hrs', rating: 4.93, pitch: 'Ferry to a sleepy island, cycle past paddy fields and villas, home-cooked lunch' },
  { id: 'palolem-butterfly-island', city: 'Goa', title: 'Canoe to Butterfly beach from Palolem', area: 'Palolem, South Goa', tags: ['Hidden gems', 'Adventure'], vibe: { adventure: 0.8, chill: 0.5, food: 0.3 }, priceRupees: 1099, days: EVERY_DAY, startTime: '08:30 AM', groupSize: 10, duration: '4 hrs', rating: 4.79, pitch: 'Paddle a wooden canoe to a hidden cove, snorkel, then a kingfish thali' },
  { id: 'baga-night-out', city: 'Goa', title: 'Baga night out with a local', area: 'Baga, North Goa', tags: ['Nightlife'], vibe: { nightlife: 1, food: 0.2 }, priceRupees: 1999, days: ['Thu', 'Fri', 'Sat'], startTime: '09:30 PM', groupSize: 12, duration: '4 hrs', rating: 4.68, pitch: 'Live music, a beach party and guest-list club entry, ending at the 3 AM bun-omelette stall' },
  { id: 'cashew-feni-distillery', city: 'Goa', title: 'Cashew feni distillery visit', area: 'Bicholim, North Goa', tags: ['Food', 'Culture', 'Hidden gems'], vibe: { food: 0.8, culture: 0.6, nightlife: 0.3 }, priceRupees: 1599, days: ['Tue', 'Thu', 'Sat'], startTime: '10:00 AM', groupSize: 10, duration: '3 hrs', rating: 4.91, pitch: 'See feni made in a copper pot over a wood fire, then a tasting and lunch' },
  // Udaipur
  { id: 'pichola-sunset-boat', city: 'Udaipur', title: 'Lake Pichola sunset boat ride + Jag Mandir', area: 'Lal Ghat, Udaipur', tags: ['Culture', 'Hidden gems'], vibe: { chill: 0.9, culture: 0.6 }, priceRupees: 1299, days: EVERY_DAY, startTime: '04:45 PM', groupSize: 10, duration: '2 hrs', rating: 4.94, pitch: 'Private wooden boat past the Lake Palace to Jag Mandir island as the lake turns gold' },
  { id: 'udaipur-old-city-food-walk', city: 'Udaipur', title: 'Old city kachori and chaat walk', area: 'Jagdish Chowk, Udaipur', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.4, shops: 0.4 }, priceRupees: 999, days: EVERY_DAY, startTime: '05:30 PM', groupSize: 10, duration: '3 hrs', rating: 4.89, pitch: 'Hot kachori, mirchi vada, kulhad lassi and jalebi through the old-city bazaars' },
  { id: 'haveli-rajasthani-cooking', city: 'Udaipur', title: 'Dal baati churma cooking class in a haveli', area: 'Gangaur Ghat, Udaipur', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.6 }, priceRupees: 1899, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], startTime: '11:00 AM', groupSize: 8, duration: '3.5 hrs', rating: 4.98, pitch: 'Cook dal baati churma in a lakeside haveli and eat the thali on the rooftop' },
  { id: 'mewar-miniature-painting', city: 'Udaipur', title: 'Mewar miniature painting workshop', area: 'Hathi Pol, Udaipur', tags: ['Culture', 'Hidden gems'], vibe: { culture: 1, chill: 0.5, shops: 0.2 }, priceRupees: 1499, days: EVERY_DAY, startTime: '10:00 AM', groupSize: 6, duration: '3 hrs', rating: 4.93, pitch: 'Paint your own Mewar miniature with stone colours in a master painter’s studio' },
  { id: 'sajjangarh-sunset-cycle', city: 'Udaipur', title: 'Cycle to Sajjangarh Monsoon Palace for sunset', area: 'Fateh Sagar, Udaipur', tags: ['Adventure', 'Hidden gems'], vibe: { adventure: 0.8, chill: 0.4 }, priceRupees: 1199, days: EVERY_DAY, startTime: '03:30 PM', groupSize: 10, duration: '3.5 hrs', rating: 4.85, pitch: 'Ride along Fateh Sagar into the Aravallis for sunset over five lakes from the Monsoon Palace' },
  { id: 'bagore-dharohar-folk-evening', city: 'Udaipur', title: 'Dharohar folk dance evening at Bagore ki Haveli', area: 'Gangaur Ghat, Udaipur', tags: ['Events', 'Nightlife', 'Culture'], vibe: { culture: 0.8, nightlife: 0.6 }, priceRupees: 799, days: EVERY_DAY, startTime: '06:00 PM', groupSize: 15, duration: '2.5 hrs', rating: 4.82, pitch: 'Front-row seats for ghoomar and the nine-pot bhavai dance in an 18th-century haveli' },
  { id: 'molela-pottery-workshop', city: 'Udaipur', title: 'Pottery wheel and Molela terracotta workshop', area: 'Fateh Sagar, Udaipur', tags: ['Workshops', 'Culture'], vibe: { culture: 0.9, chill: 0.6, shops: 0.3 }, priceRupees: 1599, days: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], startTime: '10:30 AM', groupSize: 8, duration: '3 hrs', rating: 4.96, pitch: 'Throw your own kulhad on the kick wheel and carve a Molela terracotta plaque with a master potter' },
  { id: 'block-print-bandhani', city: 'Udaipur', title: 'Block printing and bandhani tie-dye workshop', area: 'Hathi Pol, Udaipur', tags: ['Workshops', 'Culture', 'Hidden gems'], vibe: { culture: 0.9, shops: 0.6, chill: 0.4 }, priceRupees: 1399, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], startTime: '03:00 PM', groupSize: 8, duration: '2.5 hrs', rating: 4.91, pitch: 'Print a stole with hand-carved teak blocks and tie-dye your own bandhani scarf to take home' },
  { id: 'city-palace-royal-walk', city: 'Udaipur', title: 'City Palace royal stories walk', area: 'City Palace, Udaipur', tags: ['Culture'], vibe: { culture: 1 }, priceRupees: 1099, days: EVERY_DAY, startTime: '09:30 AM', groupSize: 12, duration: '2.5 hrs', rating: 4.88, pitch: 'Beat the crowds into Rajasthan’s biggest palace with a guide whose family served the Maharanas' },
  { id: 'kumbhalgarh-ranakpur-day-trip', city: 'Udaipur', title: 'Kumbhalgarh fort and Ranakpur temple day trip', area: 'Pickup from Udaipur', tags: ['Adventure', 'Culture', 'Hidden gems'], vibe: { adventure: 0.8, culture: 0.8 }, priceRupees: 2999, days: ['Wed', 'Fri', 'Sun'], startTime: '07:30 AM', groupSize: 7, duration: '11 hrs', rating: 4.92, pitch: 'Walk the world’s second-longest wall at Kumbhalgarh, then the marble Ranakpur temple with 1,444 carved pillars' },
  { id: 'menar-bird-village', city: 'Udaipur', title: 'Sunrise birding at Menar, the bird village', area: 'Menar, 45 km from Udaipur', tags: ['Nature', 'Hidden gems'], vibe: { chill: 0.8, adventure: 0.5, culture: 0.3 }, priceRupees: 1799, days: ['Tue', 'Thu', 'Sat', 'Sun'], startTime: '05:45 AM', groupSize: 8, duration: '5 hrs', rating: 4.87, pitch: 'Watch flamingos and pelicans wake up at a village that protects its lakes, then a farmhouse breakfast' },
  { id: 'aravalli-horse-safari', city: 'Udaipur', title: 'Marwari horse safari through Aravalli villages', area: 'Aravalli foothills, Udaipur', tags: ['Adventure', 'Nature'], vibe: { adventure: 1, chill: 0.4 }, priceRupees: 2499, days: ['Mon', 'Wed', 'Fri', 'Sat', 'Sun'], startTime: '03:30 PM', groupSize: 6, duration: '3 hrs', rating: 4.95, pitch: 'Ride curled-ear Marwari horses through mustard fields and shepherd villages to a sunset chai ridge' },
  { id: 'fateh-sagar-sunrise-yoga', city: 'Udaipur', title: 'Sunrise yoga and sound bath above Fateh Sagar', area: 'Neemach Mata hill, Udaipur', tags: ['Wellness', 'Nature'], vibe: { chill: 1 }, priceRupees: 699, days: EVERY_DAY, startTime: '06:15 AM', groupSize: 12, duration: '1.5 hrs', rating: 4.9, pitch: 'Hatha flow and a singing-bowl sound bath on a hilltop as the sun rises over Fateh Sagar' },
  { id: 'badi-lake-kayak', city: 'Udaipur', title: 'Kayak and lakeside picnic at Badi lake', area: 'Badi lake, Udaipur', tags: ['Adventure', 'Nature', 'Hidden gems'], vibe: { adventure: 0.7, chill: 0.7, food: 0.3 }, priceRupees: 1499, days: ['Fri', 'Sat', 'Sun'], startTime: '07:00 AM', groupSize: 10, duration: '3 hrs', rating: 4.84, pitch: 'Paddle glassy Badi lake past kingfishers, then a picnic breakfast with the view from Bahubali point' },
  { id: 'ambrai-rooftop-folk-dinner', city: 'Udaipur', title: 'Lakeside rooftop dinner with live folk music', area: 'Ambrai Ghat, Udaipur', tags: ['Nightlife', 'Food'], vibe: { food: 0.9, nightlife: 0.7, chill: 0.4 }, priceRupees: 1999, days: EVERY_DAY, startTime: '07:30 PM', groupSize: 12, duration: '2.5 hrs', rating: 4.86, pitch: 'A royal Mewari thali on a rooftop facing the lit-up City Palace, with langa musicians playing' },
  { id: 'lake-city-night-photo-walk', city: 'Udaipur', title: 'Lake city lights night photo walk', area: 'Gangaur Ghat, Udaipur', tags: ['Nightlife', 'Hidden gems'], vibe: { nightlife: 0.6, culture: 0.5, adventure: 0.3 }, priceRupees: 899, days: ['Tue', 'Thu', 'Sat'], startTime: '07:00 PM', groupSize: 8, duration: '2 hrs', rating: 4.83, pitch: 'Hidden rooftops and ghats with the best views of the glowing palaces, and night-shot tips for your phone' },
  { id: 'shilpgram-turban-tying', city: 'Udaipur', title: 'Shilpgram craft village and turban tying', area: 'Shilpgram, Udaipur', tags: ['Culture', 'Workshops', 'Events'], vibe: { culture: 0.9, shops: 0.5, nightlife: 0.3 }, priceRupees: 999, days: ['Wed', 'Sat', 'Sun'], startTime: '04:00 PM', groupSize: 12, duration: '3 hrs', rating: 4.8, pitch: 'Meet village craftspeople at work, catch the evening folk show and get a proper Mewari safa tied' },
];


// ---- Time. Experiences run on IST wall-clock times; India has no daylight saving, so a fixed offset is exact. ----

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

/** A calendar day in IST */
export type IstDay = { year: number; month: number; day: number; weekday: Weekday };

const dayOf = (utc: Date): IstDay => ({ year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate(), weekday: WEEKDAYS[utc.getUTCDay()] });

/** The IST day and minutes after midnight at `now` */
export function istClock(now: Date) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { today: dayOf(ist), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

export const addDays = (day: IstDay, offset: number) => dayOf(new Date(Date.UTC(day.year, day.month - 1, day.day + offset)));
const dayNumberOf = (day: IstDay) => Date.UTC(day.year, day.month - 1, day.day) / 86_400_000;
export const daysBetween = (from: IstDay, to: IstDay) => dayNumberOf(to) - dayNumberOf(from);

/** "2026-11-04" → IstDay; null if malformed */
export function parseIsoDay(value: string | null | undefined): IstDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? dayOf(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))) : null;
}

/** "Today", "Tomorrow" or "Wed, 4 Nov" */
export function dayLabel(day: IstDay, today: IstDay) {
  const offset = daysBetween(today, day);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return `${day.weekday}, ${day.day} ${MONTHS[day.month - 1]}`;
}

/** "05:30 PM" → minutes after midnight */
export function minutesOf(time: string) {
  const match = TIME.exec(time.trim());
  return match ? ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]) : 0;
}

/** Minutes after midnight → "05:30 PM" */
export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "3.5 hrs" → 210 */
export const durationMinutes = (duration: string) => Math.round(Number(/([\d.]+)\s*hr/.exec(duration)?.[1] ?? 2) * 60);

/** Too close to the start to make it there */
const LEAD_MINUTES = 30;

export type Run = { day: IstDay; minutes: number };

/** Its start on `day`, if it runs that day and (today) hasn't started yet */
export function runOn(experience: CatalogueExperience, day: IstDay, now: Date): Run | null {
  const { today, minutes } = istClock(now);
  const start = minutesOf(experience.startTime);
  if (!experience.days.includes(day.weekday)) return null;
  if (daysBetween(today, day) < 0 || (daysBetween(today, day) === 0 && start < minutes + LEAD_MINUTES)) return null;
  return { day, minutes: start };
}

/** The next start within a week */
export function nextRun(experience: CatalogueExperience, now: Date): Run | null {
  const { today } = istClock(now);
  for (let offset = 0; offset < 8; offset++) {
    const run = runOn(experience, addDays(today, offset), now);
    if (run) return run;
  }
  return null;
}

export const WHEN = ['today', 'tonight', 'tomorrow', 'this_week'] as const;
export type When = (typeof WHEN)[number];
const EVENING = 17 * 60;

function runFor(experience: CatalogueExperience, when: When, now: Date): Run | null {
  const { today } = istClock(now);
  if (when === 'this_week') return nextRun(experience, now);
  const run = runOn(experience, when === 'tomorrow' ? addDays(today, 1) : today, now);
  return run && (when !== 'tonight' || run.minutes >= EVENING) ? run : null;
}

// ---- Personality ----

/** The seeded city a trip destination like "Udaipur, Rajasthan" belongs to, or null */
export const cityForDestination = (destination: string | null | undefined): ExperienceCity | null =>
  EXPERIENCE_CITIES.find(city => destination?.toLowerCase().includes(city.toLowerCase())) ?? null;

/** A complete quiz result, or null for missing / partial scores */
export function asVibe(value: unknown): Vibe | null {
  if (!value || typeof value !== 'object') return null;
  const scores = value as Record<string, unknown>;
  if (!VIBE_AXES.every(axis => typeof scores[axis] === 'number' && Number.isFinite(scores[axis]))) return null;
  return Object.fromEntries(VIBE_AXES.map(axis => [axis, Math.min(1, Math.max(0, scores[axis] as number))])) as Vibe;
}

/** Average of everyone who took the quiz; null when nobody has */
export function blendVibes(list: unknown[]): Vibe | null {
  const vibes = list.map(asVibe).filter((v): v is Vibe => v !== null);
  if (!vibes.length) return null;
  return Object.fromEntries(VIBE_AXES.map(axis => [axis, vibes.reduce((sum, v) => sum + v[axis], 0) / vibes.length])) as Vibe;
}

/** What they just said they're in the mood for, on top of their quiz (or a neutral middle without one) */
export function moodVibe(base: Vibe | null, likes: VibeAxis[], avoid: VibeAxis[] = []): Vibe {
  const vibe = base ? { ...base } : (Object.fromEntries(VIBE_AXES.map(axis => [axis, 0.35])) as Vibe);
  for (const axis of likes) vibe[axis] = Math.max(vibe[axis], 0.95);
  for (const axis of avoid) vibe[axis] = Math.min(vibe[axis], 0.05);
  return vibe;
}

/** The person's strongest axes, strongest first */
export const topAxes = (vibe: Vibe, count = 2): VibeAxis[] => [...VIBE_AXES].sort((a, b) => vibe[b] - vibe[a]).slice(0, count);

/** The axis an experience is mostly about, used to keep picks varied */
export const mainAxis = (experience: CatalogueExperience) =>
  VIBE_AXES.reduce((best, axis) => ((experience.vibe[axis] ?? 0) > (experience.vibe[best] ?? 0) ? axis : best));

/** Weighted mean of the person's scores over the axes the trip speaks to, and the axes they share */
export function fit(experience: CatalogueExperience, vibe: Vibe) {
  const axes = VIBE_AXES.filter(axis => (experience.vibe[axis] ?? 0) > 0);
  const weight = axes.reduce((sum, axis) => sum + experience.vibe[axis]!, 0);
  const score = axes.reduce((sum, axis) => sum + experience.vibe[axis]! * vibe[axis], 0) / weight;
  const because = axes
    .filter(axis => experience.vibe[axis]! >= 0.5 && vibe[axis] >= 0.5)
    .sort((a, b) => experience.vibe[b]! * vibe[b] - experience.vibe[a]! * vibe[a]);
  return { match: Math.round(score * 100), because };
}

// ---- Ranking ----

export type MemberVibe = { memberId: string; name: string; vibe: Vibe };

export type RankedExperience = {
  experience: CatalogueExperience;
  /** 0–100, how well the trip fits the vibe; null when ranked by rating only */
  match: number | null;
  /** Vibe axes this trip and the person both score high on, strongest first */
  because: VibeAxis[];
  run: Run;
  /** How well it fits each member who took the quiz */
  fits: { memberId: string; name: string; match: number }[];
  /** Sort key: the match (or rating), nudged toward small groups for solo travellers */
  score: number;
};

export type RankOptions = {
  city: ExperienceCity;
  now: Date;
  tag?: ExperienceTag;
  when?: When;
  solo?: boolean;
  /** Experience ids to leave out, e.g. ones already joined */
  exclude?: string[];
  members?: MemberVibe[];
};

const SOLO_BONUS = 4;

function ranked(experience: CatalogueExperience, run: Run, vibe: Vibe | null, opts: Pick<RankOptions, 'solo' | 'members'>): RankedExperience {
  const { match, because } = vibe ? fit(experience, vibe) : { match: null, because: [] };
  const base = match ?? experience.rating * 20;
  return {
    experience,
    match,
    because,
    run,
    fits: (opts.members ?? []).map(m => ({ memberId: m.memberId, name: m.name, match: fit(experience, m.vibe).match })),
    score: base + (opts.solo && experience.groupSize <= 10 ? SOLO_BONUS : 0),
  };
}

const byScore = (a: RankedExperience, b: RankedExperience) => b.score - a.score || b.experience.rating - a.experience.rating;

/** Every bookable trip for the city (and tag / time), best fit first. Without a vibe they're ordered by rating. */
export function rankExperiences(vibe: Vibe | null, opts: RankOptions): RankedExperience[] {
  return EXPERIENCES
    .filter(e => e.city === opts.city && (!opts.tag || e.tags.includes(opts.tag)) && !opts.exclude?.includes(e.id))
    .flatMap(experience => {
      const run = runFor(experience, opts.when ?? 'this_week', opts.now);
      return run ? [ranked(experience, run, vibe, opts)] : [];
    })
    .sort(byScore);
}

/** Each pick that shares an earlier pick's main vibe costs this much, so three food trips don't crowd out the rest */
const REPEAT_PENALTY = 8;

/** The best `count`, varied: greedily takes the highest score after the repeat penalty */
export function pickVaried(list: RankedExperience[], count: number): RankedExperience[] {
  const pool = [...list];
  const picked: RankedExperience[] = [];
  while (picked.length < count && pool.length) {
    const adjusted = (r: RankedExperience) => r.score - REPEAT_PENALTY * picked.filter(p => mainAxis(p.experience) === mainAxis(r.experience)).length;
    const best = pool.reduce((bi, r, i) => (adjusted(r) > adjusted(pool[bi]) ? i : bi), 0);
    picked.push(pool.splice(best, 1)[0]);
  }
  return picked;
}

// ---- A day plan ----

/** Time to get from one experience to the next */
const TRAVEL_MINUTES = 45;
const MAX_STOPS = 3;

export type PlannedStop = RankedExperience & { start: number; end: number };

/** A stop has to score above this to be worth adding to a day */
const STOP_FLOOR = 40;

/**
 * The best set of up to three experiences on one day: no overlaps (with time to travel between them), each worth
 * going to, and varied. Picks the combination with the most value, so one long favourite doesn't crowd out a
 * fuller day. Returned in time order.
 */
export function planDay(vibe: Vibe | null, opts: Omit<RankOptions, 'tag' | 'when'> & { day: IstDay }): PlannedStop[] {
  const candidates: PlannedStop[] = EXPERIENCES
    .filter(e => e.city === opts.city && !opts.exclude?.includes(e.id))
    .flatMap(experience => {
      const run = runOn(experience, opts.day, opts.now);
      return run ? [{ ...ranked(experience, run, vibe, opts), start: run.minutes, end: run.minutes + durationMinutes(experience.duration) }] : [];
    })
    .sort(byScore);

  const clash = (a: PlannedStop, b: PlannedStop) => a.start < b.end + TRAVEL_MINUTES && b.start < a.end + TRAVEL_MINUTES;
  const value = (set: PlannedStop[]) => {
    const axes = set.map(s => mainAxis(s.experience));
    return set.reduce((sum, s) => sum + s.score - STOP_FLOOR, 0) - REPEAT_PENALTY * (axes.length - new Set(axes).size);
  };

  // Catalogues are small (a dozen trips a day at most), so trying every combination of up to three is cheap
  let best: PlannedStop[] = candidates.slice(0, 1);
  const grow = (set: PlannedStop[], from: number) => {
    if (set.length && value(set) > value(best)) best = set;
    if (set.length === MAX_STOPS) return;
    for (let i = from; i < candidates.length; i++) {
      if (!set.some(s => clash(s, candidates[i]))) grow([...set, candidates[i]], i + 1);
    }
  };
  grow([], 0);
  return [...best].sort((a, b) => a.start - b.start);
}
