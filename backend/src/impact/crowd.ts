// Crowd-hours avoided: planning a heritage visit for a quiet hour keeps the squad out of the crush, and that is an
// impact worth counting. For each timed heritage stop we compare the crowd at the planned time with the site's busiest
// hour that day. Pure functions on top of the heritage module's forecasts.
import { BUSY_FROM, crowdForStop, type CrowdLabel } from '../heritage/crowd.ts';
import type { HeritageCity, SiteKind } from '../heritage/sites.ts';
import { round1 } from './emissions.ts';

export type ImpactStop = {
  id: string;
  dayNumber: number;
  /** "05:30 PM", or empty when the stop has no time */
  time: string;
  minutes: number;
  title: string;
  tag: string;
  place: string;
};

/** A meal or a check-in near a ghat isn't a visit to it (same rule as the itinerary's crowd meter) */
const CROWDLESS_TAGS = new Set(['Food', 'Stay', 'Travel']);

/** How long a squad typically spends at each kind of site, in minutes */
const VISIT_MINUTES: Record<SiteKind, number> = {
  Palace: 120, Museum: 75, Temple: 45, Haveli: 60, Ghat: 45, Garden: 75, Lake: 60, Viewpoint: 60, Crafts: 90, Bazaar: 75,
};

/** "2026-11-12" for day 3 of a trip starting 2026-11-10; null without dates */
export function dateOfDay(startDate: string | null, day: number): string | null {
  if (!startDate) return null;
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

export type CrowdVisit = {
  stopId: string;
  dayNumber: number;
  title: string;
  siteId: string;
  siteName: string;
  gem: boolean;
  time: string;
  /** 0–100, or null while the site is closed at that time */
  level: number | null;
  label: CrowdLabel;
  /** The site's busiest level that day */
  peak: number;
  /** How much quieter than the busiest hour, 0–100 */
  avoidedPct: number;
  hours: number;
  /** Squad person-hours spent away from the peak crowd */
  crowdHours: number;
  /** The heritage module's nudge for this visit: a quieter time, or a similar site that is quiet then */
  better: { type: 'shift'; time: string; level: number; extraCrowdHours: number } | { type: 'swap'; siteName: string; level: number; extraCrowdHours: number } | null;
};

export type CrowdSmart = {
  heritageStops: number;
  /** Visits at "quiet" hours */
  quietVisits: number;
  /** Visits below the "busy" line: quiet or moderate */
  offPeakVisits: number;
  /** Busy, packed or closed at the planned time */
  peakVisits: number;
  crowdHoursAvoided: number;
  visits: CrowdVisit[];
  /** The best single move, in a sentence */
  tip: string | null;
};

export function crowdSmart(
  stops: ImpactStop[],
  opts: { city: HeritageCity | null; startDate: string | null; squad: number },
): CrowdSmart {
  const squad = Math.max(1, opts.squad);
  const visits: CrowdVisit[] = [];

  for (const stop of stops) {
    if (!stop.time || CROWDLESS_TAGS.has(stop.tag)) continue;
    const taken = stops.filter(o => o.id !== stop.id && o.dayNumber === stop.dayNumber && o.time).map(o => o.minutes);
    const crowd = crowdForStop(
      { title: stop.title, place: stop.place, minutes: stop.minutes },
      { city: opts.city, date: dateOfDay(opts.startDate, stop.dayNumber), taken },
    );
    if (!crowd) continue;

    const peak = Math.max(crowd.level ?? 0, ...crowd.forecast.map(p => p.level ?? 0));
    const avoided = crowd.level === null || peak <= 0 ? 0 : Math.max(0, (peak - crowd.level) / peak);
    const hours = (VISIT_MINUTES[crowd.kind as SiteKind] ?? 60) / 60;
    const nudge = crowd.suggestion && crowd.suggestion.level < (crowd.level ?? peak) ? crowd.suggestion : null;
    // Crowd-hours the squad would also dodge by taking the nudge
    const extra = (level: number) => round1(squad * hours * (((crowd.level ?? peak) - level) / peak));
    visits.push({
      stopId: stop.id,
      dayNumber: stop.dayNumber,
      title: stop.title,
      siteId: crowd.siteId,
      siteName: crowd.siteName,
      gem: crowd.gem,
      time: stop.time,
      level: crowd.level,
      label: crowd.label ?? 'closed',
      peak,
      avoidedPct: Math.round(avoided * 100),
      hours,
      crowdHours: round1(squad * hours * avoided),
      better: !nudge || peak <= 0 ? null
        : nudge.type === 'shift'
          ? { type: 'shift', time: nudge.time, level: nudge.level, extraCrowdHours: extra(nudge.level) }
          : { type: 'swap', siteName: nudge.siteName, level: nudge.level, extraCrowdHours: extra(nudge.level) },
    });
  }

  const best = bestMove(visits);
  return {
    heritageStops: visits.length,
    quietVisits: visits.filter(v => v.label === 'quiet').length,
    offPeakVisits: visits.filter(v => v.level !== null && v.level < BUSY_FROM).length,
    peakVisits: visits.filter(v => v.level === null || v.level >= BUSY_FROM).length,
    crowdHoursAvoided: round1(visits.reduce((total, v) => total + v.crowdHours, 0)),
    visits,
    tip: best ? moveText(best) : null,
  };
}

/** The visit where taking the heritage module's nudge would dodge the most crowd */
export function bestMove(visits: CrowdVisit[]): CrowdVisit | undefined {
  return visits.filter(v => v.better && v.better.extraCrowdHours >= 1).sort((a, b) => b.better!.extraCrowdHours - a.better!.extraCrowdHours)[0];
}

/** "Move City Palace from 12:00 PM to 10:00 AM: the squad dodges 5.5 more crowd-hours." */
export function moveText(visit: CrowdVisit): string {
  const better = visit.better!;
  return better.type === 'shift'
    ? `Move ${visit.siteName} from ${visit.time} to ${better.time} and the squad dodges ${better.extraCrowdHours} more crowd-hours.`
    : `Try ${better.siteName} instead of ${visit.siteName} at ${visit.time}: same feel, quiet then, ${better.extraCrowdHours} more crowd-hours dodged.`;
}
