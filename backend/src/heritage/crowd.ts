// Crowd forecasts for heritage sites, and the nudges that move a squad off-peak. Pure functions, no I/O,
// so the API, the itinerary and the voice agent all share them.
import { NO_LIFT, eventForStop, eventLift, eventReason, siteEvents, type SiteEvent } from '../events/lift.ts';
import { HERITAGE_CITIES, SITE_BY_ID, SITES, type HeritageCity, type HeritageSite } from './sites.ts';

export type CrowdLabel = 'quiet' | 'moderate' | 'busy' | 'packed' | 'closed';

export const QUIET_BELOW = 40;
export const BUSY_FROM = 65;
export const PACKED_FROM = 82;
const STEP = 30;
const EARLIEST = 6 * 60;
const LATEST = 21 * 60 + 30;

// Days when the whole city fills up beyond a normal weekend. Site-by-site festival crowds (Rath Yatra at Jagdish Temple,
// Gangaur at the ghat) live in events/calendar.ts and multiply on top of this.
const FESTIVALS: { from: string; to: string; factor: number; name: string }[] = [
  { from: '2026-11-06', to: '2026-11-10', factor: 1.2, name: 'Diwali' },
  { from: '2026-12-23', to: '2027-01-02', factor: 1.3, name: 'the year-end holidays' },
  { from: '2027-10-27', to: '2027-10-31', factor: 1.2, name: 'Diwali' },
  { from: '2027-12-23', to: '2028-01-02', factor: 1.3, name: 'the year-end holidays' },
];

export function cityOf(destination?: string | null): HeritageCity | null {
  const text = (destination ?? '').toLowerCase();
  return HERITAGE_CITIES.find(c => text.includes(c.toLowerCase())) ?? null;
}

export const sitesIn = (city: HeritageCity) => SITES.filter(s => s.city === city);

/** The heritage site a stop is about: the alias that appears earliest in its title, else in its place */
export function matchSite(title: string, place: string, city: HeritageCity): HeritageSite | null {
  for (const text of [title, place]) {
    const lower = text.toLowerCase();
    let best: { site: HeritageSite; at: number } | null = null;
    for (const site of sitesIn(city)) {
      for (const alias of site.aliases) {
        const at = lower.indexOf(alias);
        if (at !== -1 && (!best || at < best.at)) best = { site, at };
      }
    }
    if (best) return best.site;
  }
  return null;
}

export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const festivalOn = (date: string) => FESTIVALS.find(f => date >= f.from && date <= f.to);

/** How much busier than a peak-season weekday: weekends, festivals, the summer and monsoon lulls */
export function dayFactor(date: string | null): { factor: number; reason: string | null } {
  if (!date) return { factor: 1, reason: null };
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return { factor: 1, reason: null };
  const festival = festivalOn(date);
  if (festival) return { factor: festival.factor, reason: festival.name };
  const month = day.getUTCMonth();
  const season = month >= 3 && month <= 5 ? 0.65 : month >= 6 && month <= 8 ? 0.85 : 1;
  const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
  return { factor: season * (weekend ? 1.12 : 1), reason: weekend ? 'weekend' : null };
}

/** What the day is called on a traveller's screen: a festival period, else the festivals on, else "weekend" */
export function dayNoteFor(date: string | null): string | null {
  if (!date) return null;
  return festivalOn(date)?.name ?? eventReason(date) ?? dayFactor(date).reason;
}

const hasUsualHours = (site: HeritageSite, minutes: number) => site.hours.some(([open, close]) => minutes >= open && minutes < close);

/** Open at that minute: in its usual hours or, on the day of a festival that opens it late, in the festival's */
export const isOpen = (site: HeritageSite, minutes: number, date: string | null = null) =>
  hasUsualHours(site, minutes) || eventLift(site.id, minutes, date).opens;

/**
 * 0–100, or null while the site is closed. A festival that day lifts the usual level at the sites and hours it touches
 * (events/calendar.ts); pass `withEvents: false` for the level without it.
 */
export function levelAt(site: HeritageSite, minutes: number, date: string | null, withEvents = true): number | null {
  const lift = withEvents ? eventLift(site.id, minutes, date) : NO_LIFT;
  if (!hasUsualHours(site, minutes) && !lift.opens) return null;
  const hour = Math.floor(minutes / 60);
  const from = site.curve[hour];
  const to = site.curve[(hour + 1) % 24] || from;
  const base = from + (to - from) * (minutes % 60) / 60;
  return Math.max(0, Math.min(100, Math.round(Math.max(base * dayFactor(date).factor * lift.factor, lift.floor))));
}

export function labelFor(level: number | null): CrowdLabel {
  if (level === null) return 'closed';
  return level >= PACKED_FROM ? 'packed' : level >= BUSY_FROM ? 'busy' : level >= QUIET_BELOW ? 'moderate' : 'quiet';
}

/** Rough ticket-and-entry queue */
export const waitMinutes = (level: number | null) => (level === null || level < 50 ? 0 : Math.round((level - 45) * 0.9 / 5) * 5);

function openSlots(site: HeritageSite, date: string | null, from = EARLIEST, to = LATEST) {
  const slots: number[] = [];
  for (let m = Math.ceil(from / STEP) * STEP; m <= to; m += STEP) if (isOpen(site, m, date)) slots.push(m);
  return slots;
}

/** The quietest half-hour of the day, earliest on a tie */
export function bestWindow(site: HeritageSite, date: string | null) {
  let best: { minutes: number; level: number } | null = null;
  for (const minutes of openSlots(site, date)) {
    const level = levelAt(site, minutes, date)!;
    if (!best || level < best.level) best = { minutes, level };
  }
  return best && { time: formatTime(best.minutes), minutes: best.minutes, level: best.level };
}

/** Hourly levels across the site's opening hours, for the stop's crowd chart */
export function forecast(site: HeritageSite, date: string | null) {
  const out: { time: string; minutes: number; level: number | null }[] = [];
  for (let m = EARLIEST; m <= LATEST - 30; m += 60) {
    const level = levelAt(site, m, date) ?? levelAt(site, m + 30, date);
    out.push({ time: formatTime(m), minutes: m, level });
  }
  // Trim closed hours at either end
  const first = out.findIndex(p => p.level !== null);
  const last = out.findLastIndex(p => p.level !== null);
  return first === -1 ? [] : out.slice(first, last + 1);
}

export type Suggestion =
  | { type: 'shift'; time: string; minutes: number; level: number; label: CrowdLabel; reason: string }
  | { type: 'swap'; siteId: string; siteName: string; title: string; place: string; tag: string; notes: string; level: number; label: CrowdLabel; reason: string };

/**
 * A nudge for a stop that lands in a crowd or a closed hour: first the nearest clearly quieter time that doesn't
 * clash with the squad's other stops that day, else a similar lesser-known site that's quiet at the same time.
 */
export function suggestFor(site: HeritageSite, minutes: number, date: string | null, taken: number[] = []): Suggestion | null {
  const level = levelAt(site, minutes, date);
  if (level !== null && level < BUSY_FROM) return null;

  let shift: { minutes: number; level: number; score: number } | null = null;
  for (const m of openSlots(site, date, minutes - 180, minutes + 180)) {
    if (m === minutes || taken.some(t => Math.abs(t - m) < 50)) continue;
    const l = levelAt(site, m, date)!;
    if (l >= BUSY_FROM || (level !== null && l > level - 20)) continue;
    const score = l + Math.abs(m - minutes) / 10;
    if (!shift || score < shift.score) shift = { minutes: m, level: l, score };
  }
  const swap = site.alternatives
    .map(id => SITE_BY_ID.get(id)!)
    .map(alt => ({ alt, level: levelAt(alt, minutes, date) }))
    .filter((s): s is { alt: HeritageSite; level: number } => s.level !== null && s.level < BUSY_FROM)
    .sort((a, b) => a.level - b.level)[0];

  // Going earlier or later wins unless it only gets the squad to "moderate" and a similar spot is clearly quieter,
  // e.g. a sunset viewpoint: moving to 3 PM loses the sunset, another hilltop keeps it.
  if (shift && (!swap || shift.level < 50 || swap.level >= shift.level - 10)) {
    const reason = level === null
      ? `${site.name} is closed at ${formatTime(minutes)}`
      : `${Math.round((level - shift.level) / level * 100)}% fewer people than at ${formatTime(minutes)}`;
    return { type: 'shift', time: formatTime(shift.minutes), minutes: shift.minutes, level: shift.level, label: labelFor(shift.level), reason };
  }
  if (!swap) return null;
  return {
    type: 'swap', siteId: swap.alt.id, siteName: swap.alt.name, title: swap.alt.visitTitle, place: swap.alt.name, tag: swap.alt.tag,
    notes: swap.alt.care, level: swap.level, label: labelFor(swap.level),
    reason: `${site.name} is ${level === null ? 'closed' : labelFor(level)} then; ${swap.alt.name} has the same feel and is ${labelFor(swap.level)}`,
  };
}

export type StopCrowd = {
  siteId: string;
  siteName: string;
  kind: string;
  gem: boolean;
  /** Null when the stop has no time, or the site is closed then */
  level: number | null;
  label: CrowdLabel | null;
  waitMinutes: number;
  best: { time: string; minutes: number; level: number } | null;
  forecast: { time: string; minutes: number; level: number | null }[];
  dayNote: string | null;
  story: string;
  care: string;
  suggestion: Suggestion | null;
  /** Festivals that lift this site's crowd that day (events/calendar.ts), strongest first */
  events: SiteEvent[];
};

/** Crowd facts for one itinerary stop, or null when it isn't a known heritage site */
export function crowdForStop(
  stop: { title: string; place: string; minutes: number | null },
  opts: { city: HeritageCity | null; date: string | null; taken?: number[] },
): StopCrowd | null {
  if (!opts.city) return null;
  const site = matchSite(stop.title, stop.place, opts.city);
  if (!site) return null;
  const { date } = opts;
  const level = stop.minutes === null ? null : levelAt(site, stop.minutes, date);
  const best = bestWindow(site, date);
  let suggestion = stop.minutes === null ? null : suggestFor(site, stop.minutes, date, opts.taken);
  if (stop.minutes === null && best) {
    suggestion = { type: 'shift', time: best.time, minutes: best.minutes, level: best.level, label: labelFor(best.level), reason: 'The quietest time of the day' };
  }
  // A stop added from the festival calendar keeps the event's own time (the procession, the show), so there is nothing to move
  const fromEvent = eventForStop(stop.title);
  if (fromEvent?.stop?.fixedTime) suggestion = null;
  const events = siteEvents(site.id, date);
  // A festival period, else the festivals that touch this very site, else the weekend
  const reason = (date && festivalOn(date)?.name) || (events.length ? events.map(e => e.phrase).join(' and ') : null) || dayFactor(date).reason;
  return {
    siteId: site.id, siteName: site.name, kind: site.kind, gem: site.gem,
    level, label: stop.minutes === null ? null : labelFor(level), waitMinutes: waitMinutes(level),
    best, forecast: forecast(site, date),
    dayNote: reason ? `Busier than usual: it’s ${reason}` : null,
    story: site.story, care: fromEvent?.stop?.care ?? site.care, suggestion, events,
  };
}

/** Today's date and the minute of the day in India */
export function indiaNow(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { date: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

// Small deterministic wobble so the live view moves every few minutes like a real feed
function jitter(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 9) - 4;
}

export type LiveSite = {
  id: string;
  name: string;
  kind: string;
  gem: boolean;
  lat: number;
  lng: number;
  level: number | null;
  label: CrowdLabel;
  trend: 'rising' | 'falling' | 'steady';
  waitMinutes: number;
  /** Next quiet half-hour later today, if any */
  quietAt: string | null;
  best: { time: string; level: number } | null;
  story: string;
  care: string;
  /** Festivals that lift this site's crowd today, with the hours */
  events: SiteEvent[];
};

/** Every site in the city right now, busiest first */
export function liveCrowds(city: HeritageCity, now = new Date()) {
  const { date, minutes } = indiaNow(now);
  const sites: LiveSite[] = sitesIn(city).map(site => {
    const raw = levelAt(site, minutes, date);
    const level = raw === null ? null : Math.max(0, Math.min(100, raw + jitter(`${site.id}:${Math.floor(minutes / 5)}`)));
    const later = levelAt(site, minutes + 60, date);
    const trend = level === null || later === null ? 'steady' : later - level > 6 ? 'rising' : level - later > 6 ? 'falling' : 'steady';
    const quiet = level !== null && level < QUIET_BELOW
      ? null
      : openSlots(site, date, minutes + 1).find(m => levelAt(site, m, date)! < QUIET_BELOW);
    const best = bestWindow(site, date);
    return {
      id: site.id, name: site.name, kind: site.kind, gem: site.gem, lat: site.lat, lng: site.lng,
      level, label: labelFor(level), trend, waitMinutes: waitMinutes(level),
      quietAt: quiet === undefined || quiet === null ? null : formatTime(quiet),
      best: best && { time: best.time, level: best.level },
      story: site.story, care: site.care, events: siteEvents(site.id, date),
    };
  });
  sites.sort((a, b) => (b.level ?? -1) - (a.level ?? -1));
  const open = sites.filter(s => s.level !== null);
  return {
    city, date, time: formatTime(minutes),
    dayNote: dayNoteFor(date),
    packed: open.filter(s => s.level! >= BUSY_FROM).length,
    quiet: open.filter(s => s.level! < QUIET_BELOW).length,
    sites,
  };
}

/** Quiet and packed windows for every site, for the itinerary prompt */
export function crowdBrief(city: HeritageCity, date: string | null) {
  const ranges = (site: HeritageSite) => {
    const busy = openSlots(site, date).filter(m => levelAt(site, m, date)! >= BUSY_FROM);
    const spans: [number, number][] = [];
    for (const m of busy) {
      const last = spans.at(-1);
      if (last && m - last[1] <= STEP) last[1] = m;
      else spans.push([m, m]);
    }
    return spans.map(([a, b]) => `${formatTime(a)}–${formatTime(b + STEP)}`).join(', ');
  };
  return sitesIn(city).map(site => {
    const best = bestWindow(site, date);
    const busy = ranges(site);
    return `- ${site.name}${site.gem ? ' (lesser-known gem)' : ''}: quietest ~${best?.time ?? 'n/a'}${busy ? `; crowded ${busy}` : '; rarely crowded'}`;
  }).join('\n');
}
