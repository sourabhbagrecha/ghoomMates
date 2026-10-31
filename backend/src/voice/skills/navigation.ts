// Navigation skill: open an app screen. Also the graceful fallback for features that aren't voice-enabled yet.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { SCREEN_ROUTES, type Screen } from '../protocol.ts';
import type { Skill } from './types.ts';

const SCREENS = Object.keys(SCREEN_ROUTES) as [Screen, ...Screen[]];

export const navigation: Skill = {
  name: 'navigation',

  instructions: () => `## Screens
- open_screen opens a screen in the app: expenses, itinerary, photos, explore, members, reel.
- Making a reel or story from photos: say the full voice feature is coming soon and offer to open the reel screen.
- Planning a day or a trip ("I'm free tomorrow, plan something", "kal kya karein?", "plan a solo trip in Udaipur"): use plan_day; never say planning is coming soon.
- Anything else you can't do yet: say it's coming soon and offer the closest screen. Only open a screen once they agree or ask for it.`,

  tools: (ctx) => [
    llm.tool({
      name: 'open_screen',
      description: 'Open a screen in the Ghoomates app for the user.',
      parameters: z.object({ screen: z.enum(SCREENS).describe('Which screen to open') }),
      execute: async ({ screen }) => {
        void ctx.ui({ type: 'navigate', screen });
        return `Opened the ${screen} screen. Say so in a few words.`;
      },
    }),
  ],
};
