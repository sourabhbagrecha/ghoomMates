// Three concrete swaps that would make the squad's trip greener, picked by rules from the plan as it stands.
// Each says exactly what to change and what it saves; Gemini may re-word them (ai.ts) but never changes the numbers.
import { bestMove, moveText, type CrowdSmart } from './crowd.ts';
import { haversineKm, type Leg, type Mode } from './emissions.ts';

export type SwapAction =
  | { type: 'mode'; fromStopId: string; toStopId: string; mode: Mode }
  | { type: 'stop'; stopId: string }
  | { type: 'expense' };

export type Swap = {
  id: string;
  kind: 'walk' | 'erickshaw' | 'boat' | 'crowd' | 'local';
  text: string;
  /** kg CO2e the squad saves (ride swaps) */
  savesKg: number;
  /** Crowd-hours the squad dodges (timing swaps) */
  savesCrowdHours: number;
  action: SwapAction;
  actionLabel: string;
};

/** Centre of the walled old city; rides that stay within it are "through the old city" */
const OLD_CITY = { lat: 24.579, lng: 73.6835 };
const OLD_CITY_RADIUS_KM = 1.1;
/** A stroll worth suggesting */
const MAX_WALK_KM = 2;
/** Savings smaller than this aren't worth a suggestion */
const MIN_SAVING_KG = 0.03;

const inOldCity = (p: { lat: number; lng: number }) => haversineKm(p, OLD_CITY) <= OLD_CITY_RADIUS_KM;

export const kgText = (kg: number) => (kg < 0.1 ? kg.toFixed(2) : kg.toFixed(1));
export const distanceText = (km: number) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`);

const MODE_NOUN: Partial<Record<Mode, string>> = { auto: 'an auto', cab: 'a cab' };

/** Every ride swap that would save something, best one per ride */
function rideSwaps(legs: Leg[]): Swap[] {
  const out: Swap[] = [];
  for (const leg of legs) {
    const mode = leg.mode;
    const candidates: Swap[] = [];
    const place = `${leg.from.name} → ${leg.to.name}`;
    const act = (to: Mode, label: string): Pick<Swap, 'action' | 'actionLabel'> => ({
      action: { type: 'mode', fromStopId: leg.fromStopId, toStopId: leg.toStopId, mode: to },
      actionLabel: label,
    });

    const walk = leg.options.walk;
    if (mode !== 'walk' && walk.allowed && walk.km <= MAX_WALK_KM && !leg.lake) {
      const where = inOldCity(leg.from) && inOldCity(leg.to) ? ' through the old city' : '';
      candidates.push({
        id: `walk:${leg.fromStopId}:${leg.toStopId}`, kind: 'walk',
        text: `Walk ${place}: ${distanceText(walk.km)}${where}, ${walk.minutes} min. Saves ${kgText(leg.kg)} kg.`,
        savesKg: leg.kg, savesCrowdHours: 0, ...act('walk', 'Walk it'),
      });
    }

    const rick = leg.options.erickshaw;
    if ((mode === 'auto' || mode === 'cab') && rick.allowed && leg.kg - rick.kg >= MIN_SAVING_KG) {
      const saved = leg.kg - rick.kg;
      candidates.push({
        id: `erickshaw:${leg.fromStopId}:${leg.toStopId}`, kind: 'erickshaw',
        text: `Take an e-rickshaw instead of ${MODE_NOUN[mode]} for ${place}: saves ${kgText(saved)} kg, ${Math.round((saved / leg.kg) * 100)}% less on this ride.`,
        savesKg: saved, savesCrowdHours: 0, ...act('erickshaw', 'Switch'),
      });
    }

    const boat = leg.options.boat;
    if (leg.lake && mode !== 'boat' && boat.allowed && leg.kg - boat.kg >= MIN_SAVING_KG) {
      const saved = leg.kg - boat.kg;
      candidates.push({
        id: `boat:${leg.fromStopId}:${leg.toStopId}`, kind: 'boat',
        text: `Cross Pichola by boat, ${place}: ${distanceText(boat.km)} on the water instead of ${distanceText(leg.options[mode].km)} round the lake. Saves ${kgText(saved)} kg.`,
        savesKg: saved, savesCrowdHours: 0, ...act('boat', 'Take the boat'),
      });
    }

    // Across the lake the boat is the Udaipur way, even where an e-rickshaw would save a little more
    const best = candidates.find(c => c.kind === 'boat') ?? candidates.sort((a, b) => b.savesKg - a.savesKg)[0];
    if (best && best.savesKg >= MIN_SAVING_KG) out.push(best);
  }
  return out.sort((a, b) => b.savesKg - a.savesKg);
}

function crowdSwap(crowd: CrowdSmart): Swap | null {
  const visit = bestMove(crowd.visits);
  if (!visit?.better) return null;
  return {
    id: `crowd:${visit.stopId}`, kind: 'crowd',
    text: moveText(visit),
    savesKg: 0, savesCrowdHours: visit.better.extraCrowdHours,
    action: { type: 'stop', stopId: visit.stopId }, actionLabel: 'Open the stop',
  };
}

function localSwap(stops: { title: string; tag: string }[], artisanPaise: number): Swap | null {
  if (artisanPaise > 0) return null;
  const shop = stops.find(s => s.tag === 'Shops');
  if (!shop) return null;
  return {
    id: 'local:artisan', kind: 'local',
    text: `At “${shop.title}”, buy straight from the maker and log it: the whole price reaches the craft.`,
    savesKg: 0, savesCrowdHours: 0,
    action: { type: 'expense' }, actionLabel: 'Log it',
  };
}

/** Up to three swaps: the biggest ride saving, a quieter hour, then the next rides; a buy-direct nudge fills any gap */
export function pickSwaps(input: { legs: Leg[]; crowd: CrowdSmart; stops: { title: string; tag: string }[]; artisanPaise: number }): Swap[] {
  const rides = rideSwaps(input.legs);
  const crowd = crowdSwap(input.crowd);
  const local = localSwap(input.stops, input.artisanPaise);
  const ordered = [rides[0], crowd, rides[1], rides[2], local, ...rides.slice(3)].filter((s): s is Swap => Boolean(s));
  return ordered.slice(0, 3);
}
