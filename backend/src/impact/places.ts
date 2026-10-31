// Where an itinerary stop is, so the rides in between can be measured. A stop is placed by (1) the heritage module's
// matchSite() (19 curated Udaipur sites with coordinates), then (2) the extra landmarks below, then (3) the hotel when
// it is a Stay stop with no place of its own. Anything else is skipped rather than guessed.
import { matchSite } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';

/** Which side of Lake Pichola a place is on, for the boat-versus-the-long-way-round decision */
export type Shore = 'east' | 'west' | 'island';

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Heritage site id when the place is one of the curated sites */
  siteId: string | null;
  shore: Shore | null;
};

/** The City Palace side of Pichola is "east"; Ambrai Ghat is across the water; the Lake Palace is on its island */
const SHORE_OF_SITE: Record<string, Shore> = {
  'city-palace': 'east',
  'pichola-boat': 'east',
  'gangaur-ghat': 'east',
  'bagore-ki-haveli': 'east',
  'ambrai-ghat': 'west',
};

type Extra = { id: string; name: string; aliases: string[]; lat: number; lng: number; shore?: Shore; generic?: boolean };

// Coordinates from OpenStreetMap (Nominatim), rounded to ~10 m. Aliases are matched as whole words, case-insensitively.
// `generic` places ("old city") only win when nothing more specific is named.
const EXTRAS: Extra[] = [
  { id: 'lal-ghat', name: 'Lal Ghat', aliases: ['lal ghat'], lat: 24.5795, lng: 73.6827, shore: 'east' },
  { id: 'jagdish-chowk', name: 'Jagdish Chowk', aliases: ['jagdish chowk'], lat: 24.5785, lng: 73.6842 },
  { id: 'bada-bazaar', name: 'Bada Bazaar', aliases: ['bada bazaar', 'bada bazar', 'bara bazaar'], lat: 24.5814, lng: 73.69 },
  { id: 'delhi-gate', name: 'Delhi Gate', aliases: ['delhi gate'], lat: 24.5854, lng: 73.695 },
  { id: 'lake-palace', name: 'Taj Lake Palace', aliases: ['taj lake palace', 'lake palace', 'jag niwas'], lat: 24.5754, lng: 73.6801, shore: 'island' },
  { id: 'ahar', name: 'Ahar village', aliases: ['ahar'], lat: 24.587, lng: 73.719 },
  { id: 'hiran-magri', name: 'Hiran Magri', aliases: ['hiran magri'], lat: 24.57, lng: 73.72 },
  { id: 'sukhadia-circle', name: 'Sukhadia Circle', aliases: ['sukhadia circle'], lat: 24.6011, lng: 73.6915 },
  { id: 'city-station', name: 'Udaipur City station', aliases: ['railway station', 'city station', 'train station', 'udaipur station'], lat: 24.5675, lng: 73.6996 },
  { id: 'airport', name: 'Maharana Pratap Airport', aliases: ['airport', 'dabok'], lat: 24.6174, lng: 73.8942 },
  // Day trips
  { id: 'eklingji', name: 'Eklingji temple', aliases: ['eklingji', 'eklingji temple'], lat: 24.7469, lng: 73.7233 },
  { id: 'haldighati', name: 'Haldighati', aliases: ['haldighati'], lat: 24.89, lng: 73.694 },
  { id: 'nathdwara', name: 'Nathdwara', aliases: ['nathdwara', 'shrinathji'], lat: 24.9283, lng: 73.816 },
  { id: 'menar', name: 'Menar', aliases: ['menar'], lat: 24.5996, lng: 74.112 },
  { id: 'kumbhalgarh', name: 'Kumbhalgarh fort', aliases: ['kumbhalgarh'], lat: 25.1527, lng: 73.5863 },
  { id: 'ranakpur', name: 'Ranakpur', aliases: ['ranakpur'], lat: 25.117, lng: 73.472 },
  { id: 'jaisamand', name: 'Jaisamand Lake', aliases: ['jaisamand', 'dhebar lake'], lat: 24.2643, lng: 73.967 },
  // Generic: the walled old city around the palace, Jagdish Chowk and the ghats
  { id: 'old-city', name: 'Old city', aliases: ['old city', 'old town', 'walled city', 'city centre', 'city center'], lat: 24.579, lng: 73.6835, generic: true },
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (aliases: string[]) => new RegExp(`\\b(?:${aliases.map(escape).join('|')})\\b`, 'i');
const EXTRA_MATCHERS = EXTRAS.map(extra => ({ extra, re: matcher(extra.aliases) }));

const fromExtra = (e: Extra): Place => ({ id: e.id, name: e.name, lat: e.lat, lng: e.lng, siteId: null, shore: e.shore ?? null });

/** The earliest-named extra place in the text; specific places beat generic ones */
function matchExtra(text: string): Extra | null {
  for (const generic of [false, true]) {
    let best: { extra: Extra; at: number } | null = null;
    for (const { extra, re } of EXTRA_MATCHERS) {
      if (Boolean(extra.generic) !== generic) continue;
      const at = text.search(re);
      if (at !== -1 && (!best || at < best.at)) best = { extra, at };
    }
    if (best) return best.extra;
  }
  return null;
}

/**
 * Where a stop is, or null when we can't tell (or the trip isn't to a city we know). A Stay stop with no place of its
 * own (check-out) is the hotel of the first Stay stop that did name one, passed as `hotel`.
 */
export function locate(
  stop: { title: string; place: string; tag: string },
  city: HeritageCity | null,
  hotel: Place | null = null,
): Place | null {
  // The curated places are Udaipur's; a trip anywhere else has nothing to place its stops against
  if (!city) return null;
  const site = matchSite(stop.title, stop.place, city);
  if (site) return { id: site.id, name: site.name, lat: site.lat, lng: site.lng, siteId: site.id, shore: SHORE_OF_SITE[site.id] ?? null };
  const extra = matchExtra(stop.title) ?? matchExtra(stop.place);
  if (extra) return fromExtra(extra);
  if (stop.tag === 'Stay' && hotel) return hotel;
  return null;
}

/** Whether a ride between two places is a crossing of Lake Pichola (a boat beats the long way round) */
export const isLakeCrossing = (a: Place, b: Place) => a.shore !== null && b.shore !== null && a.shore !== b.shore;

/** A keyless Google Maps link to a place, for the leg cards */
export const mapsLink = (place: Pick<Place, 'lat' | 'lng'>) => `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
