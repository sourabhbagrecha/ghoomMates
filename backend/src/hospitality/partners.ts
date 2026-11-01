// Sample partners: four kitchens in Udaipur's old city and six farms in the villages around it. The places are real;
// the businesses are fictional, and the app labels them "sample partners". Village positions are approximate centres,
// used only to estimate road distance.
import type { IngredientId } from './produce.ts';
import type { Meal } from './types.ts';

export type Farm = {
  id: string;
  name: string;
  village: string;
  /** Approximate centre of the village (decimal degrees) */
  lat: number;
  lng: number;
  /** Road km ÷ straight-line km; hill roads wind (Gogunda) while the highway villages barely do */
  roadFactor: number;
  /** Grown or made without synthetic pesticides (self-declared in this sample) */
  organic: boolean;
  /** One line on how the farm works */
  practice: string;
  story: string;
  produce: IngredientId[];
  image: string;
};

export const FARMS: Farm[] = [
  {
    id: 'hariyali-dhani', name: 'Hariyali Dhani', village: 'Badgaon', lat: 24.6869, lng: 73.6463, roadFactor: 1.25,
    organic: true, practice: 'Rain-fed fields, no synthetic pesticides',
    story: 'Fourteen families farming rain-fed fields beyond Badgaon. Their makki and bajra go through the village chakki; greens and chillies are picked at dawn and reach the old city by breakfast.',
    produce: ['makki', 'bajra', 'greens', 'green-chilli'], image: '/hospitality/farms/hariyali-dhani.jpg',
  },
  {
    id: 'bhuwana-anaj-samooh', name: 'Bhuwana Anaj Samooh', village: 'Bhuwana', lat: 24.6147, lng: 73.7067, roadFactor: 1.3,
    organic: false, practice: 'Low-input grain farming, shared godown',
    story: 'A grain-and-pulse collective on the Nathdwara highway: wheat, gram, mixed dals and groundnut, stored in a shared godown and sold straight to kitchens in town.',
    produce: ['wheat', 'besan', 'dal', 'groundnut', 'onion', 'garlic'], image: '/hospitality/farms/bhuwana-anaj-samooh.jpg',
  },
  {
    id: 'kailashpuri-desi-dairy', name: 'Kailashpuri Desi Dairy', village: 'Eklingji', lat: 24.7460, lng: 73.7222, roadFactor: 1.2,
    organic: true, practice: 'Desi cows on pasture and home-grown fodder',
    story: 'A cow-shelter dairy near the Eklingji temple. Curd and paneer are made every morning, and ghee is churned the slow way from cultured curd.',
    produce: ['ghee', 'dahi', 'paneer'], image: '/hospitality/farms/kailashpuri-desi-dairy.jpg',
  },
  {
    id: 'aravalli-forage-collective', name: 'Aravalli Forage Collective', village: 'Gogunda', lat: 24.75, lng: 73.53, roadFactor: 1.55,
    organic: true, practice: 'Wild-harvested and sun-dried',
    story: 'Women of the Gogunda hills who pick ker berries and sangri pods in spring and kachri after the rains, then sun-dry them to last the year. Their income comes from standing trees, so the trees stay.',
    produce: ['ker', 'sangri', 'kachri'], image: '/hospitality/farms/aravalli-forage-collective.jpg',
  },
  {
    id: 'kaladwas-sabzi-baadi', name: 'Kaladwas Sabzi Baadi', village: 'Kaladwas', lat: 24.65, lng: 73.75, roadFactor: 1.3,
    organic: false, practice: 'Open-well irrigation, same-morning delivery',
    story: 'Market gardeners in Kaladwas growing tomatoes, gourds and pumpkins for the city, picked in the morning and on the kitchen counter by noon.',
    produce: ['tomato', 'tinda', 'kaddu', 'potato'], image: '/hospitality/farms/kaladwas-sabzi-baadi.jpg',
  },
  {
    id: 'sisarma-baag', name: 'Sisarma Baag', village: 'Sisarma', lat: 24.542, lng: 73.656, roadFactor: 1.35,
    organic: true, practice: 'Terraced kitchen gardens, compost only',
    story: 'Terraced kitchen gardens in the Sisarma valley at the foot of the hills, growing greens, tomatoes, chillies and gourds for old-city kitchens.',
    produce: ['greens', 'tomato', 'green-chilli', 'tinda'], image: '/hospitality/farms/sisarma-baag.jpg',
  },
];

export const FARM_BY_ID = new Map(FARMS.map(f => [f.id, f]));

export type HostKind = 'haveli' | 'homestay' | 'cafe';

export type Practices = {
  plasticFree: 'full' | 'partial' | 'no';
  waterRefill: 'free' | 'paid' | 'none';
  composts: boolean;
  /** Food left over per cover on an ordinary day, as the kitchen reports it; logged leftovers replace this */
  wasteKgPerCover: number;
};

export type Host = {
  id: string;
  name: string;
  kind: HostKind;
  area: string;
  lat: number;
  lng: number;
  tagline: string;
  story: string;
  highlights: string[];
  /** Where the squad sits */
  squadNote: string;
  /** Price of one thali in rupees. An estimate for the demo. */
  pricePerThali: number;
  meals: Meal[];
  /** Seats per meal */
  capacity: number;
  /** Typical walk-in covers per meal on an ordinary weekday in the busy season, before any squad books */
  walkIns: Record<Meal, number>;
  farmIds: string[];
  practices: Practices;
  image: string;
};

export const HOSTS: Host[] = [
  {
    id: 'kesar-pol-haveli', name: 'Kesar Pol Haveli', kind: 'haveli', area: 'Gangaur Ghat', lat: 24.5806, lng: 73.6821,
    tagline: 'A lakeside haveli kitchen that cooks to the head-count',
    story: 'The Kesar Pol kitchen runs on one wood-fired chulha and a short list of farms. Makki and greens come from Hariyali Dhani in Badgaon, ghee and dahi from Kailashpuri’s desi-cow dairy, and dried ker, sangri and kachri from the Gogunda women’s collective. Leftovers go to the courtyard compost and the ghat’s cows, and the kitchen cooks to the squad’s head-count instead of a buffet’s guess.',
    highlights: ['Wood-fired chulha', 'Rooftop table for squads', 'Jain and vegan thalis on request'],
    squadNote: 'Rooftop long table for up to 20, facing Lake Pichola',
    pricePerThali: 540, meals: ['lunch', 'dinner'], capacity: 40, walkIns: { lunch: 16, dinner: 24 },
    farmIds: ['hariyali-dhani', 'bhuwana-anaj-samooh', 'kailashpuri-desi-dairy', 'aravalli-forage-collective', 'kaladwas-sabzi-baadi'],
    practices: { plasticFree: 'full', waterRefill: 'free', composts: true, wasteKgPerCover: 0.09 },
    image: '/hospitality/hosts/kesar-pol-haveli.jpg',
  },
  {
    id: 'aangan-homestay', name: 'Aangan Homestay', kind: 'homestay', area: 'Lal Ghat', lat: 24.579, lng: 73.681,
    tagline: 'Dinner at a family courtyard table, minutes from the ghat',
    story: 'Aangan is a family home with five guest rooms around a neem-shaded courtyard. Dinner is one long table and one thali, cooked the same day from whatever the farms sent that morning. Water comes from a free refill station, vegetable peels go to the compost, and nothing is served in plastic.',
    highlights: ['Cooked by the family', 'Free water refills', 'Compost and zero plastic'],
    squadNote: 'The long courtyard table seats 16',
    pricePerThali: 380, meals: ['lunch', 'dinner'], capacity: 20, walkIns: { lunch: 6, dinner: 10 },
    farmIds: ['hariyali-dhani', 'bhuwana-anaj-samooh', 'kailashpuri-desi-dairy', 'kaladwas-sabzi-baadi'],
    practices: { plasticFree: 'full', waterRefill: 'free', composts: true, wasteKgPerCover: 0.1 },
    image: '/hospitality/hosts/aangan-homestay.jpg',
  },
  {
    id: 'chulha-chowk-cafe', name: 'Chulha Chowk Café', kind: 'cafe', area: 'Ambamata', lat: 24.5855, lng: 73.677,
    tagline: 'A rooftop café with a clay-stove menu',
    story: 'Chulha Chowk cooks Mewari classics on clay and gas stoves above the Ambamata lanes. About half of its staples now come straight from partner farms, and the rest still comes through the mandi. Tea comes in kulhads, thalis on steel, the water refill costs ₹10, and the owners are working on a compost pit.',
    highlights: ['Rooftop at sunset', 'Kulhad chai', 'Half the menu farm-direct'],
    squadNote: 'Sunset corner for up to 12',
    pricePerThali: 320, meals: ['lunch', 'dinner'], capacity: 50, walkIns: { lunch: 22, dinner: 18 },
    farmIds: ['bhuwana-anaj-samooh', 'kailashpuri-desi-dairy', 'kaladwas-sabzi-baadi', 'sisarma-baag'],
    practices: { plasticFree: 'full', waterRefill: 'paid', composts: false, wasteKgPerCover: 0.12 },
    image: '/hospitality/hosts/chulha-chowk-cafe.jpg',
  },
  {
    id: 'pal-rasoi', name: 'Pal Rasoi', kind: 'cafe', area: 'Fateh Sagar', lat: 24.5921, lng: 73.6798,
    tagline: 'A lakeside thali kitchen on the Pal',
    story: 'Pal Rasoi feeds day-trippers on Fateh Sagar’s embankment, so it cooks big and fast. It is new to farm-direct buying: grain, curd and greens come from partner farms, while makki, bajra and the wild foods still come through the market. Plastic cutlery is being phased out, and the water refill costs ₹10 for now.',
    highlights: ['Lake view tables', 'Big-batch cooking', 'Moving to farm-direct'],
    squadNote: 'Neem-shaded lakeside tables for up to 16',
    pricePerThali: 260, meals: ['lunch', 'dinner'], capacity: 70, walkIns: { lunch: 30, dinner: 34 },
    farmIds: ['bhuwana-anaj-samooh', 'kailashpuri-desi-dairy', 'sisarma-baag'],
    practices: { plasticFree: 'partial', waterRefill: 'paid', composts: false, wasteKgPerCover: 0.12 },
    image: '/hospitality/hosts/pal-rasoi.jpg',
  },
];

export const HOST_BY_ID = new Map(HOSTS.map(h => [h.id, h]));

export const HOST_KIND_LABEL: Record<HostKind, string> = { haveli: 'Haveli guesthouse', homestay: 'Family homestay', cafe: 'Café' };

/** Great-circle distance in km */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (deg: number) => deg * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Estimated road km from a farm to a kitchen */
export function roadKm(host: Host, farm: Farm): number {
  return Math.max(1, Math.round(haversineKm(host.lat, host.lng, farm.lat, farm.lng) * farm.roadFactor));
}

/** The host's partner farms, nearest first */
export function farmsOf(host: Host): { farm: Farm; km: number }[] {
  return host.farmIds
    .map(id => FARM_BY_ID.get(id))
    .filter((f): f is Farm => Boolean(f))
    .map(farm => ({ farm, km: roadKm(host, farm) }))
    .sort((a, b) => a.km - b.km);
}
