// Reels skill: cut a reel from the trip album, stream its render progress to the on-screen card, announce it when ready.
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { logger } from '../../logger.ts';
import { BackendError } from '../backendClient.ts';
import { firstName, resolveParticipants } from '../members.ts';
import type { ReelJob } from '../protocol.ts';
import type { Skill, SkillContext } from './types.ts';

const VIBES = ['bollywood', 'chill', 'party', 'cinematic', 'retro'] as const;
const POLL_MS = 1000;
// The stubbed render takes ~11s; stop watching well after that
const MAX_POLLS = 45;

const reelsPath = (ctx: SkillContext) => `/api/trips/${ctx.tripId}/reels`;
const errorMessage = (err: unknown) => (err as Error)?.message || 'something went wrong';

/** Only what the card needs from the API's reel. */
const toJob = (reel: ReelJob): ReelJob => ({
  id: reel.id,
  title: reel.title,
  prompt: reel.prompt,
  music: reel.music,
  durationSec: reel.durationSec,
  clips: reel.clips,
  featuring: reel.featuring,
  status: reel.status,
  progress: reel.progress,
  stages: reel.stages,
  photos: reel.photos,
  coverUrl: reel.coverUrl,
});

/** Polls the reel, pushing each step to the card, until it's ready. A newer reel takes over the watch. */
async function watch(ctx: SkillContext, reelId: string) {
  const token = Symbol(reelId);
  ctx.state.reelWatch = token;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    if (ctx.state.reelWatch !== token) return;
    let reel: ReelJob;
    try {
      reel = await ctx.api.get<ReelJob>(`${reelsPath(ctx)}/${reelId}`);
    } catch (err) {
      logger.warn('Voice', `Reel ${reelId} status check failed: ${errorMessage(err)}`);
      continue;
    }
    if (reel.status === 'ready') {
      ctx.state.reelWatch = null;
      void ctx.ui({ type: 'reel.ready', reel: toJob(reel) });
      ctx.say(`The reel "${reel.title}" is ready (${reel.clips} clips, ${reel.music}). Tell ${firstName(ctx.me.name)} in one short, excited sentence and that they can tap Watch on the card.`);
      return;
    }
    void ctx.ui({ type: 'reel.progress', reel: toJob(reel) });
  }
}

export const reel: Skill = {
  name: 'reel',

  instructions: () => `## Reels
- make_reel cuts a short reel from the trip album and shows its progress on screen. Use it for a reel, video, montage, recap, highlights or story.
- Don't interrogate. "Make a reel" alone is enough: whole squad, 30 seconds, bollywood vibe. Only ask if a name you were given isn't in the trip.
- Invent a short, fun title (at most 6 words), like "Kabir's funniest moments" or "Goa squad highlights".
- Pass their request as prompt. Vibe: bollywood (default), chill, party, cinematic or retro, whichever fits what they said.
- After starting, say one short line like "On it, cutting your reel now!" Don't narrate the steps; the card shows them. You'll be told when it's ready.
- reel_status says how the latest reel is doing.`,

  tools: (ctx) => [
    llm.tool({
      name: 'make_reel',
      description: 'Start cutting a short video reel from the trip photo album. Progress shows on the user\'s screen.',
      parameters: z.object({
        title: z.string().describe('Short, fun title, at most 6 words'),
        prompt: z.string().describe('What the user asked for, in their words'),
        featuring: z.array(z.string()).optional().describe('Names of members the reel is about. Omit for the whole squad.'),
        vibe: z.enum(VIBES).optional().describe('Music and pacing. Default bollywood.'),
        durationSec: z.number().int().min(10).max(60).optional().describe('Length in seconds. Default 30.'),
      }),
      execute: async ({ title, prompt, featuring, vibe, durationSec }) => {
        let featuringIds: string[] = [];
        if (featuring?.length) {
          const result = resolveParticipants(featuring, ctx.members, ctx.me.memberId);
          if (!result.ok) {
            const members = ctx.members.map(m => m.name).join(', ');
            if (result.reason === 'ambiguous') throw new llm.ToolError(`"${result.name}" matches ${result.candidates.map(c => c.name).join(' and ')}. Ask which one.`);
            throw new llm.ToolError(`Nobody called "${result.name}" is in this trip. Members: ${members}. Ask who they meant.`);
          }
          // Everyone named = the whole squad
          if (result.ids.length < ctx.members.length) featuringIds = result.ids;
        }

        let started: ReelJob;
        try {
          started = await ctx.api.post<ReelJob>(reelsPath(ctx), { title: title.trim().slice(0, 80), prompt: prompt.trim().slice(0, 500), featuring: featuringIds, vibe, durationSec }, { idempotencyKey: randomUUID() });
        } catch (err) {
          if (err instanceof BackendError && err.code === 'NO_PHOTOS') {
            throw new llm.ToolError('The trip album has no photos yet. Tell them to upload a few first and offer to open the photos screen.');
          }
          throw new llm.ToolError(`Couldn't start the reel: ${errorMessage(err)}. Tell the user briefly and ask if you should try again.`);
        }

        void ctx.ui({ type: 'reel.progress', reel: toJob(started) });
        void watch(ctx, started.id).catch(err => logger.warn('Voice', `Reel watch stopped: ${errorMessage(err)}`));
        return `Started "${started.title}": ${started.clips} clips, ${started.music}, about ${started.durationSec} seconds. It takes around ten seconds. Say one short line that you're on it.`;
      },
    }),
    llm.tool({
      name: 'reel_status',
      description: 'How the most recent reel is doing.',
      parameters: z.object({}),
      execute: async () => {
        let items: ReelJob[];
        try {
          ({ items } = await ctx.api.get<{ items: ReelJob[] }>(reelsPath(ctx)));
        } catch (err) {
          throw new llm.ToolError(`Couldn't check reels: ${errorMessage(err)}. Tell the user briefly.`);
        }
        const latest = items[0];
        if (!latest) return 'No reels yet for this trip. Offer to make one.';
        void ctx.ui({ type: latest.status === 'ready' ? 'reel.ready' : 'reel.progress', reel: toJob(latest) });
        if (latest.status === 'ready') return `"${latest.title}" is ready (${latest.clips} clips). It's on their screen; they can tap Watch.`;
        const current = latest.stages.find(s => s.status === 'current');
        return `"${latest.title}" is ${Math.round(latest.progress * 100)}% done${current ? `, ${current.label.toLowerCase()}` : ''}.`;
      },
    }),
  ],
};
