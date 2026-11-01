// Simulated squads for the demo. Real planned stops are a handful while the app is young, so the console layers a
// deterministic sample on top: the same city, day and seed always give the same squads, shaped by each site's own
// crowd curve (squads arrive about half a stay before the site peaks). They are flagged `sample: true`, can be switched
// off (`?sample=0`, or OPS_SAMPLE_SQUADS=off) and are always labelled as simulated in the console.
import { eventLift } from '../events/lift.ts';
import { dayFactor, isOpen, sitesIn } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';
import { SITE_BY_ID } from '../heritage/sites.ts';
import { curveAt, DWELL_MINUTES, type PlannedStop } from './forecast.ts';

/** Squads arriving per hour at a site whose curve reads 100 and whose popularity is 1 */
const SQUADS_AT_FULL = 26;

/** Squads herd onto the famous hours (everyone's guidebook says "go at 10"), so arrivals follow the curve to this power */
const HERDING = 3;

/** How many squads pick each site relative to City Palace; the lesser-known gems stay quiet, which is the point */
const POPULARITY: Record<string, number> = {
  'city-palace': 1,
  'jagdish-temple': 0.62,
  'pichola-boat': 0.62,
  'bagore-ki-haveli': 0.46,
  'gangaur-ghat': 0.42,
  'ambrai-ghat': 0.34,
  'saheliyon-ki-bari': 0.34,
  sajjangarh: 0.42,
  'fateh-sagar': 0.38,
  'karni-mata': 0.22,
  'hathi-pol': 0.22,
  'neemach-mata': 0.2,
  'moti-magri': 0.18,
  shilpgram: 0.22,
  'lok-kala-mandal': 0.22,
  'ahar-cenotaphs': 0.1,
  'gulab-bagh': 0.14,
  'vintage-cars': 0.16,
  'badi-lake': 0.12,
};

const SQUAD_SIZES = [4, 4, 5, 5, 5, 6, 6, 7, 8, 10];
const MAX_STOPS_PER_SQUAD = 3;
/** Walk or ride between two stops */
const TRAVEL_MINUTES = 20;

/** Small seeded generator, so a given city and day always produce the same sample */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

type Visit = { siteId: string; minutes: number };
type Squad = { id: string; people: number; freeAt: number; stops: number; sites: Set<string> };

/** Simulated squads for a city and day: stops with times, grouped into squads that move between sites */
export function sampleStops(city: HeritageCity, date: string): PlannedStop[] {
  const random = mulberry32(hash(`${city}:${date}`));
  const factor = dayFactor(date).factor;

  const visits: Visit[] = [];
  for (const site of sitesIn(city)) {
    const popularity = POPULARITY[site.id] ?? 0.05;
    const dwell = DWELL_MINUTES[site.kind];
    // Half-hour slots across the day; the curve is read half a stay ahead because squads arrive before the site peaks
    for (let slot = 6 * 60; slot < 22 * 60; slot += 30) {
      if (!isOpen(site, slot, date)) continue;
      // A festival at the site that day (events/calendar.ts) draws more squads into its hours
      const expected = popularity * SQUADS_AT_FULL * factor * eventLift(site.id, slot, date).factor * (curveAt(site, slot + dwell / 2) / 100) ** HERDING / 2;
      // Fractions become an occasional extra squad, so quiet gems still see the odd visitor
      const wanted = expected * (0.9 + 0.2 * random());
      const count = Math.floor(wanted) + (random() < wanted % 1 ? 1 : 0);
      for (let i = 0; i < count; i++) visits.push({ siteId: site.id, minutes: slot + (random() < 0.5 ? 0 : 15) });
    }
  }
  visits.sort((a, b) => a.minutes - b.minutes || a.siteId.localeCompare(b.siteId));

  // Group visits into squads: most squads chain two or three sites through the day, never two at once
  const squads: Squad[] = [];
  const stops: PlannedStop[] = [];
  for (const visit of visits) {
    const dwell = DWELL_MINUTES[SITE_BY_ID.get(visit.siteId)!.kind];
    const free = squads.filter(s => s.freeAt <= visit.minutes && s.stops < MAX_STOPS_PER_SQUAD && !s.sites.has(visit.siteId));
    let squad = free.length && random() < 0.6 ? free[Math.floor(random() * free.length)] : undefined;
    if (!squad) {
      squad = { id: `sample-${squads.length + 1}`, people: SQUAD_SIZES[Math.floor(random() * SQUAD_SIZES.length)], freeAt: 0, stops: 0, sites: new Set() };
      squads.push(squad);
    }
    squad.freeAt = visit.minutes + dwell + TRAVEL_MINUTES;
    squad.stops++;
    squad.sites.add(visit.siteId);
    stops.push({ squad: squad.id, siteId: visit.siteId, minutes: visit.minutes, people: squad.people, sample: true });
  }
  return stops;
}
