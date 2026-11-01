// The squad's getting-around footprint: the rides between consecutive itinerary stops, in kg CO2e.
// Pure functions, no I/O. Distances are estimates (straight line × a road factor) unless the Routes API supplied them.
// Emission factors and their sources are documented in backend/docs/impact.md.
import { isLakeCrossing, type Place } from './places.ts';

export const MODES = ['walk', 'erickshaw', 'auto', 'cab', 'boat'] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (value: unknown): value is Mode => typeof value === 'string' && (MODES as readonly string[]).includes(value);

/** kg CO2 per kWh of Indian grid electricity: CEA CO2 Baseline Database v20.0 (Dec 2024), weighted average for 2023-24 */
export const GRID_KG_PER_KWH = 0.727;
/** kWh per km of an electric three-wheeler in city driving: Saxena, Gopal & Phadke (2014), Applied Energy 115 */
const E_RICKSHAW_KWH_PER_KM = 0.061;
/** kWh per vehicle-km of a small electric lake boat. No published India figure: an assumption (a ~10-seat boat at walking-plus pace). */
const BOAT_KWH_PER_KM = 0.55;

export type ModeFactor = {
  label: string;
  /** kg CO2e per vehicle-km */
  kgPerVehicleKm: number;
  /** Passengers one vehicle carries; a squad fills as many vehicles as it needs */
  seats: number;
  /** Average door-to-door pace in Udaipur, km/h */
  kmh: number;
  /** Longest ride that makes sense in this mode, km (null = no limit) */
  maxKm: number | null;
  basis: string;
};

export const FACTORS: Record<Mode, ModeFactor> = {
  walk: { label: 'Walk', kgPerVehicleKm: 0, seats: 1, kmh: 5, maxKm: 3, basis: 'Nothing burnt' },
  erickshaw: {
    label: 'E-rickshaw', kgPerVehicleKm: E_RICKSHAW_KWH_PER_KM * GRID_KG_PER_KWH, seats: 4, kmh: 15, maxKm: 12,
    basis: '61 Wh/km (Saxena et al. 2014) × 0.727 kg CO2/kWh (CEA grid, 2023-24)',
  },
  auto: { label: 'Auto', kgPerVehicleKm: 0.1135, seats: 3, kmh: 20, maxKm: 30, basis: 'Petrol three-wheeler, 0.1135 kg CO2/km (India GHG Program 2015)' },
  cab: { label: 'Cab', kgPerVehicleKm: 0.153, seats: 4, kmh: 28, maxKm: null, basis: 'Petrol sedan <1600 cc, 0.142 kg CO2/km + 10% real-world uplift (India GHG Program 2015)' },
  boat: {
    label: 'Boat', kgPerVehicleKm: BOAT_KWH_PER_KM * GRID_KG_PER_KWH, seats: 10, kmh: 8, maxKm: null,
    basis: 'Assumption: small electric boat, 0.55 kWh/km × 0.727 kg CO2/kWh',
  },
};

export const SOURCES = [
  {
    id: 'igp',
    title: 'India GHG Program (WRI India, CII, TERI): India Specific Road Transport Emission Factors, v1.0, 2015',
    url: 'https://indiaghgp.org/sites/default/files/Road%20Transport%20Technical%20Paper.pdf',
  },
  {
    id: 'lbl',
    title: 'Saxena, Gopal & Phadke (2014): Electrical consumption of two-, three- and four-wheel light-duty electric vehicles in India, Applied Energy 115',
    url: 'https://doi.org/10.1016/j.apenergy.2013.10.043',
  },
  {
    id: 'cea',
    title: 'Central Electricity Authority: CO2 Baseline Database for the Indian Power Sector, v20.0, Dec 2024',
    url: 'https://cea.nic.in/wp-content/uploads/2021/03/User_Guide_Version_20.0.pdf',
  },
] as const;

/** Straight-line distance → distance by road, on foot, and across the water */
export const ROAD_FACTOR = 1.35;
export const WALK_FACTOR = 1.25;
export const BOAT_FACTOR = 1.1;
/** Going round Lake Pichola by road or footpath is about this many times the straight line across it */
export const LAKE_DETOUR = 3.5;

/** Under this many road km, the squad walks by default; under DRIVE_BELOW an auto will do; beyond, a cab */
export const WALK_BELOW_KM = 1.2;
export const AUTO_BELOW_KM = 7;
/** Rides shorter than this are the same place */
const MIN_LEG_KM = 0.08;

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
export const round1 = (value: number) => round(value, 1);
export const round2 = (value: number) => round(value, 2);
export const round4 = (value: number) => round(value, 4);

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Distances = {
  /** Footpath distance */
  walkKm: number;
  /** Road distance for e-rickshaws, autos and cabs */
  driveKm: number;
  /** Across the water, for lake crossings */
  boatKm: number | null;
  lake: boolean;
  source: 'estimate' | 'routes';
};

export function estimateDistances(from: Place, to: Place): Distances {
  const straight = haversineKm(from, to);
  const lake = isLakeCrossing(from, to);
  return lake
    ? { walkKm: straight * LAKE_DETOUR, driveKm: straight * LAKE_DETOUR, boatKm: straight * BOAT_FACTOR, lake, source: 'estimate' }
    : { walkKm: straight * WALK_FACTOR, driveKm: straight * ROAD_FACTOR, boatKm: null, lake, source: 'estimate' };
}

/** Distances from the Routes API replace the estimate for the modes it covers (never across the water) */
export function withRoutes(base: Distances, routes: { walkKm?: number; driveKm?: number }): Distances {
  if (base.lake) return base;
  const walkKm = routes.walkKm ?? base.walkKm;
  const driveKm = routes.driveKm ?? base.driveKm;
  const used = routes.walkKm !== undefined || routes.driveKm !== undefined;
  return { ...base, walkKm, driveKm, source: used ? 'routes' : base.source };
}

/** The mode a squad most likely takes when it hasn't chosen: boat across the lake, on foot when short, an auto, then a cab */
export function defaultMode(d: Distances): Mode {
  if (d.lake && d.boatKm !== null) return 'boat';
  if (d.walkKm < WALK_BELOW_KM) return 'walk';
  return d.driveKm < AUTO_BELOW_KM ? 'auto' : 'cab';
}

export function kmFor(mode: Mode, d: Distances): number {
  if (mode === 'walk') return d.walkKm;
  if (mode === 'boat') return d.boatKm ?? 0;
  return d.driveKm;
}

/** Modes that make sense for the ride: no 9 km walks, no boat on dry land */
export function allowedModes(d: Distances): Mode[] {
  return MODES.filter(mode => {
    if (mode === 'boat') return d.lake && d.boatKm !== null;
    const max = FACTORS[mode].maxKm;
    return max === null || kmFor(mode, d) <= max;
  });
}

/** Vehicles the squad needs: as few as fit them all */
export const vehiclesFor = (mode: Mode, squad: number) => (mode === 'walk' ? 0 : Math.ceil(Math.max(1, squad) / FACTORS[mode].seats));

/** kg CO2e for the whole squad riding `km` in `mode` */
export const squadKg = (mode: Mode, km: number, squad: number) => vehiclesFor(mode, squad) * FACTORS[mode].kgPerVehicleKm * km;

/** What the same ride would emit with everyone in their own cab */
export const ownCabKg = (km: number, squad: number) => Math.max(1, squad) * FACTORS.cab.kgPerVehicleKm * km;

export const minutesFor = (mode: Mode, km: number) => Math.max(1, Math.round((km / FACTORS[mode].kmh) * 60));

export type LegSpec = {
  fromStopId: string;
  toStopId: string;
  dayNumber: number;
  from: Place;
  fromTitle: string;
  to: Place;
  toTitle: string;
  distances: Distances;
};

export type LegOption = { allowed: boolean; km: number; minutes: number; vehicles: number; kg: number };

export type Leg = {
  index: number;
  dayNumber: number;
  fromStopId: string;
  toStopId: string;
  from: { title: string; name: string; lat: number; lng: number };
  to: { title: string; name: string; lat: number; lng: number };
  lake: boolean;
  /** The mode in use: the squad's pick, else the default */
  mode: Mode;
  defaultMode: Mode;
  /** The squad picked this mode (rather than the default) */
  chosen: boolean;
  distanceSource: Distances['source'];
  /** Whole-squad kg CO2e in the mode in use */
  kg: number;
  /** Whole-squad kg CO2e with everyone in their own cab */
  ownCabKg: number;
  options: Record<Mode, LegOption>;
};

/** A ride between two consecutive stops, or null when they are the same place */
export function evaluateLeg(spec: LegSpec, squad: number, choice: Mode | null, index = 0): Leg | null {
  const d = spec.distances;
  if (d.walkKm < MIN_LEG_KM && d.driveKm < MIN_LEG_KM) return null;
  const allowed = allowedModes(d);
  const valid = choice !== null && allowed.includes(choice);
  const fallback = defaultMode(d);
  const mode = valid ? choice : fallback;
  const options = Object.fromEntries(MODES.map(m => {
    const km = kmFor(m, d);
    return [m, {
      allowed: allowed.includes(m),
      km: round4(km),
      minutes: km > 0 ? minutesFor(m, km) : 0,
      vehicles: vehiclesFor(m, squad),
      kg: round4(squadKg(m, km, squad)),
    }];
  })) as Record<Mode, LegOption>;
  return {
    index,
    dayNumber: spec.dayNumber,
    fromStopId: spec.fromStopId,
    toStopId: spec.toStopId,
    from: { title: spec.fromTitle, name: spec.from.name, lat: spec.from.lat, lng: spec.from.lng },
    to: { title: spec.toTitle, name: spec.to.name, lat: spec.to.lat, lng: spec.to.lng },
    lake: d.lake,
    mode,
    defaultMode: fallback,
    chosen: valid,
    distanceSource: d.source,
    kg: options[mode].kg,
    ownCabKg: round4(ownCabKg(d.driveKm, squad)),
    options,
  };
}

export type Footprint = {
  squadSize: number;
  totalKg: number;
  perPersonKg: number;
  /** Everyone in their own cab */
  baselineKg: number;
  savedKg: number;
  /** 0–100 */
  savedPct: number;
  /** The saving as km of solo cab rides, for a feel of the size */
  cabKmSaved: number;
  distanceKm: number;
  byMode: { mode: Mode; label: string; km: number; kg: number; legs: number }[];
};

/** Adds the legs up. Sums the rounded per-leg numbers so the app can do the same sum and agree to the digit. */
export function summarize(legs: Leg[], squad: number): Footprint {
  const size = Math.max(1, squad);
  const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
  const totalKg = sum(legs.map(l => l.kg));
  const baselineKg = sum(legs.map(l => l.ownCabKg));
  const savedKg = Math.max(0, baselineKg - totalKg);
  const byMode = MODES.map(mode => {
    const used = legs.filter(l => l.mode === mode);
    return { mode, label: FACTORS[mode].label, km: round2(sum(used.map(l => l.options[mode].km))), kg: round2(sum(used.map(l => l.kg))), legs: used.length };
  }).filter(m => m.legs > 0);
  return {
    squadSize: size,
    totalKg: round2(totalKg),
    perPersonKg: round2(totalKg / size),
    baselineKg: round2(baselineKg),
    savedKg: round2(savedKg),
    savedPct: baselineKg > 0 ? Math.round((savedKg / baselineKg) * 100) : 0,
    cabKmSaved: round1(savedKg / FACTORS.cab.kgPerVehicleKm),
    distanceKm: round1(sum(legs.map(l => l.options[l.mode].km))),
    byMode,
  };
}
