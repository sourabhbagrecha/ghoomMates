// Events skill: what is on in Udaipur and nearby (festivals, fairs, nightly shows) around the squad's trip, how crowded each
// gets and the one thing that matters for joining respectfully. Same calendar and crowd model as the Mewar Utsav screen.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { addDays, daysBetween, isIsoDate, todayInIndia, weekdayOf } from '../../events/dates.ts';
import { listEvents, type EventInstance } from '../../events/logic.ts';
import type { Skill } from './types.ts';

const MAX_DAYS = 400;
const MAX_ITEMS = 5;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat, 7 Nov", the way the app writes dates */
const dayLabel = (date: string) => `${WEEKDAYS[weekdayOf(date)]}, ${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

const when = (item: EventInstance) => (item.from === item.to ? dayLabel(item.from) : `${dayLabel(item.from)} to ${dayLabel(item.to)}`);

/** The answer GhoomMate reads out for a window: dated events first, then the nightly shows, then what has no date yet */
export function describeEvents(from: string, to: string, today: string) {
  const list = listEvents({ from, to, today });
  const shown = list.items.slice(0, MAX_ITEMS);
  const lines = shown.map(item => {
    const where = item.crowd.sites.length ? ` Busiest around ${item.crowd.sites[0].siteName}, ${item.crowd.sites[0].windowLabel}.` : '';
    return `${item.name} (${when(item)}), ${item.time.label}. Expect ${item.crowd.label} crowds: ${item.crowd.headline}${where} To join respectfully: ${item.join.etiquette[0]}`;
  });
  const more = list.items.length - shown.length;
  const range = `${dayLabel(from)} to ${dayLabel(to)}`;
  const parts = [
    lines.length ? `On from ${range}:\n${lines.join('\n')}${more > 0 ? `\n(and ${more} more on the Explore screen)` : ''}` : `No festivals or fairs in the verified calendar from ${range}.`,
    `Every evening: ${list.recurring.map(r => `${r.name}, ${r.time.label}`).join('; ')}.`,
    list.undated.length ? `Dates not announced yet, so don't promise any: ${list.undated.map(u => u.name).join(', ')}.` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

export const events: Skill = {
  name: 'events',

  instructions: () => `## Festivals, fairs and shows (Udaipur)
- When the user asks what is on, whether a festival falls in the trip, what a festival is about, or how to behave at one ("is Diwali during our trip?", "aaj kuch special hai?", "what is the Dharohar show?"), call whats_on.
- Dates come only from that verified calendar. Never invent a date for an event it doesn't list, and when it says the dates aren't announced, say that.
- Answer in two or three sentences: what, when, how crowded, and the one respectful thing to do. Offer to put it in the plan: they can tap Add to our itinerary in Mewar Utsav on the Explore screen.`,

  tools: (ctx) => [
    llm.tool({
      name: 'whats_on',
      description: 'Festivals, fairs and nightly shows in Udaipur and nearby for a range of days, with the crowd and the respectful way to join.',
      parameters: z.object({
        from: z.string().optional().describe('First day, YYYY-MM-DD. Defaults to the first day of the trip, else today.'),
        to: z.string().optional().describe('Last day, YYYY-MM-DD. Defaults to the last day of the trip, else a week after the first day.'),
      }),
      execute: async ({ from, to }) => {
        const today = todayInIndia();
        const { startDate, endDate } = ctx.trip;
        if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) throw new llm.ToolError('Dates need to look like 2026-11-08.');
        const first = from ?? (startDate && (endDate ?? startDate) >= today ? (startDate > today ? startDate : today) : today);
        const last = to ?? (from ? addDays(first, 6) : startDate && endDate && endDate >= first ? endDate : addDays(first, 6));
        if (last < first || daysBetween(first, last) > MAX_DAYS) throw new llm.ToolError('Ask for a range of up to about a year, starting with the earlier day.');
        return describeEvents(first, last, today);
      },
    }),
  ],
};
