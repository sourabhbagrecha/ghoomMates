// Places skill: what to see, do and eat at the trip's destination, from the researched destination guides
// (src/places). Covers sights, hidden gems, food, workshops, nature, nightlife, shopping and day trips, plus the
// city's must-knows, for every destination we have a guide for, ranked for the squad's quiz vibe.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { GUIDE_BY_ID, GUIDES, guideFor, ITEM_KINDS, monthOf, rankItems, TRAVELLERS, type CityGuide, type PlaceItem } from '../../places/index.ts';
import { blendVibes } from '../experiences.ts';
import type { Skill, SkillContext } from './types.ts';

const IDS = GUIDES.map(g => g.id) as [string, ...string[]];
const MAX = 5;

const rupees = (n: number) => (n === 0 ? 'free' : `about ₹${n.toLocaleString('en-IN')}`);
const say = (item: PlaceItem) =>
  `${item.name} (${item.kind}${item.gem ? ', a lesser-known gem' : ''}, ${item.area}; best at ${item.bestTime}; ${rupees(item.costRupees)}): ${item.pitch} Tip: ${item.tip}`;

const tripGuide = (ctx: SkillContext): CityGuide | null => guideFor(ctx.trip.destination) ?? guideFor(ctx.trip.name);

export const places: Skill = {
  name: 'places',

  instructions: (ctx) => {
    const here = tripGuide(ctx);
    return `## Places to see, do and eat (destination guides)
- We have researched guides for: ${GUIDES.map(g => g.name).join(', ')}.${here ? ` This trip is to ${here.name}.` : ''}
- When they ask what to see or do, for hidden gems, where to eat, what a place is known for, day trips, shopping, nightlife, or practical must-knows (permits, getting around, best season), call find_places. Pass guide_id for another destination they name.
- Bookable guide trips with set times still come from the experiences skill; use find_places for everything else.
- Answer with two or three picks in a sentence or two each, nudging towards a lesser-known gem and local, family-run places. Mention cost and the best time only when useful.`;
  },

  tools: (ctx) => [
    llm.tool({
      name: 'find_places',
      description: 'Researched places at a destination: sights, hidden gems, food, workshops, nature, nightlife, shopping and day trips, ranked for the squad, plus the destination’s must-knows.',
      parameters: z.object({
        guide_id: z.enum(IDS).optional().describe('Destination to look up; omit for the trip’s own destination.'),
        kind: z.enum(ITEM_KINDS).optional().describe('Only this kind of place.'),
        gems_only: z.boolean().optional().describe('Only lesser-known, uncrowded spots.'),
        traveller: z.enum(TRAVELLERS).optional().describe('Who it should suit, e.g. families or seniors.'),
        max_cost_rupees: z.number().int().min(0).optional().describe('Per-person budget for one item.'),
        about: z.boolean().optional().describe('True for the destination’s must-knows (season, getting around, permits, food) instead of places.'),
      }),
      execute: async ({ guide_id, kind, gems_only, traveller, max_cost_rupees, about }) => {
        const guide = guide_id ? GUIDE_BY_ID.get(guide_id)! : tripGuide(ctx);
        if (!guide) return `We don’t have a researched guide for ${ctx.trip.destination ?? 'this trip'} yet. Guides exist for: ${GUIDES.map(g => g.name).join(', ')}.`;
        if (about) {
          return [
            `${guide.name}, ${guide.state}: ${guide.summary}`,
            `Best months: ${guide.bestMonths.join(', ')}. ${guide.avoid}`,
            `Getting there: ${guide.gettingThere} Getting around: ${guide.gettingAround}`,
            `Must-knows: ${guide.practical.join(' ')}`,
            `Eat: ${guide.dishes.slice(0, 5).map(d => d.name).join(', ')}.`,
          ].join('\n');
        }
        const vibe = blendVibes(ctx.members.map(m => m.vibe));
        const found = rankItems(guide, {
          vibe, kinds: kind ? [kind] : undefined, gems: gems_only, traveller, maxCostRupees: max_cost_rupees ?? null,
          month: monthOf(ctx.trip.startDate),
        });
        if (!found.length) return `Nothing in our ${guide.name} guide matches that. Try fewer filters.`;
        return `From our ${guide.name} guide${vibe ? ', best fit for the squad first' : ''}:\n${found.slice(0, MAX).map(r => `- ${say(r.item)}`).join('\n')}`;
      },
    }),
  ],

  working: { find_places: 'Looking through the guide…' },
};
