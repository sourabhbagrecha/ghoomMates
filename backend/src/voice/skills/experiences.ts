// Experiences skill: recommend guide trips (Explore → "Trips by local guides") that fit the speaker's or the
// squad's personality-quiz vibe, show them as a card, and open one on request.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  EXPERIENCE_CITIES,
  EXPERIENCE_TAGS,
  EXPERIENCES,
  asVibe,
  blendVibes,
  cityForDestination,
  rankExperiences,
  topAxes,
  type RankedExperience,
  type Vibe,
  type VibeAxis,
} from '../experiences.ts';
import { firstName } from '../members.ts';
import type { ExperiencePick, RecommendationBasis } from '../protocol.ts';
import type { Skill, SkillContext } from './types.ts';

const PICKS = 3;
const IDS = EXPERIENCES.map(e => e.id) as [string, ...string[]];

const list = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

/** "Adventure + food" for the card; "Top rated" when nothing in the vibe stands out */
export function reasonLabel(because: VibeAxis[]): string {
  if (!because.length) return 'Top rated';
  const [first, ...rest] = because.slice(0, 2);
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' + ');
}

/** Whose vibe to rank with: the speaker's quiz, else the squad blend, else none (rank by rating) */
export function vibeFor(ctx: Pick<SkillContext, 'me' | 'members'>, forWhom: 'me' | 'squad'): { vibe: Vibe | null; basis: RecommendationBasis } {
  if (forWhom === 'me') {
    const mine = asVibe(ctx.members.find(m => m.memberId === ctx.me.memberId)?.vibe);
    if (mine) return { vibe: mine, basis: 'you' };
  }
  const squad = blendVibes(ctx.members.map(m => m.vibe));
  return squad ? { vibe: squad, basis: 'squad' } : { vibe: null, basis: 'rating' };
}

function describe(rank: RankedExperience, index: number) {
  const e = rank.experience;
  const fit = rank.match === null ? `rated ${e.rating}` : `${rank.match}% match${rank.because.length ? ` (${list(rank.because)})` : ''}`;
  return `${index + 1}. ${e.title} [id ${e.id}], ${fit}, ${rupees(e.priceRupees)} per person, ${e.date} at ${e.startTime}, ${e.duration}. ${e.pitch}.`;
}

function basisNote(ctx: SkillContext, basis: RecommendationBasis, vibe: Vibe | null, forWhom: 'me' | 'squad') {
  const strongest = vibe ? list(topAxes(vibe)) : '';
  if (basis === 'you') return `Ranked for ${firstName(ctx.me.name)}'s personality quiz: strongest on ${strongest}.`;
  if (basis === 'squad') {
    const missed = forWhom === 'me' ? ` ${firstName(ctx.me.name)} hasn't taken the vibe quiz yet, so these fit the squad instead; mention the quiz in Profile once, briefly.` : '';
    return `Ranked for the squad's blended vibe: strongest on ${strongest}.${missed}`;
  }
  return 'Nobody in the squad has taken the vibe quiz, so these are simply the top-rated trips. Suggest the vibe quiz in Profile once, briefly.';
}

export const experiences: Skill = {
  name: 'experiences',

  instructions: (ctx) => `## Guide trips and experiences
- Local guides host experiences (treks, food walks, cooking classes, boat rides, nights out) in ${list([...EXPERIENCE_CITIES])}.
- When the user asks what to do, to plan their day or a trip, for a recommendation, or for something matching their mood ("kuch adventurous", "something chill tonight", "plan a solo trip in Udaipur", "what would we all enjoy?"), call recommend_experiences right away. Don't say planning is coming soon first.
- for_whom: "me" for the speaker, including solo plans ("solo", "just me", "for myself"); "squad" when they ask for the group. Pass city when they name Goa or Udaipur, even if the trip is elsewhere. Pass a tag only if they name a kind of thing.
- The picks appear on screen. Pitch the top pick in one or two sentences and say why it suits them, using the personality traits the tool gives you ("you're big on adventure, so…"). Mention the others only briefly.
- If they want one ("open the first one", "book the boat ride", "tell me more"), call open_experience with its id. Booking is done on that screen with Join; never say you booked it.
- The trip's destination is ${ctx.trip.destination || 'not set'}. If they don't name a city and the destination isn't one of those, ask which city they mean.`,

  tools: (ctx) => [
    llm.tool({
      name: 'recommend_experiences',
      description: 'Recommend local guide experiences that fit the personality-quiz vibe of the speaker or the whole squad.',
      parameters: z.object({
        for_whom: z.enum(['me', 'squad']).describe('"me" for the speaker, "squad" for the whole group'),
        city: z.enum(EXPERIENCE_CITIES).optional().describe('Only if the user names a city. Omit to use the trip destination.'),
        tag: z.enum(EXPERIENCE_TAGS).optional().describe('Only if the user asks for a kind of experience. Omit otherwise.'),
      }),
      execute: async ({ for_whom, city, tag }) => {
        const where = city ?? cityForDestination(ctx.trip.destination);
        if (!where) throw new llm.ToolError(`Guide trips are only in ${list([...EXPERIENCE_CITIES])} for now. Ask which city they'd like ideas for.`);

        const { vibe, basis } = vibeFor(ctx, for_whom);
        const ranked = rankExperiences(vibe, { city: where, tag }).slice(0, PICKS);
        if (!ranked.length) throw new llm.ToolError(`There are no ${tag} guide trips in ${where} yet. Offer the best ones of another kind instead.`);

        const picks: ExperiencePick[] = ranked.map(r => ({ experienceId: r.experience.id, matchPercent: r.match, reason: reasonLabel(r.because) }));
        void ctx.ui({ type: 'experiences.recommended', city: where, basis, picks });
        return `${basisNote(ctx, basis, vibe, for_whom)}\nTop picks in ${where} (shown on screen):\n${ranked.map(describe).join('\n')}`;
      },
    }),
    llm.tool({
      name: 'open_experience',
      description: 'Open the detail screen of one guide experience so the user can see it and join.',
      parameters: z.object({ experience_id: z.enum(IDS).describe('The id from recommend_experiences') }),
      execute: async ({ experience_id }) => {
        void ctx.ui({ type: 'experience.open', experienceId: experience_id });
        const title = EXPERIENCES.find(e => e.id === experience_id)?.title ?? 'that trip';
        return `Opened "${title}". Say so in a few words and that they can tap Join there.`;
      },
    }),
  ],
};
