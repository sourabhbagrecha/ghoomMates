// The squad's Green Trip score (0–100) and badge. Four parts, each earned by something the squad actually did.

export type ScorePart = { id: 'footprint' | 'crowd' | 'local' | 'pledges'; label: string; points: number; max: number };

export const BADGES = [
  { level: 1, name: 'Ghat Visitor', min: 0, blurb: 'You’re on the steps. Every swap takes you further into the city’s good side.' },
  { level: 2, name: 'Pol Walker', min: 30, blurb: 'Walking the old city’s gates and gullies lightly.' },
  { level: 3, name: 'Lake Guardian', min: 55, blurb: 'Keeping Pichola and the old city a little cleaner, quieter and fairer.' },
  { level: 4, name: 'Mewar Steward', min: 80, blurb: 'A squad the city would thank in person.' },
] as const;

export type Badge = {
  level: number;
  name: string;
  blurb: string;
  /** The next badge up, and how many points away it is */
  next: { name: string; at: number; toGo: number } | null;
};

export type Score = { total: number; parts: ScorePart[]; badge: Badge };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type ScoreInput = {
  /** Whether any rides were measured, and how much less than everyone-in-their-own-cab they emit (0–100) */
  legs: number;
  savedPct: number;
  heritageStops: number;
  quietVisits: number;
  offPeakVisits: number;
  trackedPaise: number;
  /** Share of tracked spend kept with local people (0–100) */
  localPct: number;
  pledgeTicks: number;
  pledgePossible: number;
};

export function scoreOf(input: ScoreInput): Score {
  // A moderate-hour visit earns a little less than a quiet one
  const crowdShare = input.heritageStops > 0
    ? (input.quietVisits + 0.6 * Math.max(0, input.offPeakVisits - input.quietVisits)) / input.heritageStops
    : 0;
  const parts: ScorePart[] = [
    { id: 'footprint', label: 'Lighter rides', max: 30, points: input.legs > 0 ? Math.round(30 * clamp(input.savedPct / 85)) : 0 },
    { id: 'crowd', label: 'Quiet hours', max: 20, points: Math.round(20 * clamp(crowdShare)) },
    { id: 'local', label: 'Kept local', max: 25, points: input.trackedPaise > 0 ? Math.round(25 * clamp(input.localPct / 60)) : 0 },
    { id: 'pledges', label: 'Pledges', max: 25, points: input.pledgePossible > 0 ? Math.round(25 * clamp(input.pledgeTicks / input.pledgePossible)) : 0 },
  ];
  const total = parts.reduce((sum, p) => sum + p.points, 0);
  return { total, parts, badge: badgeFor(total) };
}

export function badgeFor(total: number): Badge {
  const earned = [...BADGES].reverse().find(b => total >= b.min) ?? BADGES[0];
  const next = BADGES.find(b => b.min > total);
  return {
    level: earned.level,
    name: earned.name,
    blurb: earned.blurb,
    next: next ? { name: next.name, at: next.min, toGo: next.min - total } : null,
  };
}
