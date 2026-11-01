// The Heritage Ops forecast: the modelled crowd for every site and hour, plus the pressure squads' own plans add.
// Pure functions, no I/O: the API feeds in planned stops (real trips and, for the demo, simulated ones) and gets
// back a heatmap, KPIs, the windows that need a nudge and the data an advisory is drafted from.
//
// The uplift formula (documented in docs/ops.md):
//
//   present(site, hour) = Σ over planned stops of  people × (minutes the squad is still at the site during that hour ÷ 60)
//   uplift  (site, hour) = present ÷ CAPACITY_PER_HOUR[site kind] × 100                       (level points)
//   projected(site, hour) = min(100, modelled baseline + uplift)
//
// A squad arrives at its stop's time and stays DWELL_MINUTES[site kind], so a palace visit loads two or three hours
// and a temple visit under one. Counts shown to partners are arrivals (squads that start a stop in that hour).
import { BUSY_FROM, formatTime, labelFor, levelAt, sitesIn, type CrowdLabel } from '../heritage/crowd.ts';
import { SITE_BY_ID, type HeritageCity, type HeritageSite, type SiteKind } from '../heritage/sites.ts';

/** Hour columns of the console, 6 AM to 9 PM: the span the itinerary's crowd chart already uses */
export const FIRST_HOUR = 6;
export const LAST_HOUR = 21;
export const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

/** Fewer squads than this are never shown as a number ("<3"), so a small group can't be picked out */
export const MIN_SQUADS = 3;

/** People an hour a site can host before it feels full: what a planned person is weighed against */
export const CAPACITY_PER_HOUR: Record<SiteKind, number> = {
  Palace: 340, Temple: 300, Haveli: 150, Ghat: 380, Garden: 320, Lake: 220, Viewpoint: 200, Museum: 170, Crafts: 170, Bazaar: 480,
};

/** How long a squad stays once it arrives: a palace takes two hours, a temple under one */
export const DWELL_MINUTES: Record<SiteKind, number> = {
  Palace: 120, Temple: 45, Haveli: 60, Ghat: 60, Garden: 60, Lake: 60, Viewpoint: 60, Museum: 75, Crafts: 75, Bazaar: 75,
};

/** Share of squads assumed to take a swap when an advisory reaches them (an assumption, shown as an estimate) */
export const ADVISORY_PICKUP = 0.3;

export type PlannedStop = {
  /** A squad (a trip). Counts squads once and is never sent to a client */
  squad: string;
  siteId: string;
  /** Arrival, minutes after midnight */
  minutes: number;
  /** Members in the squad */
  people: number;
  /** Simulated demo squad rather than a real trip */
  sample: boolean;
};

/** A count that is never smaller than the privacy floor: "<3" when 1 or 2 squads */
export type Shown = number | '<3';

export const shownSquads = (squads: number): Shown => (squads > 0 && squads < MIN_SQUADS ? '<3' : squads);
export const shownPeople = (squads: number, people: number): number | null => (squads > 0 && squads < MIN_SQUADS ? null : people);

export type Cell = {
  hour: number;
  /** "10 AM" */
  time: string;
  /** Modelled crowd for a typical day; null while the site is closed */
  baseline: number | null;
  /** Level points the squads' plans add */
  uplift: number;
  /** baseline + uplift, capped at 100 */
  level: number | null;
  label: CrowdLabel;
  baselineLabel: CrowdLabel;
  /** Squads starting a stop in this hour, and the people in them */
  squads: Shown;
  people: number | null;
};

export type Slot = { hour: number; time: string; minutes: number; level: number; label: CrowdLabel };

/** A window of the day that is expected to be crowded and has squads heading into it */
export type Hotspot = {
  siteId: string;
  siteName: string;
  kind: SiteKind;
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  level: number;
  label: CrowdLabel;
  squads: number;
  people: number;
};

export type SiteForecast = {
  id: string;
  name: string;
  kind: SiteKind;
  gem: boolean;
  lat: number;
  lng: number;
  hours: Cell[];
  /** The hour with the highest projected level */
  peak: Slot | null;
  /** The best alternative hour: the lowest projected level, nearest the peak on a tie */
  best: Slot | null;
  /** Squads and people arriving at this site over the day */
  squads: Shown;
  people: number | null;
  hotspot: Hotspot | null;
};

export type OpsForecast = {
  city: HeritageCity;
  date: string;
  /** "weekend", "Diwali" or null */
  dayNote: string | null;
  hours: number[];
  kpis: {
    plannedVisitors: number | null;
    squads: Shown;
    /** The site and hour with the highest projected level */
    busiest: (Slot & { siteId: string; siteName: string; squads: Shown }) | null;
    /** Share (0–1) of planned visits whose hour is projected below "busy"; null when nothing is planned */
    offPeakShare: number | null;
    /** Windows that need a nudge */
    hotspots: number;
  };
  /** Squads arriving across the city, hour by hour */
  byHour: { hour: number; squads: Shown }[];
  hotspots: Hotspot[];
  sites: SiteForecast[];
};

export const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

/** Interpolated baseline at a minute of the day, ignoring opening hours */
export function curveAt(site: HeritageSite, minutes: number) {
  const hour = Math.floor(minutes / 60);
  const from = site.curve[hour % 24];
  const to = site.curve[(hour + 1) % 24] || from;
  return from + (to - from) * (minutes % 60) / 60;
}

/** The modelled level for an hour column, the same rule the itinerary's crowd chart uses; null when closed all hour */
export function baselineFor(site: HeritageSite, hour: number, date: string): number | null {
  return levelAt(site, hour * 60, date) ?? levelAt(site, hour * 60 + 30, date);
}

/** Hours (0–1) of the squad's visit that fall inside an hour column */
export function overlapHours(arrival: number, dwell: number, hour: number) {
  const from = Math.max(arrival, hour * 60);
  const to = Math.min(arrival + dwell, hour * 60 + 60);
  return Math.max(0, to - from) / 60;
}

type Tally = { squads: number; people: number };

/** Distinct squads and the people in them: a squad with two stops in the group counts once */
function tally(stops: PlannedStop[]): Tally {
  const bySquad = new Map<string, number>();
  for (const s of stops) if (!bySquad.has(s.squad)) bySquad.set(s.squad, s.people);
  let people = 0;
  for (const p of bySquad.values()) people += p;
  return { squads: bySquad.size, people };
}

const slotOf = (cell: Cell): Slot => ({
  hour: cell.hour, time: cell.time, minutes: cell.hour * 60, level: cell.level!, label: cell.label,
});

/** The first minute of an hour column the site is open (City Palace opens at 9:30, so its 9 AM column starts at 9:30) */
export function firstOpenMinute(site: HeritageSite, hour: number, date: string) {
  let minutes = hour * 60;
  while (minutes < hour * 60 + 59 && levelAt(site, minutes, date) === null) minutes += 15;
  return Math.min(minutes, hour * 60 + 59);
}

function peakAndBest(site: HeritageSite, date: string, cells: Cell[]) {
  const open = cells.filter(c => c.level !== null);
  if (!open.length) return { peak: null, best: null };
  const peakCell = open.reduce((top, c) => (c.level! > top.level! ? c : top));
  // Quietest hour; on a tie the one nearest the peak, so the swap is as small a change as possible
  const bestCell = open.reduce((low, c) => {
    if (c.level! !== low.level!) return c.level! < low.level! ? c : low;
    return Math.abs(c.hour - peakCell.hour) < Math.abs(low.hour - peakCell.hour) ? c : low;
  });
  return {
    peak: slotOf(peakCell),
    best: { ...slotOf(bestCell), minutes: firstOpenMinute(site, bestCell.hour, date) },
  };
}

/**
 * The window to nudge squads out of: the first two hours of the run of "busy" (or worse) hours that the most squads
 * arrive into. Warning at the front of the crunch is what lets squads change plans before they get there.
 */
function hotspotOf(site: HeritageSite, cells: Cell[], arrivals: Map<number, PlannedStop[]>): Hotspot | null {
  let best: { start: number; end: number; squads: number; people: number; level: number } | null = null;
  let i = 0;
  while (i < cells.length) {
    if (cells[i].level === null || cells[i].level! < BUSY_FROM) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < cells.length && cells[j + 1].level !== null && cells[j + 1].level! >= BUSY_FROM) j++;
    const last = Math.min(j, i + 1);
    const stops = cells.slice(i, last + 1).flatMap(c => arrivals.get(c.hour) ?? []);
    const { squads, people } = tally(stops);
    const level = Math.max(...cells.slice(i, last + 1).map(c => c.level!));
    if (squads >= MIN_SQUADS && (!best || squads > best.squads)) best = { start: cells[i].hour, end: cells[last].hour + 1, squads, people, level };
    i = j + 1;
  }
  if (!best) return null;
  return {
    siteId: site.id, siteName: site.name, kind: site.kind,
    startMinutes: best.start * 60, endMinutes: best.end * 60,
    startTime: formatTime(best.start * 60), endTime: formatTime(best.end * 60),
    level: best.level, label: labelFor(best.level), squads: best.squads, people: best.people,
  };
}

/** Builds the whole console forecast for a city and day from the planned stops */
export function buildForecast(city: HeritageCity, date: string, dayNote: string | null, stops: PlannedStop[]): OpsForecast {
  const bySite = new Map<string, PlannedStop[]>();
  for (const s of stops) {
    const list = bySite.get(s.siteId) ?? [];
    list.push(s);
    bySite.set(s.siteId, list);
  }

  const sites: SiteForecast[] = [];
  const visits: { level: number | null }[] = [];
  const cityByHour = new Map<number, PlannedStop[]>();

  for (const site of sitesIn(city)) {
    const siteStops = bySite.get(site.id) ?? [];
    const arrivals = new Map<number, PlannedStop[]>();
    for (const s of siteStops) {
      const hour = Math.floor(s.minutes / 60);
      const list = arrivals.get(hour) ?? [];
      list.push(s);
      arrivals.set(hour, list);
    }

    const cells: Cell[] = HOURS.map((hour) => {
      const baseline = baselineFor(site, hour, date);
      let present = 0;
      for (const s of siteStops) present += s.people * overlapHours(s.minutes, DWELL_MINUTES[site.kind], hour);
      const uplift = baseline === null ? 0 : Math.round(present / CAPACITY_PER_HOUR[site.kind] * 100);
      const level = baseline === null ? null : Math.min(100, baseline + uplift);
      const here = arrivals.get(hour) ?? [];
      const { squads, people } = tally(here);
      return {
        hour, time: hourLabel(hour), baseline, uplift, level, label: labelFor(level), baselineLabel: labelFor(baseline),
        squads: shownSquads(squads), people: shownPeople(squads, people),
      };
    });

    // Each planned visit, once per squad and hour, judged by how crowded its hour is projected to be
    const seen = new Set<string>();
    for (const s of siteStops) {
      const hour = Math.floor(s.minutes / 60);
      const key = `${s.squad}:${hour}`;
      if (seen.has(key) || hour < FIRST_HOUR || hour > LAST_HOUR) continue;
      seen.add(key);
      visits.push({ level: cells[hour - FIRST_HOUR].level });
    }
    for (const [hour, list] of arrivals) cityByHour.set(hour, [...(cityByHour.get(hour) ?? []), ...list]);

    const day = tally(siteStops);
    sites.push({
      id: site.id, name: site.name, kind: site.kind, gem: site.gem, lat: site.lat, lng: site.lng,
      hours: cells, ...peakAndBest(site, date, cells),
      squads: shownSquads(day.squads), people: shownPeople(day.squads, day.people),
      hotspot: hotspotOf(site, cells, arrivals),
    });
  }

  // What needs attention first: sites with a crunch window (most squads heading in first), then by how high they peak
  sites.sort((a, b) =>
    (b.hotspot?.squads ?? 0) - (a.hotspot?.squads ?? 0) || (b.peak?.level ?? -1) - (a.peak?.level ?? -1) || a.name.localeCompare(b.name));

  const all = tally(stops);
  let busiest: OpsForecast['kpis']['busiest'] = null;
  for (const site of sites) {
    for (const cell of site.hours) {
      if (cell.level === null) continue;
      const count = typeof cell.squads === 'number' ? cell.squads : 0;
      const better = !busiest || cell.level > busiest.level
        || (cell.level === busiest.level && count > (typeof busiest.squads === 'number' ? busiest.squads : 0));
      if (better) busiest = { ...slotOf(cell), siteId: site.id, siteName: site.name, squads: cell.squads };
    }
  }
  const rated = visits.filter(v => v.level !== null);
  const hotspots = sites.flatMap(s => (s.hotspot ? [s.hotspot] : []))
    .sort((a, b) => b.squads - a.squads || b.level - a.level);

  return {
    city, date, dayNote, hours: HOURS,
    kpis: {
      plannedVisitors: shownPeople(all.squads, all.people),
      squads: shownSquads(all.squads),
      busiest,
      offPeakShare: rated.length ? rated.filter(v => v.level! < BUSY_FROM).length / rated.length : null,
      hotspots: hotspots.length,
    },
    byHour: HOURS.map(hour => ({ hour, squads: shownSquads(tally(cityByHour.get(hour) ?? []).squads) })),
    hotspots: hotspots.slice(0, 5),
    sites,
  };
}

/** Squads and people starting a stop at a site inside [start, end): who an advisory for that window reaches */
export function reachOf(stops: PlannedStop[], siteId: string, startMinutes: number, endMinutes: number) {
  const inside = stops.filter(s => s.siteId === siteId && s.minutes >= startMinutes && s.minutes < endMinutes);
  const { squads, people } = tally(inside);
  return { squads, people, includesSample: inside.some(s => s.sample) };
}

/** People who would leave the crunch if the assumed share of squads take the swap (an estimate, not a measurement) */
export const reliefOf = (people: number) => Math.round(people * ADVISORY_PICKUP);

/* Alternatives for an advisory */

const toRad = (deg: number) => deg * Math.PI / 180;

/** Straight-line distance between two sites in km */
export function distanceKm(a: HeritageSite, b: HeritageSite) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export type AlternativeSite = { id: string; name: string; level: number; label: CrowdLabel; km: number; calmUntilMinutes: number | null };
export type AlternativeTime = { hour: number; minutes: number; time: string; level: number; label: CrowdLabel };

/** The hour columns a window touches */
const windowHours = (startMinutes: number, endMinutes: number) =>
  HOURS.filter(h => h * 60 < endMinutes && h * 60 + 60 > startMinutes);

/**
 * A site that stays calm through the whole window and is worth the walk: the lowest projected level, with a small bonus
 * for the site's own "same feel" alternatives and for lesser-known gems, and a penalty for distance.
 */
export function alternativeSiteFor(forecast: OpsForecast, siteId: string, startMinutes: number, endMinutes: number): AlternativeSite | null {
  const origin = SITE_BY_ID.get(siteId);
  const hours = windowHours(startMinutes, endMinutes);
  if (!origin || !hours.length) return null;
  let best: { score: number; found: AlternativeSite } | null = null;
  for (const candidate of forecast.sites) {
    if (candidate.id === siteId) continue;
    const cells = hours.map(h => candidate.hours[h - FIRST_HOUR]);
    if (cells.some(c => c.level === null)) continue;
    const worst = Math.max(...cells.map(c => c.level!));
    if (worst >= BUSY_FROM) continue;
    const km = distanceKm(origin, SITE_BY_ID.get(candidate.id)!);
    const score = worst + km * 8 - (origin.alternatives.includes(candidate.id) ? 6 : 0) - (candidate.gem ? 3 : 0);
    if (!best || score < best.score) {
      best = { score, found: { id: candidate.id, name: candidate.name, level: worst, label: labelFor(worst), km: Math.round(km * 10) / 10, calmUntilMinutes: calmUntil(candidate, hours[0]) } };
    }
  }
  return best?.found ?? null;
}

/** When a site stops being calm after an hour: the start of its first busy or closed hour; null if it stays calm all day */
function calmUntil(site: SiteForecast, fromHour: number): number | null {
  for (let hour = fromHour; hour <= LAST_HOUR; hour++) {
    const cell = site.hours[hour - FIRST_HOUR];
    if (cell.level === null || cell.level >= BUSY_FROM) return hour * 60;
  }
  return null;
}

/** A calmer time to visit the same site: the nearest hour outside the window that is below "busy" */
export function alternativeTimeFor(forecast: OpsForecast, siteId: string, startMinutes: number, endMinutes: number): AlternativeTime | null {
  const site = forecast.sites.find(s => s.id === siteId);
  const heritage = SITE_BY_ID.get(siteId);
  if (!site || !heritage) return null;
  const inside = new Set(windowHours(startMinutes, endMinutes));
  let best: { score: number; found: AlternativeTime } | null = null;
  for (const cell of site.hours) {
    if (cell.level === null || cell.level >= BUSY_FROM || inside.has(cell.hour)) continue;
    const gap = cell.hour * 60 >= endMinutes ? cell.hour * 60 - endMinutes : startMinutes - (cell.hour * 60 + 60);
    const score = cell.level + Math.max(0, gap) / 60 * 3;
    if (best && score >= best.score) continue;
    const minutes = firstOpenMinute(heritage, cell.hour, forecast.date);
    best = { score, found: { hour: cell.hour, minutes, time: formatTime(minutes), level: cell.level, label: cell.label } };
  }
  return best?.found ?? null;
}

/** The window an advisory defaults to: the site's hotspot, else the two hours from the peak */
export function defaultWindow(site: SiteForecast): { startMinutes: number; endMinutes: number } | null {
  if (site.hotspot) return { startMinutes: site.hotspot.startMinutes, endMinutes: site.hotspot.endMinutes };
  if (!site.peak) return null;
  return { startMinutes: site.peak.hour * 60, endMinutes: (site.peak.hour + 2) * 60 };
}

/** The highest projected level a site reaches inside a window (null if closed throughout) */
export function peakInWindow(site: SiteForecast, startMinutes: number, endMinutes: number): number | null {
  const levels = windowHours(startMinutes, endMinutes).map(h => site.hours[h - FIRST_HOUR].level).filter((l): l is number => l !== null);
  return levels.length ? Math.max(...levels) : null;
}

