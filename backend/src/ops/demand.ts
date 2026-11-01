// Where squads plan to be: heritage stops with a time, on a given day, across every trip. Only aggregates ever leave
// the ops module; the trip id here is just a handle to count a squad once.
import { cityOf, matchSite } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';
import type { OpsDb } from './advisories.ts';
import type { PlannedStop } from './forecast.ts';

// A meal or a check-in near a ghat isn't a visit to it (the itinerary skips these too)
const NON_VISIT_TAGS = new Set(['Food', 'Stay', 'Travel']);

type Row = { trip_id: string; title: string; place: string; tag: string; minutes: number; destination: string; name: string; people: number | string };

/** Stops with a time that fall on `date` (trip start date + day number), in trips to the city, as planned heritage visits */
export async function loadPlannedStops(db: OpsDb, city: HeritageCity, date: string): Promise<PlannedStop[]> {
  const { rows } = await db.pool.query(
    `SELECT s.trip_id, s.title, s.place, s.tag, s.minutes, t.destination, t.name,
       (SELECT count(*) FROM trip_members m WHERE m.trip_id = s.trip_id) AS people
     FROM trip_stops s JOIN trips t ON t.id = s.trip_id
     WHERE t.start_date IS NOT NULL AND t.start_date + (s.day_number - 1) = $1::date AND s.time <> ''
       AND (lower(t.destination) LIKE $2 OR lower(t.name) LIKE $2)`,
    [date, `%${city.toLowerCase()}%`],
  );
  const stops: PlannedStop[] = [];
  for (const row of rows as Row[]) {
    if (NON_VISIT_TAGS.has(row.tag) || cityOf(row.destination || row.name) !== city) continue;
    const site = matchSite(row.title, row.place, city);
    if (!site) continue;
    stops.push({ squad: row.trip_id, siteId: site.id, minutes: row.minutes, people: Math.max(1, Number(row.people) || 1), sample: false });
  }
  return stops;
}
