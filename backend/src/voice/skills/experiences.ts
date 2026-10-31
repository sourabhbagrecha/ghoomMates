// Experiences skill: recommend guide trips (Explore → "Trips by local guides") that fit the speaker's or the
// squad's personality, plan a day out of them and, after a yes, add that day to the itinerary.
import { randomUUID } from 'node:crypto';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { BackendError } from '../backendClient.ts';
import {
  EXPERIENCE_CITIES,
  EXPERIENCE_TAGS,
  EXPERIENCES,
  VIBE_AXES,
  WHEN,
  addDays,
  asVibe,
  blendVibes,
  cityForDestination,
  dayLabel,
  daysBetween,
  formatTime,
  istClock,
  mainAxis,
  moodVibe,
  parseIsoDay,
  pickVaried,
  planDay,
  rankExperiences,
  topAxes,
  type CatalogueExperience,
  type ExperienceCity,
  type IstDay,
  type MemberVibe,
  type PlannedStop,
  type RankedExperience,
  type Vibe,
  type VibeAxis,
} from '../experiences.ts';
import { firstName } from '../members.ts';
import type { DayPlan, ExperiencePick, RecommendationBasis } from '../protocol.ts';
import type { Skill, SkillContext } from './types.ts';

const PICKS = 3;
const IDS = EXPERIENCES.map(e => e.id) as [string, ...string[]];
/** Itinerary stop tag for an experience's main vibe (STOP_TAGS in src/trips/itinerary.ts) */
const STOP_TAG: Record<VibeAxis, string> = { adventure: 'Adventure', food: 'Food', nightlife: 'Nightlife', culture: 'Culture', chill: 'Chill', shops: 'Shops' };

type PendingPlan = { plan: DayPlan; stops: PlannedStop[] };

/** Per-session state, kept under ctx.state.experiences */
type ExperienceState = {
  /** Joined from the card this session, so they aren't recommended again */
  joined: Set<string>;
  pendingPlan: PendingPlan | null;
  /** Plans already added → itinerary day, so a repeated "yes" or a late tap doesn't add stops twice */
  added: Map<string, number>;
  saving: Map<string, Promise<number>>;
};

const stateOf = (ctx: SkillContext) =>
  (ctx.state.experiences ??= { joined: new Set(), pendingPlan: null, added: new Map(), saving: new Map() } satisfies ExperienceState) as ExperienceState;

const list = (items: string[], word = 'and') => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
const titleOf = (id: string) => EXPERIENCES.find(e => e.id === id)?.title ?? 'that trip';

/** "Adventure + food" for the card; "Top rated" when nothing in the vibe stands out */
export function reasonLabel(because: VibeAxis[]): string {
  if (!because.length) return 'Top rated';
  const [first, ...rest] = because.slice(0, 2);
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' + ');
}

/** One line on why a pick suits them, in their terms */
export function whyLine(basis: RecommendationBasis, because: VibeAxis[], experience: CatalogueExperience): string {
  const traits = list(because.slice(0, 2));
  if (basis === 'you') return traits ? `You’re big on ${traits}` : 'A strong all-rounder for your vibe';
  if (basis === 'squad') return traits ? `Hits the squad’s ${traits} side` : 'Something for everyone in the squad';
  if (basis === 'mood') return traits ? `The ${traits} you asked for` : 'Close to what you asked for';
  return `Guests rate it ${experience.rating}★`;
}

/** Whose quiz vibe to rank with: the speaker's, else the squad blend, else none */
export function vibeFor(ctx: Pick<SkillContext, 'me' | 'members'>, forWhom: 'me' | 'squad'): { vibe: Vibe | null; basis: RecommendationBasis } {
  if (forWhom === 'me') {
    const mine = asVibe(ctx.members.find(m => m.memberId === ctx.me.memberId)?.vibe);
    if (mine) return { vibe: mine, basis: 'you' };
  }
  const squad = blendVibes(ctx.members.map(m => m.vibe));
  return squad ? { vibe: squad, basis: 'squad' } : { vibe: null, basis: 'rating' };
}

/**
 * The vibe to rank with, including what they just said they're in the mood for. With no quiz results and no
 * mood yet, asks the model to find out with one quick question instead of falling back to generic picks.
 */
export function resolveVibe(
  ctx: Pick<SkillContext, 'me' | 'members'>,
  forWhom: 'me' | 'squad',
  likes?: VibeAxis[],
  avoid?: VibeAxis[],
): { vibe: Vibe | null; basis: RecommendationBasis } {
  const quiz = vibeFor(ctx, forWhom);
  if ((likes?.length ?? 0) + (avoid?.length ?? 0) > 0) return { vibe: moodVibe(quiz.vibe, likes ?? [], avoid), basis: quiz.vibe ? quiz.basis : 'mood' };
  if (quiz.vibe || likes) return quiz;
  throw new llm.ToolError(
    'Nobody has taken the vibe quiz yet, so you don\'t know their personality. Ask ONE quick, fun question, e.g. "Adventure or something chill? And are you a big foodie?", then call again with their answer as likes (and avoid). If they say anything goes, call again with likes: [].',
  );
}

const membersWithVibes = (ctx: SkillContext): MemberVibe[] =>
  ctx.members.flatMap(m => {
    const vibe = asVibe(m.vibe);
    return vibe ? [{ memberId: m.memberId, name: firstName(m.name), vibe }] : [];
  });

/** Udaipur is the demo city: trips elsewhere get Udaipur picks, as Explore shows them */
const FALLBACK_CITY: ExperienceCity = 'Udaipur';

/** A city they named, else the trip's, else the demo city */
const whereFor = (ctx: SkillContext, city: ExperienceCity | undefined): ExperienceCity =>
  city ?? cityForDestination(ctx.trip.destination) ?? FALLBACK_CITY;

/** A note for the model when it's showing the demo city for a trip somewhere else */
const fallbackNote = (ctx: SkillContext, where: ExperienceCity, city: ExperienceCity | undefined) =>
  !city && !cityForDestination(ctx.trip.destination) ? `Guide trips aren't seeded for ${ctx.trip.destination || 'this trip'} yet, so these are in ${where}; say so in a few words.\n` : '';

function basisNote(ctx: SkillContext, basis: RecommendationBasis, vibe: Vibe | null) {
  const strongest = vibe ? list(topAxes(vibe)) : '';
  if (basis === 'you') return `Ranked for ${firstName(ctx.me.name)}'s personality quiz: strongest on ${strongest}.`;
  if (basis === 'squad') return `Ranked for the squad's blended personality: strongest on ${strongest}.`;
  if (basis === 'mood') return `Ranked on the mood they described (${strongest}). They haven't taken the vibe quiz; once, briefly, mention it makes picks even better.`;
  return 'Ranked by guest rating, as they said anything goes.';
}

function describe(rank: RankedExperience, today: IstDay) {
  const e = rank.experience;
  const fitText = rank.match === null ? `rated ${e.rating}` : `${rank.match}% match${rank.because.length ? ` (${list(rank.because)})` : ''}`;
  const squad = rank.fits.length > 1 ? ` Per member: ${rank.fits.map(f => `${f.name} ${f.match}%`).join(', ')}.` : '';
  return `${e.title} [id ${e.id}], ${fitText}, ${rupees(e.priceRupees)} per person, ${dayLabel(rank.run.day, today)} at ${e.startTime}, ${e.duration}, up to ${e.groupSize} guests. ${e.pitch}.${squad}`;
}

// ---- Day plan: shared by the voice tools and the card's Add / Cancel buttons ----

export class NoPendingPlanError extends Error {
  constructor() {
    super('No day plan is waiting to be added');
    this.name = 'NoPendingPlanError';
  }
}

/** Adds the pending plan's stops to the itinerary, once. A repeat (voice "yes" plus a tap) is a no-op. */
export async function commitPlan(ctx: SkillContext, planId?: string): Promise<{ dayNumber: number; count: number; duplicate: boolean }> {
  const st = stateOf(ctx);
  const id = planId ?? st.pendingPlan?.plan.id;
  if (!id) throw new NoPendingPlanError();
  const done = st.added.get(id);
  if (done !== undefined) return { dayNumber: done, count: 0, duplicate: true };
  const running = st.saving.get(id);
  if (running) return { dayNumber: await running, count: 0, duplicate: true };

  const pending = st.pendingPlan;
  if (!pending || pending.plan.id !== id) throw new NoPendingPlanError();
  const { dayNumber, dayLabel: label } = pending.plan;
  if (dayNumber === null) throw new llm.ToolError(`${label} isn't one of the trip's days, so it can't go on the itinerary. Say so briefly.`);
  const stops = pending.stops;

  const save = (async () => {
    let saved = 0;
    try {
      for (const stop of stops) {
        const e = stop.experience;
        await ctx.api.post(`/api/trips/${ctx.tripId}/stops`, {
          dayNumber,
          time: formatTime(stop.start),
          title: e.title,
          tag: STOP_TAG[mainAxis(e)],
          place: e.area,
          notes: `Local guide experience, ${rupees(e.priceRupees)} per person, ${e.duration}. Join it from Explore.`,
        });
        saved++;
      }
    } catch (err) {
      // Stops already written stay; keep only the rest so a retry doesn't add them twice
      pending.stops = stops.slice(saved);
      throw new Error(`added ${saved} of ${stops.length} stops: ${err instanceof BackendError ? err.message : (err as Error).message}`);
    }
    st.added.set(id, dayNumber);
    if (st.pendingPlan === pending) st.pendingPlan = null;
    void ctx.ui({ type: 'day.plan.added', planId: id, dayNumber, count: stops.length });
    return dayNumber;
  })();
  st.saving.set(id, save);
  try {
    return { dayNumber: await save, count: stops.length, duplicate: false };
  } finally {
    st.saving.delete(id);
  }
}

/** Drops the pending plan; returns it, or null if there was none (with that id) or it's already saving */
export function cancelPlan(ctx: SkillContext, planId?: string): DayPlan | null {
  const st = stateOf(ctx);
  const pending = st.pendingPlan;
  if (!pending || (planId && pending.plan.id !== planId) || st.saving.has(pending.plan.id)) return null;
  st.pendingPlan = null;
  void ctx.ui({ type: 'day.plan.cancelled', planId: pending.plan.id });
  return pending.plan;
}

// ---- The skill ----

const forWhomParam = z.enum(['me', 'squad']).describe('"me" for the speaker, including solo plans; "squad" for the whole group');
const cityParam = z.enum(EXPERIENCE_CITIES).optional().describe('Only if the user names a city. Omit to use the trip destination.');
const likesParam = z.array(z.enum(VIBE_AXES)).optional().describe('What they said they are in the mood for. Omit if they said nothing about it.');
const avoidParam = z.array(z.enum(VIBE_AXES)).optional().describe('What they said they are not in the mood for');

export const experiences: Skill = {
  name: 'experiences',

  instructions: (ctx) => `## Guide trips and day plans
- Local guides host experiences (workshops, treks, food walks, cooking classes, boat rides, yoga, nights out) in ${list([...EXPERIENCE_CITIES])}. They run on weekly schedules, and the tools only offer ones that haven't started yet.
- Asked what to do, for a recommendation, or for something matching a mood ("kuch adventurous", "something chill tonight", "what would we all enjoy?"): call recommend_experiences right away. Pass when for "today", "tonight" or "tomorrow"; omit it otherwise.
- Asked to plan a day or a trip ("plan my day", "plan tomorrow", "plan a solo trip in Udaipur", "kal kya karein?"): call plan_day. It builds a timed day of up to three experiences that don't clash.
- for_whom: "me" for the speaker, including solo plans ("solo", "just me", "for myself"); "squad" when they ask for the group. Pass city when they name Goa or Udaipur, even if the trip is elsewhere. Pass likes / avoid with any mood they mention (adventure, food, nightlife, culture, chill, shops).
- If a tool says nobody has taken the vibe quiz, ask its one quick question, then call it again with their answer as likes.
- Results show on screen. Pitch the top pick (or the day) in one or two sentences and say why it suits them, using the traits the tool gives you ("you're big on adventure, so…"). For the squad, mention who it suits most. Mention the others only briefly.
- After plan_day, ask if they want it on the itinerary. Only call add_day_plan after an explicit yes, or when they tap Add on the card. "No" or "change it" means cancel_day_plan, then plan again.
- Joining an experience is a tap on Join, on the card or its screen; never say you booked it. "Open the first one" or "tell me more" means open_experience.
- The trip's destination is ${ctx.trip.destination || 'not set'}. If they don't name a city and it isn't one of those, the tools use ${FALLBACK_CITY}, the demo city.`,

  tools: (ctx) => [
    llm.tool({
      name: 'recommend_experiences',
      description: 'Recommend local guide experiences that fit the personality of the speaker or the whole squad, shown as a card.',
      parameters: z.object({
        for_whom: forWhomParam,
        city: cityParam,
        tag: z.enum(EXPERIENCE_TAGS).optional().describe('Only if they ask for a kind of experience. Omit otherwise.'),
        when: z.enum(WHEN).optional().describe('Only if they say today, tonight or tomorrow. Omit for any time this week.'),
        likes: likesParam,
        avoid: avoidParam,
      }),
      execute: async ({ for_whom, city, tag, when, likes, avoid }) => {
        const where = whereFor(ctx, city);
        const { vibe, basis } = resolveVibe(ctx, for_whom, likes, avoid);
        const now = new Date();
        const { today } = istClock(now);
        const members = for_whom === 'squad' ? membersWithVibes(ctx) : [];
        const ranked = rankExperiences(vibe, { city: where, tag, when, now, solo: for_whom === 'me', exclude: [...stateOf(ctx).joined], members });
        if (!ranked.length) {
          const span = when ? when.replace('_', ' ') : 'this week';
          throw new llm.ToolError(`No ${tag ? `${tag} ` : ''}guide trips left in ${where} ${span}. Offer another time or kind of trip.`);
        }

        const top = pickVaried(ranked, PICKS);
        const picks: ExperiencePick[] = top.map(r => ({
          experienceId: r.experience.id,
          matchPercent: r.match,
          reason: reasonLabel(r.because),
          why: whyLine(basis, r.because, r.experience),
          when: `${dayLabel(r.run.day, today)} · ${r.experience.startTime}`,
          fits: r.fits.map(f => ({ memberId: f.memberId, name: f.name, matchPercent: f.match })),
        }));
        void ctx.ui({ type: 'experiences.recommended', city: where, basis, picks });
        return `${fallbackNote(ctx, where, city)}${basisNote(ctx, basis, vibe)}\nTop picks in ${where} (shown on screen, best first):\n${top.map((r, i) => `${i + 1}. ${describe(r, today)}`).join('\n')}`;
      },
    }),

    llm.tool({
      name: 'open_experience',
      description: 'Open the detail screen of one guide experience so the user can see it and join.',
      parameters: z.object({ experience_id: z.enum(IDS).describe('The id from recommend_experiences or plan_day') }),
      execute: async ({ experience_id }) => {
        void ctx.ui({ type: 'experience.open', experienceId: experience_id });
        return `Opened "${titleOf(experience_id)}". Say so in a few words and that they can tap Join there.`;
      },
    }),

    llm.tool({
      name: 'plan_day',
      description: 'Plan a day of up to three non-clashing guide experiences that fit the speaker or the squad, shown as a card. Nothing is saved.',
      parameters: z.object({
        for_whom: forWhomParam,
        day: z.enum(['today', 'tomorrow']).describe('Which day to plan; "kal" about the future means tomorrow'),
        day_number: z.number().int().min(1).max(60).optional().describe('Only if they name a trip day, e.g. "day 2"'),
        city: cityParam,
        likes: likesParam,
        avoid: avoidParam,
      }),
      execute: async ({ for_whom, day, day_number, city, likes, avoid }) => {
        const where = whereFor(ctx, city);
        const { vibe, basis } = resolveVibe(ctx, for_whom, likes, avoid);
        const now = new Date();
        const { today } = istClock(now);
        const tripStart = parseIsoDay(ctx.trip.startDate);
        const tripEnd = parseIsoDay(ctx.trip.endDate) ?? tripStart;

        // A named trip day wins when the trip has dates; otherwise plan today or tomorrow
        const date = day_number && tripStart ? addDays(tripStart, day_number - 1) : addDays(today, day === 'tomorrow' ? 1 : 0);
        if (daysBetween(today, date) < 0) throw new llm.ToolError(`Day ${day_number} has already gone. Ask which day to plan instead.`);
        let dayNumber: number | null = tripStart ? daysBetween(tripStart, date) + 1 : (day_number ?? null);
        if (dayNumber !== null && (dayNumber < 1 || dayNumber > 60 || (tripEnd !== null && daysBetween(tripEnd, date) > 0))) dayNumber = null;

        const members = for_whom === 'squad' ? membersWithVibes(ctx) : [];
        const stops = planDay(vibe, { city: where, day: date, now, solo: for_whom === 'me', exclude: [...stateOf(ctx).joined], members });
        const label = dayLabel(date, today);
        if (!stops.length) throw new llm.ToolError(`Nothing else runs in ${where} ${label.toLowerCase()}. Offer to plan another day.`);

        const plan: DayPlan = {
          id: randomUUID(),
          city: where,
          dayLabel: label,
          dayNumber,
          basis,
          stops: stops.map(s => ({ experienceId: s.experience.id, start: formatTime(s.start), end: formatTime(s.end), matchPercent: s.match })),
        };
        stateOf(ctx).pendingPlan = { plan, stops };
        void ctx.ui({ type: 'day.plan', plan });

        const next = dayNumber !== null
          ? `Pitch the day in two sentences, then ask if they want it added to Day ${dayNumber} of the itinerary.`
          : tripStart
            ? `${label} isn't one of the trip's dates, so it can't go on the itinerary; just pitch the day.`
            : 'The trip has no dates. Pitch the day; if they want it on the itinerary, ask which trip day (day 1, day 2…) and call plan_day again with day_number.';
        return `${fallbackNote(ctx, where, city)}${basisNote(ctx, basis, vibe)}\n${label} in ${where} (shown on screen, in order):\n${stops.map(s => `${formatTime(s.start)}–${formatTime(s.end)}: ${describe(s, today)}`).join('\n')}\n${next}`;
      },
    }),

    llm.tool({
      name: 'add_day_plan',
      description: 'Add the pending day plan to the itinerary. Only call after the user explicitly said yes.',
      execute: async (_args, { ctx: run }) => {
        try { run.disallowInterruptions(); } catch {}
        try {
          const { dayNumber, count, duplicate } = await commitPlan(ctx);
          return duplicate ? `That plan is already on Day ${dayNumber}. Say so in a few words.` : `Added ${count} stops to Day ${dayNumber} of the itinerary. Tell them in a few words.`;
        } catch (err) {
          if (err instanceof NoPendingPlanError) throw new llm.ToolError('There is no day plan waiting. Ask if they want you to plan one.');
          if (err instanceof llm.ToolError) throw err;
          throw new llm.ToolError(`Adding to the itinerary failed (${(err as Error).message}). Tell them briefly and offer to retry.`);
        }
      },
    }),

    llm.tool({
      name: 'cancel_day_plan',
      description: 'Drop the pending day plan without adding it.',
      execute: async () => {
        const dropped = cancelPlan(ctx);
        return dropped ? 'Dropped the day plan. Say so briefly, and offer another plan if they want one.' : 'There was no day plan waiting.';
      },
    }),
  ],

  async onAction(action, ctx) {
    if (action.type === 'experience.join') {
      stateOf(ctx).joined.add(action.experienceId);
      return `The user tapped Join on "${titleOf(action.experienceId)}" and is in. Tell them in a few words; the host will message the details.`;
    }
    if (action.type === 'plan.add') {
      try {
        const { dayNumber, count, duplicate } = await commitPlan(ctx, action.planId);
        return duplicate
          ? `The user tapped Add, but the plan was already on Day ${dayNumber}. Say so in a few words.`
          : `The user tapped Add and ${count} stops went on Day ${dayNumber} of the itinerary. Tell them briefly.`;
      } catch (err) {
        if (err instanceof NoPendingPlanError) return 'The user tapped Add on a plan that is no longer pending. Briefly ask if they want a new plan.';
        return `The user tapped Add but it failed: ${(err as Error).message}. Tell them briefly and offer to retry.`;
      }
    }
    if (action.type === 'plan.cancel') {
      const dropped = cancelPlan(ctx, action.planId);
      return dropped ? `The user tapped Cancel on the ${dropped.dayLabel.toLowerCase()} plan; nothing was added. Briefly say so.` : null;
    }
    return null;
  },
};
