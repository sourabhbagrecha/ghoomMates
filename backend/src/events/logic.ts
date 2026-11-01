// Mewar Utsav logic: which events fall in a window, how each moves the crowd at the heritage sites it touches (the same
// model as the map and the itinerary), and what a squad can do about it. Pure functions over the calendar and the
// heritage crowd model; the router only adds I/O.
import { BUSY_FROM, formatTime, labelFor, levelAt, type CrowdLabel } from '../heritage/crowd.ts';
import { HERITAGE_CITIES, SITE_BY_ID, SITES, type HeritageSite } from '../heritage/sites.ts';
import { EVENTS, type EventKind, type MewarEvent, type Occurrence } from './calendar.ts';
import { addDays, datesBetween, daysBetween } from './dates.ts';
import { impactsOn } from './lift.ts';

/** How often a window is sampled when looking for its peak */
const SCAN = 15;
const FIRST_MINUTE = 6 * 60;
const LAST_MINUTE = 21 * 60 + 30;
const CITY = HERITAGE_CITIES[0];

/* Clock labels */

const clock = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}`;
};
const meridiem = (minutes: number) => (Math.floor(minutes / 60) % 24 < 12 ? 'AM' : 'PM');

/** "5–10 PM", "11 AM–9:30 PM" */
export function windowLabel(from: number, to: number) {
  return meridiem(from) === meridiem(to)
    ? `${clock(from)}–${clock(to)} ${meridiem(to)}`
    : `${clock(from)} ${meridiem(from)}–${clock(to)} ${meridiem(to)}`;
}

/* The crowd an event brings */

export type QuieterTime = { time: string; minutes: number; level: number; label: CrowdLabel; reason: string };
export type QuieterSite = { id: string; name: string; tag: string; level: number; label: CrowdLabel; reason: string };

export type SiteCrowd = {
  siteId: string;
  siteName: string;
  kind: string;
  gem: boolean;
  /** The span of hours the event touches this site, and each stretch of it (dawn and dusk, say) */
  from: number;
  to: number;
  windows: { from: number; to: number }[];
  /** "5–10 PM", or "5:30–8:30 AM, 5–9 PM" */
  windowLabel: string;
  /** Days of the run on which it does (the main days only, for some events) */
  dates: string[];
  /** The day these numbers are for: today when the event touches the site today, else the next day it does */
  date: string;
  note: string;
  peak: { minutes: number; time: string; level: number; label: CrowdLabel };
  /** The same minute on an ordinary day of that season, for comparison */
  usual: { level: number | null; label: CrowdLabel };
  /** Hour by hour across the site's opening hours, with and without the event */
  forecast: { time: string; minutes: number; level: number | null; usual: number | null }[];
  quieterTime: QuieterTime | null;
  quieterSite: QuieterSite | null;
};

export type CalmSite = { id: string; name: string; kind: string; gem: boolean; level: number; label: CrowdLabel; km: number };

export type EventCrowd = {
  /** The day the busiest site's numbers are for */
  date: string;
  label: CrowdLabel;
  /** The highest level across the touched sites; null when the number comes from the curated note alone */
  level: number | null;
  headline: string;
  /** From the heritage model (true) or the event's own curated intensity (false) */
  modelled: boolean;
  sites: SiteCrowd[];
  /** Other sites that stay calm through the peak, nearest first */
  calm: CalmSite[];
};

const toRad = (deg: number) => deg * Math.PI / 180;

function distanceKm(a: HeritageSite, b: HeritageSite) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Hourly levels across opening hours, with the festival and without it */
function hourly(site: HeritageSite, date: string) {
  const out: SiteCrowd['forecast'] = [];
  for (let m = FIRST_MINUTE; m <= LAST_MINUTE - 30; m += 60) {
    const at = (withEvents: boolean) => levelAt(site, m, date, withEvents) ?? levelAt(site, m + 30, date, withEvents);
    out.push({ time: formatTime(m), minutes: m, level: at(true), usual: at(false) });
  }
  const first = out.findIndex(p => p.level !== null);
  const last = out.findLastIndex(p => p.level !== null);
  return first === -1 ? [] : out.slice(first, last + 1);
}

type Window = { from: number; to: number };

/** Overlapping or touching stretches of the day joined into one */
function mergeWindows(windows: Window[]): Window[] {
  const out: Window[] = [];
  for (const w of [...windows].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else out.push({ from: w.from, to: w.to });
  }
  return out;
}

const inside = (windows: Window[], minutes: number, slack = 0) => windows.some(w => minutes > w.from - slack && minutes < w.to + slack);

/** The nearest clearly quieter time outside the event's hours, on the same day */
function quieterTimeFor(site: HeritageSite, date: string, peak: SiteCrowd['peak'], windows: Window[]): QuieterTime | null {
  let best: { minutes: number; level: number; score: number } | null = null;
  for (let m = FIRST_MINUTE; m <= LAST_MINUTE; m += 30) {
    if (inside(windows, m, 30)) continue;
    const level = levelAt(site, m, date);
    if (level === null || level >= BUSY_FROM || level > peak.level - 20) continue;
    const score = level + Math.abs(m - peak.minutes) / 10;
    if (!best || score < best.score) best = { minutes: m, level, score };
  }
  if (!best) return null;
  const fewer = Math.round((peak.level - best.level) / peak.level * 100);
  return { time: formatTime(best.minutes), minutes: best.minutes, level: best.level, label: labelFor(best.level), reason: `${fewer}% fewer people than at ${peak.time}` };
}

/** A similar site that is quiet at the peak, from the site's own "same feel" list */
function quieterSiteFor(site: HeritageSite, date: string, peak: SiteCrowd['peak']): QuieterSite | null {
  const found = site.alternatives
    .map(id => SITE_BY_ID.get(id))
    .filter((alt): alt is HeritageSite => Boolean(alt))
    .map(alt => ({ alt, level: levelAt(alt, peak.minutes, date) }))
    .filter((o): o is { alt: HeritageSite; level: number } => o.level !== null && o.level < BUSY_FROM)
    .sort((a, b) => a.level - b.level)[0];
  if (!found) return null;
  const label = labelFor(found.level);
  return {
    id: found.alt.id, name: found.alt.name, tag: found.alt.tag, level: found.level, label,
    reason: `${found.alt.name} has the same feel and is ${label} at ${peak.time}`,
  };
}

type Watched = { site: HeritageSite; date: string; windows: Window[]; note: string; dates: string[] };

/** The day a site's numbers are for: today when the event touches it today, else the run's main day, else the next day it does */
const siteDate = (dates: string[], today: string, main?: string) =>
  dates.includes(today) ? today : main && dates.includes(main) ? main : (dates.find(d => d > today) ?? dates[0]);

/**
 * The sites an event touches and their hours, each on the day that matters for it. Events with impacts use those; one
 * without (a nightly show) watches the heritage sites among its places during its own hours.
 */
function watchedSites(event: MewarEvent, occurrence: Occurrence | null, today: string): Watched[] {
  const watched: Watched[] = [];
  if (event.impacts.length) {
    if (!occurrence) return [];
    const days = datesBetween(occurrence.from, occurrence.to);
    for (const siteId of new Set(event.impacts.map(i => i.siteId))) {
      const site = SITE_BY_ID.get(siteId);
      const dates = days.filter(date => impactsOn(event, occurrence, date).some(i => i.siteId === siteId));
      if (!site || !dates.length) continue;
      const date = siteDate(dates, today, occurrence.peak?.[0]);
      const impacts = impactsOn(event, occurrence, date).filter(i => i.siteId === siteId);
      const strongest = impacts.reduce((top, i) => (i.factor > top.factor ? i : top), impacts[0]);
      watched.push({ site, date, windows: mergeWindows(impacts), note: strongest.note, dates });
    }
  } else {
    const dates = occurrence ? datesBetween(occurrence.from, occurrence.to) : [];
    for (const place of event.places) {
      const site = place.siteId ? SITE_BY_ID.get(place.siteId) : undefined;
      if (site) watched.push({ site, date: occurrence ? siteDate(dates, today, occurrence.peak?.[0]) : today, windows: [{ from: event.time.from, to: event.time.to }], note: event.crowdNote, dates });
    }
  }
  return watched;
}

function siteCrowd({ site, date, windows, note, dates }: Watched): SiteCrowd | null {
  let peak: SiteCrowd['peak'] | null = null;
  for (const w of windows) {
    for (let m = w.from; m <= w.to; m += SCAN) {
      const level = levelAt(site, m, date);
      if (level !== null && (!peak || level > peak.level)) peak = { minutes: m, time: formatTime(m), level, label: labelFor(level) };
    }
  }
  if (!peak) return null;
  const usual = levelAt(site, peak.minutes, date, false);
  return {
    siteId: site.id, siteName: site.name, kind: site.kind, gem: site.gem,
    from: windows[0].from, to: windows[windows.length - 1].to, windows,
    windowLabel: windows.map(w => windowLabel(w.from, w.to)).join(', '),
    dates, date, note,
    peak, usual: { level: usual, label: labelFor(usual) },
    forecast: hourly(site, date),
    quieterTime: quieterTimeFor(site, date, peak, windows),
    quieterSite: quieterSiteFor(site, date, peak),
  };
}

/** Sites outside the event that are open and calm around the peak, preferring gems and short trips from the busiest site */
function calmSites(origin: SiteCrowd, touched: Set<string>): CalmSite[] {
  const from = SITE_BY_ID.get(origin.siteId)!;
  const times = [origin.peak.minutes - 60, origin.peak.minutes, origin.peak.minutes + 60];
  const options: (CalmSite & { score: number })[] = [];
  for (const site of SITES) {
    if (touched.has(site.id)) continue;
    const levels = times.map(m => levelAt(site, m, origin.date));
    if (levels.some(l => l === null)) continue;
    const worst = Math.max(...(levels as number[]));
    if (worst >= BUSY_FROM) continue;
    const km = distanceKm(from, site);
    options.push({
      id: site.id, name: site.name, kind: site.kind, gem: site.gem, level: worst, label: labelFor(worst), km: Math.round(km * 10) / 10,
      score: worst + km * 8 - (site.gem ? 3 : 0),
    });
  }
  return options.sort((a, b) => a.score - b.score).slice(0, 3).map(({ score: _, ...rest }) => rest);
}

/**
 * How an event moves the crowd, from the same model as the heritage map. Each touched site is measured on the day that
 * matters for it: today if the event is on at the site today, else the next day it is.
 */
export function crowdFor(event: MewarEvent, occurrence: Occurrence | null, today: string): EventCrowd {
  // Busiest first; where two tie (a lot of sites hit 100), the one the event names first, so the headline site is the story's
  const rank = (siteId: string) => {
    const at = event.places.findIndex(p => p.siteId === siteId);
    return at === -1 ? event.places.length : at;
  };
  const sites = watchedSites(event, occurrence, today)
    .map(siteCrowd)
    .filter((s): s is SiteCrowd => s !== null)
    .sort((a, b) => b.peak.level - a.peak.level || rank(a.siteId) - rank(b.siteId));
  if (!sites.length) {
    const date = occurrence ? (today >= occurrence.from && today <= occurrence.to ? today : (occurrence.peak?.[0] ?? occurrence.from)) : today;
    return { date, label: event.intensity, level: null, headline: event.crowdNote, modelled: false, sites: [], calm: [] };
  }
  const top = sites[0];
  return {
    date: top.date, label: top.peak.label, level: top.peak.level, headline: event.crowdNote, modelled: true,
    sites, calm: calmSites(top, new Set(sites.map(s => s.siteId))),
  };
}

/* Listing events */

export type PlaceView = { name: string; siteId: string | null; lat: number | null; lng: number | null };

export type EventBase = {
  id: string;
  name: string;
  nameHi: string;
  kind: EventKind;
  time: MewarEvent['time'];
  places: PlaceView[];
  significance: string;
  join: MewarEvent['join'];
  tips: string[];
  price: string | null;
  /** What "Add to our itinerary" adds, or null when the event can't be added */
  stop: { title: string; time: string; place: string } | null;
  sources: MewarEvent['sources'];
};

export type EventInstance = EventBase & {
  /** One per run: "diwali@2026-11-06" */
  key: string;
  from: string;
  to: string;
  /** The main days of the run */
  peak: string[];
  datesBasis: string;
  status: 'ongoing' | 'today' | 'tomorrow' | 'upcoming' | 'past';
  /** Days from today to the first day; negative once it has begun */
  daysAway: number;
  /** For the itinerary tip when a trip overlaps; {day} stands for "Day 2" */
  tripTip: string | null;
  crowd: EventCrowd;
};

export type RecurringEvent = EventBase & { recurring: 'daily'; crowd: EventCrowd };
export type UndatedEvent = EventBase & { datesNote: string };

export type EventList = {
  city: string;
  today: string;
  from: string;
  to: string;
  items: EventInstance[];
  recurring: RecurringEvent[];
  undated: UndatedEvent[];
};

function baseOf(event: MewarEvent): EventBase {
  return {
    id: event.id, name: event.name, nameHi: event.nameHi, kind: event.kind, time: event.time,
    places: event.places.map(place => {
      const site = place.siteId ? SITE_BY_ID.get(place.siteId) : undefined;
      return { name: place.name, siteId: place.siteId ?? null, lat: place.lat ?? site?.lat ?? null, lng: place.lng ?? site?.lng ?? null };
    }),
    significance: event.significance, join: event.join, tips: event.tips, price: event.price ?? null,
    stop: event.stop && { title: event.stop.title, time: event.stop.time, place: event.stop.place },
    sources: event.sources,
  };
}

function statusOf(today: string, from: string, to: string): EventInstance['status'] {
  if (to < today) return 'past';
  if (from < today) return 'ongoing';
  if (from === today) return 'today';
  return daysBetween(today, from) === 1 ? 'tomorrow' : 'upcoming';
}

export function instanceOf(event: MewarEvent, occurrence: Occurrence, today: string): EventInstance {
  return {
    ...baseOf(event),
    key: `${event.id}@${occurrence.from}`,
    from: occurrence.from, to: occurrence.to, peak: occurrence.peak ?? [], datesBasis: occurrence.basis,
    status: statusOf(today, occurrence.from, occurrence.to),
    daysAway: daysBetween(today, occurrence.from),
    tripTip: event.tripTip ?? null,
    crowd: crowdFor(event, occurrence, today),
  };
}

/** Events with a run that touches [from, to], plus the nightly shows and the events whose dates aren't out yet */
export function listEvents({ from, to, today }: { from: string; to: string; today: string }): EventList {
  const items: EventInstance[] = [];
  const recurring: RecurringEvent[] = [];
  const undated: UndatedEvent[] = [];
  for (const event of EVENTS) {
    if (event.recurring) {
      recurring.push({ ...baseOf(event), recurring: event.recurring, crowd: crowdFor(event, null, today) });
    } else if (!event.occurrences.length) {
      undated.push({ ...baseOf(event), datesNote: event.datesNote ?? 'Dates announced closer to the time' });
    }
    for (const occurrence of event.occurrences) {
      if (occurrence.to >= from && occurrence.from <= to) items.push(instanceOf(event, occurrence, today));
    }
  }
  items.sort((a, b) => a.from.localeCompare(b.from) || a.time.from - b.time.from || a.name.localeCompare(b.name));
  return { city: CITY, today, from, to, items, recurring, undated };
}

/** True when the event is on that day: a run covers it, a nightly show always is, and an event with no dates yet might be */
export function runsOn(event: MewarEvent, date: string) {
  if (event.recurring || !event.occurrences.length) return true;
  return event.occurrences.some(o => date >= o.from && date <= o.to);
}

export const DEFAULT_SPAN_DAYS = 120;
export const MAX_SPAN_DAYS = 800;

export function defaultRange(today: string) {
  return { from: today, to: addDays(today, DEFAULT_SPAN_DAYS) };
}
