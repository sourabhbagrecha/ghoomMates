// The Green Host score: 0–100 from four things a visiting squad can understand at a glance.
//   40  local sourcing: share of the kitchen's food (by weight) that comes from partner farms this month
//   30  waste per cover: food left over per guest (measured from the host's log when there is one, else as reported)
//   15  plastic-free: no plastic cutlery, cups or bottles in the kitchen and dining room
//   15  water refill: free refills so squads don't buy a bottle each
// The weights are a judgment call, not a standard. backend/docs/hospitality.md explains them.
import type { Host, Practices } from './partners.ts';

export const GREEN_WEIGHTS = { local: 40, waste: 30, plastic: 15, water: 15 } as const;
export type GreenPartId = keyof typeof GREEN_WEIGHTS;

/** Share of local food that earns full marks */
export const FULL_MARKS_LOCAL_SHARE = 0.95;
/** Leftovers per cover (kg) that earn full marks, and none */
export const BEST_WASTE_KG = 0.05;
export const WORST_WASTE_KG = 0.25;

export type GreenTier = 'Gold' | 'Silver' | 'Bronze' | 'Starter';

export type GreenPart = {
  id: GreenPartId;
  label: string;
  /** 0–100 */
  value: number;
  points: number;
  max: number;
  detail: string;
};

export type Green = {
  score: number;
  tier: GreenTier;
  parts: GreenPart[];
  /** The change that would add the most points */
  nextStep: { part: GreenPartId; text: string; points: number } | null;
};

export type MeasuredWaste = { perCoverKg: number; days: number };

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export const tierFor = (score: number): GreenTier => (score >= 85 ? 'Gold' : score >= 70 ? 'Silver' : score >= 55 ? 'Bronze' : 'Starter');

const PLASTIC: Record<Practices['plasticFree'], { value: number; detail: string }> = {
  full: { value: 100, detail: 'Plastic-free kitchen and tables' },
  partial: { value: 50, detail: 'Cutting plastic: clay cups, some single-use left' },
  no: { value: 0, detail: 'Still uses single-use plastic' },
};

const WATER: Record<Practices['waterRefill'], { value: number; detail: string }> = {
  free: { value: 100, detail: 'Free filtered water refills' },
  paid: { value: 50, detail: 'Water refills for ₹10' },
  none: { value: 0, detail: 'Bottled water only' },
};

const NEXT_STEP: Record<GreenPartId, string> = {
  local: 'Buy more of the menu straight from partner farms',
  waste: 'Cook to the head-count to cut leftovers',
  plastic: 'Swap single-use plastic for clay, steel and leaf',
  water: 'Add a free water refill station',
};

export function greenScore(host: Host, localShare: number, measured?: MeasuredWaste | null): Green {
  const useLog = Boolean(measured && measured.days >= 3);
  const wasteKg = useLog ? measured!.perCoverKg : host.practices.wasteKgPerCover;
  const plastic = PLASTIC[host.practices.plasticFree];
  const water = WATER[host.practices.waterRefill];
  const values: Record<GreenPartId, { value: number; label: string; detail: string }> = {
    local: { value: clamp(localShare / FULL_MARKS_LOCAL_SHARE * 100), label: 'Local sourcing', detail: `${Math.round(localShare * 100)}% of the food comes from partner farms` },
    waste: {
      value: clamp((WORST_WASTE_KG - wasteKg) / (WORST_WASTE_KG - BEST_WASTE_KG) * 100), label: 'Waste per cover',
      detail: `${wasteKg.toFixed(2)} kg left per cover${useLog ? ` (logged over ${measured!.days} days)` : ' (reported)'}`,
    },
    plastic: { value: plastic.value, label: 'Plastic-free', detail: plastic.detail },
    water: { value: water.value, label: 'Water refill', detail: water.detail },
  };
  const parts = (Object.keys(GREEN_WEIGHTS) as GreenPartId[]).map((id): GreenPart => ({
    id, label: values[id].label, value: Math.round(values[id].value), max: GREEN_WEIGHTS[id],
    points: Math.round(values[id].value * GREEN_WEIGHTS[id] / 100), detail: values[id].detail,
  }));
  const score = Math.round(parts.reduce((sum, p) => sum + p.value * GREEN_WEIGHTS[p.id] / 100, 0));
  const gap = parts.map(p => ({ part: p.id, points: p.max - p.points })).sort((a, b) => b.points - a.points)[0];
  return {
    score, tier: tierFor(score), parts,
    nextStep: gap && gap.points >= 3 ? { part: gap.part, text: NEXT_STEP[gap.part], points: gap.points } : null,
  };
}
