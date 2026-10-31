// The guide experiences GhoomMate can recommend, and pure helpers that rank them against a personality-quiz vibe.
// Agent-side copy of frontend/src/pages/Explore/experiencesData.ts: ids, cities and prices must match it
// (tests/voice/experiences.test.ts checks). Only what the model needs to pitch a trip lives here; the card
// on screen looks up photos and details from the frontend catalogue by id.

export const VIBE_AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const;
export type VibeAxis = (typeof VIBE_AXES)[number];
/** Personality-quiz scores, 0–1 per axis (users.preferences.vibe) */
export type Vibe = Record<VibeAxis, number>;

export const EXPERIENCE_CITIES = ['Goa', 'Udaipur'] as const;
export type ExperienceCity = (typeof EXPERIENCE_CITIES)[number];

export const EXPERIENCE_TAGS = ['Food', 'Nightlife', 'Hidden gems', 'Culture', 'Adventure', 'Events'] as const;
export type ExperienceTag = (typeof EXPERIENCE_TAGS)[number];

export type CatalogueExperience = {
  id: string;
  city: ExperienceCity;
  title: string;
  area: string;
  tags: ExperienceTag[];
  /** How strongly the trip speaks to each vibe axis, 0–1; missing axes don't count */
  vibe: Partial<Vibe>;
  priceRupees: number;
  date: string;
  startTime: string;
  duration: string;
  rating: number;
  /** One line GhoomMate can use to sell it */
  pitch: string;
};

export const EXPERIENCES: CatalogueExperience[] = [
  // Goa
  { id: 'dudhsagar-spice-trek', city: 'Goa', title: 'Spice farm + Dudhsagar waterfall trek', area: 'Mollem, South Goa', tags: ['Adventure', 'Hidden gems', 'Food'], vibe: { adventure: 1, food: 0.4, chill: 0.3 }, priceRupees: 1499, date: 'Sun, 1 Nov', startTime: '07:00 AM', duration: '7 hrs', rating: 4.9, pitch: 'Jeep safari through the sanctuary to a giant waterfall, a swim in the plunge pool and a Goan thali' },
  { id: 'fontainhas-heritage-walk', city: 'Goa', title: 'Fontainhas lanes and bakery walk', area: 'Fontainhas, Panaji', tags: ['Culture', 'Hidden gems', 'Food'], vibe: { culture: 1, food: 0.5, chill: 0.4 }, priceRupees: 899, date: 'Sun, 1 Nov', startTime: '04:30 PM', duration: '2.5 hrs', rating: 4.95, pitch: 'Colourful Portuguese lanes at golden hour with bakery stops for poi and bebinca' },
  { id: 'saligao-fish-curry-class', city: 'Goa', title: 'Cook Goan fish curry in a family kitchen', area: 'Saligao, North Goa', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.5 }, priceRupees: 2199, date: 'Mon, 2 Nov', startTime: '10:30 AM', duration: '3.5 hrs', rating: 4.97, pitch: 'Grind recheado masala on a stone and cook fish curry with a Goan aunty, then eat it all' },
  { id: 'mapusa-market-food-trail', city: 'Goa', title: 'Mapusa Friday market food trail', area: 'Mapusa, North Goa', tags: ['Food', 'Events'], vibe: { food: 1, shops: 0.6, culture: 0.3 }, priceRupees: 1199, date: 'Fri, 6 Nov', startTime: '09:00 AM', duration: '3 hrs', rating: 4.88, pitch: 'Eat through the Friday market: fresh poee, Goan chorizo, ros omelette and sweets' },
  { id: 'chorao-kayak-birding', city: 'Goa', title: 'Sunrise kayak through the Chorao mangroves', area: 'Chorao island, Mandovi river', tags: ['Adventure', 'Hidden gems'], vibe: { adventure: 0.7, chill: 0.8 }, priceRupees: 1799, date: 'Tue, 3 Nov', startTime: '06:15 AM', duration: '3 hrs', rating: 4.92, pitch: 'Silent sunrise paddle through a bird sanctuary, kingfishers and maybe a crocodile' },
  { id: 'anjuna-flea-market-crawl', city: 'Goa', title: 'Anjuna Wednesday flea market crawl', area: 'Anjuna, North Goa', tags: ['Events', 'Culture'], vibe: { shops: 1, culture: 0.3, chill: 0.3 }, priceRupees: 799, date: 'Wed, 4 Nov', startTime: '11:00 AM', duration: '3 hrs', rating: 4.81, pitch: 'Silver, textiles and vintage with a local who teaches you to bargain, then a shack lunch' },
  { id: 'old-goa-churches-walk', city: 'Goa', title: 'Old Goa churches and stories walk', area: 'Old Goa', tags: ['Culture'], vibe: { culture: 1 }, priceRupees: 999, date: 'Mon, 2 Nov', startTime: '08:30 AM', duration: '3 hrs', rating: 4.9, pitch: 'UNESCO churches with a historian before the tour buses arrive' },
  { id: 'arambol-sunset-drum-circle', city: 'Goa', title: 'Arambol sunset drum circle and beach jam', area: 'Arambol, North Goa', tags: ['Nightlife', 'Events'], vibe: { nightlife: 0.7, chill: 0.6, culture: 0.3 }, priceRupees: 699, date: 'Sat, 31 Oct', startTime: '05:00 PM', duration: '3 hrs', rating: 4.86, pitch: 'Learn the djembe and join the beach drum circle as the sun sets, then a fire show' },
  { id: 'sinquerim-dolphin-cruise', city: 'Goa', title: 'Dolphin spotting boat ride + Fort Aguada', area: 'Sinquerim, North Goa', tags: ['Adventure'], vibe: { adventure: 0.6, chill: 0.5 }, priceRupees: 899, date: 'Sun, 1 Nov', startTime: '08:00 AM', duration: '2.5 hrs', rating: 4.72, pitch: 'Morning boat ride to where the dolphins feed, then the fort and lighthouse view' },
  { id: 'chapora-fort-sunset', city: 'Goa', title: 'Chapora fort sunset hike and photo walk', area: 'Vagator, North Goa', tags: ['Hidden gems', 'Adventure'], vibe: { adventure: 0.6, chill: 0.6, culture: 0.3 }, priceRupees: 599, date: 'Sat, 31 Oct', startTime: '04:45 PM', duration: '2 hrs', rating: 4.84, pitch: 'Back trail up to Chapora fort for sunset, with a photographer shooting the squad' },
  { id: 'divar-island-cycling', city: 'Goa', title: 'Cycle Divar island by ferry', area: 'Divar island', tags: ['Hidden gems', 'Culture'], vibe: { chill: 0.7, adventure: 0.5, culture: 0.5, food: 0.3 }, priceRupees: 1299, date: 'Tue, 3 Nov', startTime: '07:30 AM', duration: '4 hrs', rating: 4.93, pitch: 'Ferry to a sleepy island, cycle past paddy fields and villas, home-cooked lunch' },
  { id: 'palolem-butterfly-island', city: 'Goa', title: 'Canoe to Butterfly beach from Palolem', area: 'Palolem, South Goa', tags: ['Hidden gems', 'Adventure'], vibe: { adventure: 0.8, chill: 0.5, food: 0.3 }, priceRupees: 1099, date: 'Wed, 4 Nov', startTime: '08:30 AM', duration: '4 hrs', rating: 4.79, pitch: 'Paddle a wooden canoe to a hidden cove, snorkel, then a kingfish thali' },
  { id: 'baga-night-out', city: 'Goa', title: 'Baga night out with a local', area: 'Baga, North Goa', tags: ['Nightlife'], vibe: { nightlife: 1, food: 0.2 }, priceRupees: 1999, date: 'Sat, 31 Oct', startTime: '09:30 PM', duration: '4 hrs', rating: 4.68, pitch: 'Live music, a beach party and guest-list club entry, ending at the 3 AM bun-omelette stall' },
  { id: 'cashew-feni-distillery', city: 'Goa', title: 'Cashew feni distillery visit', area: 'Bicholim, North Goa', tags: ['Food', 'Culture', 'Hidden gems'], vibe: { food: 0.8, culture: 0.6, nightlife: 0.3 }, priceRupees: 1599, date: 'Thu, 5 Nov', startTime: '10:00 AM', duration: '3 hrs', rating: 4.91, pitch: 'See feni made in a copper pot over a wood fire, then a tasting and lunch' },
  // Udaipur
  { id: 'pichola-sunset-boat', city: 'Udaipur', title: 'Lake Pichola sunset boat ride + Jag Mandir', area: 'Lal Ghat, Udaipur', tags: ['Culture', 'Hidden gems'], vibe: { chill: 0.9, culture: 0.6 }, priceRupees: 1299, date: 'Sun, 1 Nov', startTime: '04:45 PM', duration: '2 hrs', rating: 4.94, pitch: 'Private wooden boat past the Lake Palace to Jag Mandir island as the lake turns gold' },
  { id: 'udaipur-old-city-food-walk', city: 'Udaipur', title: 'Old city kachori and chaat walk', area: 'Jagdish Chowk, Udaipur', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.4, shops: 0.4 }, priceRupees: 999, date: 'Mon, 2 Nov', startTime: '05:30 PM', duration: '3 hrs', rating: 4.89, pitch: 'Hot kachori, mirchi vada, kulhad lassi and jalebi through the old-city bazaars' },
  { id: 'haveli-rajasthani-cooking', city: 'Udaipur', title: 'Dal baati churma cooking class in a haveli', area: 'Gangaur Ghat, Udaipur', tags: ['Food', 'Culture'], vibe: { food: 1, culture: 0.6 }, priceRupees: 1899, date: 'Tue, 3 Nov', startTime: '11:00 AM', duration: '3.5 hrs', rating: 4.98, pitch: 'Cook dal baati churma in a lakeside haveli and eat the thali on the rooftop' },
  { id: 'mewar-miniature-painting', city: 'Udaipur', title: 'Mewar miniature painting workshop', area: 'Hathi Pol, Udaipur', tags: ['Culture', 'Hidden gems'], vibe: { culture: 1, chill: 0.5, shops: 0.2 }, priceRupees: 1499, date: 'Mon, 2 Nov', startTime: '10:00 AM', duration: '3 hrs', rating: 4.93, pitch: 'Paint your own Mewar miniature with stone colours in a master painter’s studio' },
  { id: 'sajjangarh-sunset-cycle', city: 'Udaipur', title: 'Cycle to Sajjangarh Monsoon Palace for sunset', area: 'Fateh Sagar, Udaipur', tags: ['Adventure', 'Hidden gems'], vibe: { adventure: 0.8, chill: 0.4 }, priceRupees: 1199, date: 'Wed, 4 Nov', startTime: '03:30 PM', duration: '3.5 hrs', rating: 4.85, pitch: 'Ride along Fateh Sagar into the Aravallis for sunset over five lakes from the Monsoon Palace' },
  { id: 'bagore-dharohar-folk-evening', city: 'Udaipur', title: 'Dharohar folk dance evening at Bagore ki Haveli', area: 'Gangaur Ghat, Udaipur', tags: ['Events', 'Nightlife', 'Culture'], vibe: { culture: 0.8, nightlife: 0.6 }, priceRupees: 799, date: 'Sat, 31 Oct', startTime: '06:00 PM', duration: '2.5 hrs', rating: 4.82, pitch: 'Front-row seats for ghoomar and the nine-pot bhavai dance in an 18th-century haveli' },
];

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

/** The person's strongest axes, strongest first */
export const topAxes = (vibe: Vibe, count = 2): VibeAxis[] => [...VIBE_AXES].sort((a, b) => vibe[b] - vibe[a]).slice(0, count);

export type RankedExperience = {
  experience: CatalogueExperience;
  /** 0–100, how well the trip fits the vibe; null when ranked by rating only */
  match: number | null;
  /** Vibe axes this trip and the person both score high on, strongest first */
  because: VibeAxis[];
};

/** Weighted mean of the person's scores over the axes the trip speaks to */
function fit(experience: CatalogueExperience, vibe: Vibe) {
  const axes = VIBE_AXES.filter(axis => (experience.vibe[axis] ?? 0) > 0);
  const weight = axes.reduce((sum, axis) => sum + experience.vibe[axis]!, 0);
  const score = axes.reduce((sum, axis) => sum + experience.vibe[axis]! * vibe[axis], 0) / weight;
  const because = axes
    .filter(axis => experience.vibe[axis]! >= 0.5 && vibe[axis] >= 0.5)
    .sort((a, b) => experience.vibe[b]! * vibe[b] - experience.vibe[a]! * vibe[a]);
  return { match: Math.round(score * 100), because };
}

/**
 * Best trips first for one city (optionally one tag). With a vibe they're ordered by fit, then rating;
 * without one, by rating alone.
 */
export function rankExperiences(vibe: Vibe | null, opts: { city: ExperienceCity; tag?: ExperienceTag }): RankedExperience[] {
  return EXPERIENCES
    .filter(e => e.city === opts.city && (!opts.tag || e.tags.includes(opts.tag)))
    .map(experience => (vibe ? { experience, ...fit(experience, vibe) } : { experience, match: null, because: [] }))
    .sort((a, b) => (b.match ?? 0) - (a.match ?? 0) || b.experience.rating - a.experience.rating);
}
