// Squad pledges: small promises specific to Udaipur's lakes, lanes and craft traditions. Each member ticks their own.
// The list is fixed and hand-written; the database only stores who ticked what.

export type Pledge = {
  id: string;
  title: string;
  /** One line on why it matters here */
  why: string;
  /** Icon name in frontend/src/assets/icons (icon-<name>-primary.svg) */
  icon: string;
};

export const PLEDGES: Pledge[] = [
  { id: 'refill', title: 'Refill, don’t buy', why: 'The lakes are Udaipur’s drinking water. Fill up at your haveli’s RO tap.', icon: 'droplets' },
  { id: 'no-plastic', title: 'No single-use plastic at the ghats', why: 'Wrappers and bottles end up in Pichola. Carry yours back out.', icon: 'recycle' },
  { id: 'dress-code', title: 'Dress for the temples', why: 'Shoulders and knees covered at Jagdish Temple, shoes off at the steps.', icon: 'shirt' },
  { id: 'no-flash', title: 'No flash on palace murals', why: 'Mirror work and miniature paint fade under flash. Switch it off.', icon: 'zap-off' },
  { id: 'walk-erickshaw', title: 'Walk or e-rickshaw in the old city', why: 'The lanes are narrow. One e-rickshaw beats three cabs.', icon: 'footprints' },
  { id: 'buy-direct', title: 'Buy direct from makers', why: 'Ask for the painter or weaver. The full price reaches the craft.', icon: 'hand-coins' },
  { id: 'quiet-hours', title: 'Visit at quiet hours', why: 'Follow the crowd meter: mornings beat the 11-to-3 tour-bus rush.', icon: 'sunrise' },
  { id: 'family-kitchens', title: 'Eat at family kitchens', why: 'A Mewari thali at a local bhojanalaya feeds a family, not a chain.', icon: 'soup' },
];

export const PLEDGE_IDS = new Set(PLEDGES.map(p => p.id));

/** One tick: a squad member (by trip member id) promised a pledge */
export type PledgeTick = { pledgeId: string; memberId: string };

export type PledgeSummary = {
  items: (Pledge & { ticks: string[]; mine: boolean })[];
  squadSize: number;
  /** All ticks across the squad */
  ticks: number;
  /** Ticks if everyone took every pledge */
  possible: number;
  /** 0–100 */
  pct: number;
  /** How many pledges you took */
  mine: number;
};

/** The pledge list with who ticked what, in squad order */
export function summarisePledges(ticks: PledgeTick[], squad: string[], me: string): PledgeSummary {
  const items = PLEDGES.map(pledge => {
    const who = squad.filter(memberId => ticks.some(t => t.pledgeId === pledge.id && t.memberId === memberId));
    return { ...pledge, ticks: who, mine: who.includes(me) };
  });
  const total = items.reduce((sum, p) => sum + p.ticks.length, 0);
  const possible = squad.length * PLEDGES.length;
  return {
    items,
    squadSize: squad.length,
    ticks: total,
    possible,
    pct: possible > 0 ? Math.round((total / possible) * 100) : 0,
    mine: items.filter(p => p.mine).length,
  };
}
