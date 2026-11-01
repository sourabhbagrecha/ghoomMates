// Group-fair personalisation for itinerary drafts. Pure functions, no database.
//
// Averaging everyone's quiz scores flattens a split squad (two thrill-seekers plus two chillers
// average to "medium everything"). Instead we keep the shape of the group: what everyone loves,
// where it splits, and what someone can't stand. Then we give each member spotlight slots built for
// them, and after Gemini answers we reorder options so the least-served member does better.

export const VIBE_AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const;
export type Axis = (typeof VIBE_AXES)[number];
export type Vibe = Record<Axis, number>;
export type MemberVibe = { name: string; vibe: Vibe };

/** love: everyone's into it · split: some love it, some don't · veto: someone can't stand it and nobody loves it */
export type AxisClass = 'love' | 'split' | 'veto' | 'neutral';
export type AxisStats = { mean: number; min: number; max: number; spread: number; class: AxisClass };

export type SquadProfile = {
  members: (MemberVibe & { top: Axis[] })[];
  axes: Record<Axis, AxisStats>;
  blended: Vibe;
};

/** One planned slot built for specific members; a split slot also serves a second camp at the same time */
export type Spotlight = {
  axis: Axis;
  members: string[];
  split?: { axis: Axis; members: string[] };
};

// Only these fields matter here; the itinerary's DraftStop carries more
export type PlanStop = { tag: string; axis?: string; forMembers?: string[]; split?: boolean };
export type PlanDay<S extends PlanStop = PlanStop> = { slots: S[][] };

export type Fairness = {
  members: { name: string; score: number; spotlights: number }[];
  min: number;
  mean: number;
};

const LOVES = 0.65;
const DISLIKES = 0.2;
const round = (n: number) => Math.round(n * 100) / 100;
const isAxis = (value: unknown): value is Axis => VIBE_AXES.includes(value as Axis);

/** The vibe axis a stop serves: its explicit axis, else its tag (Stay and Travel serve none) */
export function axisOf(stop: PlanStop): Axis | null {
  if (isAxis(stop.axis)) return stop.axis;
  const fromTag = stop.tag.toLowerCase();
  return isAxis(fromTag) ? fromTag : null;
}

export function squadProfile(list: MemberVibe[]): SquadProfile | null {
  if (!list.length) return null;
  const members = list.map(m => ({ ...m, top: [...VIBE_AXES].sort((a, b) => m.vibe[b] - m.vibe[a]).slice(0, 2) }));
  const axes = Object.fromEntries(VIBE_AXES.map(axis => {
    const scores = list.map(m => m.vibe[axis]);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const spread = max - min;
    // Someone who hates it plus someone who loves it is a split (they can go separate ways for a slot),
    // not a veto; a veto is when someone hates it and nobody is excited enough to argue.
    const cls: AxisClass = min < DISLIKES && max < LOVES ? 'veto'
      : spread >= 0.45 ? 'split'
      : mean >= LOVES && spread < 0.35 ? 'love'
      : 'neutral';
    return [axis, { mean: round(mean), min: round(min), max: round(max), spread: round(spread), class: cls }];
  })) as Record<Axis, AxisStats>;
  const blended = Object.fromEntries(VIBE_AXES.map(a => [a, axes[a].mean])) as Vibe;
  return { members, axes, blended };
}

/**
 * Spotlight slots per day. Each day gets up to one spotlight per member (leaving at least one slot for
 * arrival, meals and logistics). The member with the fewest spotlights so far picks next, using their
 * top axis not already used that day (the one used least on the trip so far, so days vary); everyone else
 * who loves that axis shares the slot. A split axis becomes a split slot: the members who aren't into it get a
 * parallel option on an axis they all love, again the least used, else the one their least-keen member likes best.
 */
export function allocateSpotlights(profile: SquadProfile, days: number, slotsPerDay = 4): Spotlight[][] {
  const counts = new Map(profile.members.map(m => [m.name, 0]));
  const uses = new Map<Axis, number>(VIBE_AXES.map(a => [a, 0]));
  const leastUsed = (axes: Axis[]) => [...axes].sort((a, b) => uses.get(a)! - uses.get(b)!)[0];
  const perDay = Math.max(1, Math.min(profile.members.length, slotsPerDay - 1));
  const plan: Spotlight[][] = [];

  for (let day = 0; day < days; day++) {
    const used = new Set<Axis>();
    const spotlights: Spotlight[] = [];
    // Rotate the tie-break by day so the same member doesn't always go first
    const order = profile.members.map((m, i) => ({ m, i: (i - day % profile.members.length + profile.members.length) % profile.members.length }));

    for (let k = 0; k < perDay; k++) {
      const next = order
        .filter(({ m }) => !spotlights.some(s => s.members.includes(m.name) || s.split?.members.includes(m.name)))
        .sort((a, b) => counts.get(a.m.name)! - counts.get(b.m.name)! || a.i - b.i)[0]?.m;
      if (!next) break;
      const axis = leastUsed(next.top.filter(a => !used.has(a)))
        ?? [...VIBE_AXES].filter(a => !used.has(a)).sort((a, b) => next.vibe[b] - next.vibe[a])[0];
      if (!axis) break;
      used.add(axis);
      uses.set(axis, uses.get(axis)! + 1);

      const fans = profile.members.filter(m => m.name === next.name || m.vibe[axis] >= LOVES).map(m => m.name);
      const spotlight: Spotlight = { axis, members: fans };

      const others = profile.members.filter(m => !fans.includes(m.name));
      if (profile.axes[axis].class === 'split' && others.length) {
        const keen = (a: Axis) => Math.min(...others.map(m => m.vibe[a]));
        const open = VIBE_AXES.filter(a => !used.has(a));
        const alt = leastUsed(open.filter(a => keen(a) >= LOVES)) ?? [...open].sort((a, b) => keen(b) - keen(a))[0];
        if (alt) {
          used.add(alt);
          uses.set(alt, uses.get(alt)! + 1);
          spotlight.split = { axis: alt, members: others.map(m => m.name) };
        }
      }
      for (const name of [...spotlight.members, ...(spotlight.split?.members ?? [])]) counts.set(name, counts.get(name)! + 1);
      spotlights.push(spotlight);
    }
    plan.push(spotlights);
  }
  return plan;
}

/** Prompt lines describing the squad and the slot plan, for Gemini */
export function squadBrief(profile: SquadProfile, spotlights: Spotlight[][], firstDay = 1): string {
  const list = (axes: Axis[]) => axes.join(', ');
  const byClass = (cls: AxisClass) => VIBE_AXES.filter(a => profile.axes[a].class === cls);
  const lines = [
    `Each member's vibe (0 = not into it, 1 = loves it):`,
    ...profile.members.map(m => `- ${m.name}: ${VIBE_AXES.map(a => `${a} ${m.vibe[a]}`).join(', ')}`),
  ];
  const loves = byClass('love');
  const splits = byClass('split');
  if (loves.length) lines.push(`Everyone loves: ${list(loves)}. Lean on these for whole-group slots.`);
  if (splits.length) lines.push(`The squad splits on: ${list(splits)}. Never make the whole group do these together.`);
  for (const axis of VIBE_AXES) {
    const haters = profile.members.filter(m => m.vibe[axis] < DISLIKES).map(m => m.name);
    if (haters.length) lines.push(`${haters.join(' and ')} ${haters.length === 1 ? 'dislikes' : 'dislike'} ${axis}: never put it in a whole-group slot.`);
  }
  lines.push('Slot plan (spotlights are built for specific members; fill the remaining slots with whole-group stops, meals and logistics):');
  spotlights.forEach((day, i) => {
    const parts = day.map(s => s.split
      ? `SPLIT slot: option 1 ${s.axis} for ${s.members.join(', ')}, option 2 ${s.split.axis} for ${s.split.members.join(', ')} (same time, close by, regroup after)`
      : `${s.axis} spotlight for ${s.members.join(', ')}`);
    lines.push(`- Day ${firstDay + i}: ${parts.join('; ') || 'whole-group day'}`);
  });
  lines.push(
    'For every option set axis to the vibe it serves (or "group" for meals, travel and check-in) and forMembers to the first names it was planned for (empty for whole-group stops).',
    'Set split true on both options of a SPLIT slot; there option 1 is for the first camp and option 2 for the second, not a pick and an alternative.',
  );
  return lines.join('\n');
}

// The stop a member does in a slot: in a split slot they take whichever option suits them; otherwise the pick
function stopFor(member: MemberVibe, options: PlanStop[]) {
  if (!options[0]?.split) return options[0];
  return [...options].sort((a, b) => scoreOf(member, b) - scoreOf(member, a))[0];
}

function scoreOf(member: MemberVibe, stop: PlanStop) {
  const axis = axisOf(stop);
  return axis ? member.vibe[axis] : -1;
}

/** How well the plan suits each member: their mean score over the vibe-bearing stops they'd do, spotlights weighted ×1.5 */
export function fairness(plan: PlanDay[], profile: SquadProfile): Fairness {
  const members = profile.members.map(m => {
    let total = 0;
    let weight = 0;
    let spotlights = 0;
    for (const day of plan) {
      for (const options of day.slots) {
        const stop = stopFor(m, options);
        if (!stop) continue;
        const mine = stop.forMembers?.includes(m.name) ?? false;
        if (mine) spotlights++;
        const axis = axisOf(stop);
        if (!axis) continue;
        const w = mine ? 1.5 : 1;
        total += m.vibe[axis] * w;
        weight += w;
      }
    }
    return { name: m.name, score: round(weight ? total / weight : 0), spotlights };
  });
  const scores = members.map(m => m.score);
  return { members, min: Math.min(...scores), mean: round(scores.reduce((s, v) => s + v, 0) / scores.length) };
}

const vetoed = (profile: SquadProfile, stop: PlanStop) => {
  const axis = axisOf(stop);
  return axis !== null && profile.members.some(m => m.vibe[axis] < DISLIKES);
};

/**
 * Reorders each whole-group slot's options so the plan is fairer: demote a pick someone can't stand
 * when the alternative is fine, and swap in an alternative when it lifts the least-served member
 * without costing the group more than 0.05 on average. Split slots are left alone.
 */
export function rebalance<S extends PlanStop, D extends PlanDay<S>>(plan: D[], profile: SquadProfile): { days: D[]; fairness: Fairness } {
  const days = plan.map(d => ({ ...d, slots: d.slots.map(s => [...s]) }));
  const slots = days.flatMap(d => d.slots).filter(s => s.length > 1 && !s[0].split);

  for (let pass = 0; pass <= slots.length; pass++) {
    let changed = false;
    for (const options of slots) {
      const current = fairness(days, profile);
      for (let j = 1; j < options.length; j++) {
        [options[0], options[j]] = [options[j], options[0]];
        const next = fairness(days, profile);
        const fixesVeto = vetoed(profile, options[j]) && !vetoed(profile, options[0]);
        const breaksVeto = !vetoed(profile, options[j]) && vetoed(profile, options[0]);
        const fairer = next.min > current.min + 1e-9 && next.mean >= current.mean - 0.05;
        if (fixesVeto || (fairer && !breaksVeto)) {
          changed = true;
          break;
        }
        [options[0], options[j]] = [options[j], options[0]];
      }
    }
    if (!changed) break;
  }
  return { days, fairness: fairness(days, profile) };
}
