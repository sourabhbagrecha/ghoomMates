// Crowds skill: how busy Udaipur's heritage sites are right now, the quietest time to visit one, and quieter spots
// with the same feel. Uses the same forecasts as the itinerary's crowd meter.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { cityOf, liveCrowds } from '../../heritage/crowd.ts';
import { SITE_BY_ID, SITES } from '../../heritage/sites.ts';
import type { Skill } from './types.ts';

const IDS = SITES.map(s => s.id) as [string, ...string[]];
const names = SITES.map(s => `${s.name} [${s.id}]`).join(', ');

export const crowds: Skill = {
  name: 'crowds',

  instructions: () => `## Crowds at heritage sites (Udaipur)
- Sites with live crowd data: ${names}.
- When the user asks how crowded a place is, when to go, how to skip queues or rush, or for somewhere quiet ("City Palace abhi bheed hai?", "best time for Sajjangarh?", "kahin shanti wali jagah?"), call check_crowds. Pass site_id when they name one.
- Answer in one or two sentences: how busy it is now, the quietest time today, and if it's busy, the quieter spot with the same feel.
- Gently favour lesser-known gems and off-peak times; spreading visitors out keeps the old city liveable for the people who live there. Don't lecture.
- They can see live crowds on the Explore screen; offer to open it only if they want the map.`,

  tools: (ctx) => [
    llm.tool({
      name: 'check_crowds',
      description: 'Live crowd level at Udaipur heritage sites, the quietest time today and quieter alternatives.',
      parameters: z.object({
        site_id: z.enum(IDS).optional().describe('The site they asked about. Omit for an overview of where is busy and quiet now.'),
      }),
      execute: async ({ site_id }) => {
        const city = cityOf(ctx.trip.destination) ?? 'Udaipur';
        const live = liveCrowds(city);
        const day = live.dayNote ? ` It's ${live.dayNote}, so busier than usual.` : '';
        if (!site_id) {
          const open = live.sites.filter(s => s.level !== null);
          const busy = open.filter(s => s.label === 'packed' || s.label === 'busy').slice(0, 4);
          const quiet = open.filter(s => s.label === 'quiet').slice(-4);
          return `It's ${live.time} in ${city}.${day} Busy now: ${busy.map(s => `${s.name} (${s.label})`).join(', ') || 'nowhere'}. Quiet now: ${quiet.map(s => `${s.name}${s.gem ? ', a lesser-known gem' : ''}`).join(', ') || 'nowhere'}.`;
        }
        const site = live.sites.find(s => s.id === site_id)!;
        const alternatives = SITE_BY_ID.get(site_id)!.alternatives
          .map(id => live.sites.find(s => s.id === id)!)
          .filter(s => s.label === 'quiet' || s.label === 'moderate');
        const now = site.level === null ? 'closed right now' : `${site.label} right now (${site.level}/100${site.waitMinutes ? `, about ${site.waitMinutes} minutes of queue` : ''}, ${site.trend})`;
        return [
          `It's ${live.time}. ${site.name} is ${now}.${day}`,
          site.events[0] && `${site.events[0].name} is on today: ${site.events[0].note}.`,
          site.best && `Quietest today around ${site.best.time}.`,
          site.quietAt && `It next gets quiet around ${site.quietAt}.`,
          alternatives.length && `Quieter with a similar feel: ${alternatives.map(a => `${a.name} (${a.label})`).join(', ')}.`,
          `Visiting tip: ${site.care}`,
        ].filter(Boolean).join(' ');
      },
    }),
  ],
};
