// How a festival moves the crowd at a heritage site: the lookups heritage/crowd.ts uses inside levelAt. Pure, and it
// imports only the calendar, so the crowd model can depend on it without a cycle.
import { EVENTS, type Impact, type MewarEvent, type Occurrence } from './calendar.ts';
import { datesBetween } from './dates.ts';

/** Crowds build and ease over this long either side of an event's window, so a forecast curve never has a cliff */
export const RAMP_MINUTES = 30;

type Entry = { event: MewarEvent; occurrence: Occurrence; impact: Impact };

/** Impacts by "siteId|date" */
const BY_SITE_DATE = new Map<string, Entry[]>();
/** Events with at least one impact on a date */
const BY_DATE = new Map<string, MewarEvent[]>();

/** The impacts that apply on one day of a run: `peakOnly` impacts wait for the main days when the run lists any */
export const impactsOn = (event: MewarEvent, occurrence: Occurrence, date: string): Impact[] =>
  event.impacts.filter(impact => !impact.peakOnly || !occurrence.peak?.length || occurrence.peak.includes(date));

for (const event of EVENTS) {
  for (const occurrence of event.occurrences) {
    for (const date of datesBetween(occurrence.from, occurrence.to)) {
      for (const impact of impactsOn(event, occurrence, date)) {
        const key = `${impact.siteId}|${date}`;
        BY_SITE_DATE.set(key, [...(BY_SITE_DATE.get(key) ?? []), { event, occurrence, impact }]);
        const today = BY_DATE.get(date) ?? [];
        if (!today.includes(event)) BY_DATE.set(date, [...today, event]);
      }
    }
  }
}

/** 1 inside the window, easing to 0 over RAMP_MINUTES either side */
function weight(minutes: number, from: number, to: number) {
  if (minutes < from - RAMP_MINUTES || minutes >= to + RAMP_MINUTES) return 0;
  if (minutes < from) return (minutes - (from - RAMP_MINUTES)) / RAMP_MINUTES;
  if (minutes >= to) return 1 - (minutes - to) / RAMP_MINUTES;
  return 1;
}

export type Lift = {
  /** Multiplier on the usual level, 1 when nothing is on */
  factor: number;
  /** The level never reads below this while the event runs */
  floor: number;
  /** The site is open for the event whatever its usual hours say */
  opens: boolean;
  /** The events behind it, strongest first */
  events: { id: string; name: string; note: string }[];
};

/** Nothing on: what the model used before festivals were added */
export const NO_LIFT: Lift = { factor: 1, floor: 0, opens: false, events: [] };

/** What the festivals on `date` do to a site at a minute of the day. Overlapping events don't stack: the strongest wins. */
export function eventLift(siteId: string, minutes: number, date: string | null): Lift {
  if (!date) return NO_LIFT;
  const entries = BY_SITE_DATE.get(`${siteId}|${date}`);
  if (!entries) return NO_LIFT;
  let factor = 1;
  let floor = 0;
  let opens = false;
  const hits: { id: string; name: string; note: string; strength: number }[] = [];
  for (const { event, impact } of entries) {
    const w = weight(minutes, impact.from, impact.to);
    if (w === 0) continue;
    const lifted = 1 + (impact.factor - 1) * w;
    factor = Math.max(factor, lifted);
    floor = Math.max(floor, (impact.floor ?? 0) * w);
    opens ||= Boolean(impact.opens) && minutes >= impact.from && minutes < impact.to;
    hits.push({ id: event.id, name: event.name, note: impact.note, strength: lifted });
  }
  if (!hits.length) return NO_LIFT;
  hits.sort((a, b) => b.strength - a.strength);
  const seen = new Set<string>();
  const events = hits.filter(hit => !seen.has(hit.id) && seen.add(hit.id)).map(({ id, name, note }) => ({ id, name, note }));
  return { factor, floor, opens, events };
}

export type SiteEvent = {
  id: string;
  name: string;
  nameHi: string;
  /** Finishes "it’s …" */
  phrase: string;
  /** The widest window the event touches this site on that day */
  from: number;
  to: number;
  note: string;
};

/** The events that touch a site on a date, with the hours they do, strongest first */
export function siteEvents(siteId: string, date: string | null): SiteEvent[] {
  const entries = date ? BY_SITE_DATE.get(`${siteId}|${date}`) : undefined;
  if (!entries) return [];
  const byEvent = new Map<string, SiteEvent & { strength: number }>();
  for (const { event, impact } of entries) {
    const known = byEvent.get(event.id);
    if (!known) {
      byEvent.set(event.id, { id: event.id, name: event.name, nameHi: event.nameHi, phrase: event.phrase, from: impact.from, to: impact.to, note: impact.note, strength: impact.factor });
    } else {
      known.from = Math.min(known.from, impact.from);
      known.to = Math.max(known.to, impact.to);
      if (impact.factor > known.strength) {
        known.note = impact.note;
        known.strength = impact.factor;
      }
    }
  }
  return [...byEvent.values()].sort((a, b) => b.strength - a.strength).map(({ strength: _, ...rest }) => rest);
}

/** "Rath Yatra", "Holi and Holika Dahan": the festivals that move the crowd somewhere in the city on a date, or null */
export function eventReason(date: string | null): string | null {
  const today = date ? BY_DATE.get(date) : undefined;
  if (!today?.length) return null;
  return today.map(event => event.phrase).join(' and ');
}

/** The event a stop was added from, found by its title (stops added from the calendar keep the event's own title) */
const BY_STOP_TITLE = new Map(EVENTS.flatMap(event => (event.stop ? [[event.stop.title.toLowerCase(), event] as const] : [])));

export function eventForStop(title: string): MewarEvent | null {
  return BY_STOP_TITLE.get(title.trim().toLowerCase()) ?? null;
}
