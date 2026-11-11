// Where squads plan to be: heritage stops with a time, on a given day, across every trip. Only aggregates ever leave
// the ops module; the trip id here is just a handle to count a squad once.
import { cityOf, matchSite } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';
import { addDays, type OpsDb } from './advisories.ts';
import type { PlannedStop } from './forecast.ts';

// A meal or a check-in near a ghat isn't a visit to it (the itinerary skips these too)
const NON_VISIT_TAGS = new Set(['Food', 'Stay', 'Travel']);

const DAY_MS = 24 * 60 * 60 * 1000;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Stops with a time that fall on `date` (trip start date + day number), in trips to the city, as planned heritage visits */
export async function loadPlannedStops({ db }: OpsDb, city: HeritageCity, date: string): Promise<PlannedStop[]> {
  // Trips to the city that have started by `date` (a stop's day can be at most 60 days in)
  const named = new RegExp(escapeRegex(city), 'i');
  const trips = await db.collection<any>('trips')
    .find(
      { start_date: { $ne: null, $lte: date, $gte: addDays(date, -59) }, $or: [{ destination: named }, { name: named }] },
      { projection: { start_date: 1, destination: 1, name: 1 } },
    )
    .toArray();
  // The itinerary day each trip is on that date
  const dayOf = (start: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  const candidates = trips.filter(t => cityOf(t.destination || t.name) === city);
  if (!candidates.length) return [];

  const [stops, members] = await Promise.all([
    db.collection<any>('trip_stops')
      .find({ $or: candidates.map(t => ({ trip_id: t._id, day_number: dayOf(t.start_date) })), time: { $ne: '' } })
      .project({ trip_id: 1, title: 1, place: 1, tag: 1, minutes: 1 })
      .toArray(),
    db.collection('trip_members')
      .aggregate<{ _id: string; people: number }>([
        { $match: { trip_id: { $in: candidates.map(t => t._id) } } },
        { $group: { _id: '$trip_id', people: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const people = new Map(members.map(m => [m._id, m.people]));

  const planned: PlannedStop[] = [];
  for (const stop of stops) {
    if (NON_VISIT_TAGS.has(stop.tag)) continue;
    const site = matchSite(stop.title, stop.place, city);
    if (!site) continue;
    planned.push({ squad: stop.trip_id, siteId: site.id, minutes: stop.minutes, people: Math.max(1, people.get(stop.trip_id) ?? 1), sample: false });
  }
  return planned;
}
