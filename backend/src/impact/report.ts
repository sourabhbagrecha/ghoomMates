// Puts the pieces together: a trip's itinerary, expenses, squad and pledges in, the Green Trip report out.
// Pure (no I/O) so the numbers can be tested to the digit; service.ts fetches the inputs and adds Gemini's wording.
import { cityOf } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';
import { crowdSmart, dateOfDay, type CrowdSmart, type ImpactStop } from './crowd.ts';
import {
  FACTORS, MODES, SOURCES, estimateDistances, evaluateLeg, summarize, withRoutes,
  type Footprint, type Leg, type LegSpec, type Mode,
} from './emissions.ts';
import { localSpend, type AiAnswers, type ExpenseRow, type LocalSpend } from './local.ts';
import { locate, type Place } from './places.ts';
import { summarisePledges, type PledgeSummary, type PledgeTick } from './pledges.ts';
import { scoreOf, type Score } from './score.ts';
import { pickSwaps, type Swap } from './swaps.ts';

export const legKey = (fromStopId: string, toStopId: string) => `${fromStopId}:${toStopId}`;

export type ReportInput = {
  trip: { id: string; name: string; groupName: string; destination: string; startDate: string | null; dayTitles: string[] };
  /** In squad order */
  members: { memberId: string; name: string }[];
  /** The caller's trip member id */
  me: string;
  /** Itinerary stops in plan order (day, then time) */
  stops: ImpactStop[];
  /** The squad's picked ride per leg */
  picks: Map<string, Mode>;
  ticks: PledgeTick[];
  expenses: ExpenseRow[];
  /** What Gemini made of expenses the rules couldn't place */
  ai: AiAnswers;
  /** Real distances from the Routes API, by legKey */
  routes?: Map<string, { walkKm?: number; driveKm?: number }>;
};

export type ReportDay = { number: number; title: string; date: string | null; stops: number; kg: number; legs: Leg[] };

export type ImpactReport = {
  tripId: string;
  groupName: string;
  tripName: string;
  destination: string;
  /** The heritage city the estimates cover, or null for a trip elsewhere */
  city: HeritageCity | null;
  squad: { size: number; memberIds: string[] };
  footprint: Footprint & {
    days: ReportDay[];
    /** Stops we could place on the map, of all stops */
    located: { stops: number; total: number };
    source: 'estimate' | 'routes' | 'mixed' | 'none';
  };
  crowdSmart: CrowdSmart;
  local: LocalSpend & { classifier: 'rules' | 'rules+gemini' };
  pledges: PledgeSummary;
  score: Score;
  swaps: Swap[];
  method: {
    factors: Record<Mode, { label: string; kgPerVehicleKm: number; seats: number; basis: string }>;
    sources: { id: string; title: string; url: string }[];
  };
  generatedAt: string;
};

/** The rides between consecutive stops of a day where both stops can be placed on the map */
export function legSpecs(stops: ImpactStop[], city: HeritageCity | null): { specs: LegSpec[]; located: number } {
  // A check-out has no place of its own: it is the hotel of the first Stay stop that named one
  let hotel: Place | null = null;
  for (const stop of stops) {
    if (stop.tag !== 'Stay') continue;
    hotel = locate(stop, city, null);
    if (hotel) break;
  }
  const placed = stops.map(stop => ({ stop, place: locate(stop, city, hotel) }));
  const specs: LegSpec[] = [];
  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i];
    const b = placed[i + 1];
    if (a.stop.dayNumber !== b.stop.dayNumber || !a.place || !b.place) continue;
    specs.push({
      fromStopId: a.stop.id, toStopId: b.stop.id, dayNumber: a.stop.dayNumber,
      from: a.place, fromTitle: a.stop.title, to: b.place, toTitle: b.stop.title,
      distances: estimateDistances(a.place, b.place),
    });
  }
  return { specs, located: placed.filter(p => p.place).length };
}

const methodology = () => ({
  factors: Object.fromEntries(MODES.map(m => [m, { label: FACTORS[m].label, kgPerVehicleKm: Math.round(FACTORS[m].kgPerVehicleKm * 10_000) / 10_000, seats: FACTORS[m].seats, basis: FACTORS[m].basis }])) as ImpactReport['method']['factors'],
  sources: SOURCES.map(s => ({ ...s })),
});

export function buildReport(input: ReportInput): ImpactReport {
  const { trip, members, me, stops } = input;
  const city = cityOf(trip.destination || trip.name);
  const squad = Math.max(1, members.length);
  const memberIds = members.map(m => m.memberId);

  // Rides
  const { specs, located } = legSpecs(stops, city);
  const refined = specs.map((spec): LegSpec => {
    const route = input.routes?.get(legKey(spec.fromStopId, spec.toStopId));
    return route ? { ...spec, distances: withRoutes(spec.distances, route) } : spec;
  });
  const legs = refined
    .map(spec => evaluateLeg(spec, squad, input.picks.get(legKey(spec.fromStopId, spec.toStopId)) ?? null))
    .filter((leg): leg is Leg => leg !== null)
    .map((leg, index) => ({ ...leg, index }));
  const footprint = summarize(legs, squad);
  const dayNumbers = [...new Set(stops.map(s => s.dayNumber))].sort((a, b) => a - b);
  const days: ReportDay[] = dayNumbers.map(number => {
    const mine = legs.filter(l => l.dayNumber === number);
    return {
      number,
      title: input.trip.dayTitles[number - 1] ?? '',
      date: dateOfDay(trip.startDate, number),
      stops: stops.filter(s => s.dayNumber === number).length,
      kg: Math.round(mine.reduce((total, l) => total + l.kg, 0) * 100) / 100,
      legs: mine,
    };
  });
  const sources = new Set(legs.map(l => l.distanceSource));
  const source = sources.size === 0 ? 'none' : sources.size > 1 ? 'mixed' : [...sources][0];

  // Crowds, money, pledges
  const crowd = crowdSmart(stops, { city, startDate: trip.startDate, squad });
  const local = localSpend(input.expenses, input.ai, city);
  const pledges = summarisePledges(input.ticks, memberIds, me);
  const score = scoreOf({
    legs: legs.length, savedPct: footprint.savedPct,
    heritageStops: crowd.heritageStops, quietVisits: crowd.quietVisits, offPeakVisits: crowd.offPeakVisits,
    trackedPaise: local.trackedPaise, localPct: local.sharePct,
    pledgeTicks: pledges.ticks, pledgePossible: pledges.possible,
  });
  const swaps = pickSwaps({
    legs, crowd, stops: stops.map(s => ({ title: s.title, tag: s.tag })),
    artisanPaise: local.byClass.find(c => c.id === 'local-artisan')?.paise ?? 0,
  });

  return {
    tripId: trip.id,
    groupName: trip.groupName,
    tripName: trip.name,
    destination: trip.destination,
    city,
    squad: { size: squad, memberIds },
    footprint: { ...footprint, days, located: { stops: located, total: stops.length }, source },
    crowdSmart: crowd,
    local: { ...local, classifier: local.byGemini > 0 ? 'rules+gemini' : 'rules' },
    pledges,
    score,
    swaps,
    method: methodology(),
    generatedAt: new Date().toISOString(),
  };
}
