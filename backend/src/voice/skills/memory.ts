// Memory skill: things the speaker says about themselves ("vegetarian", "not a morning person", "keep it under
// ₹1,500") are saved on their profile, so GhoomMate remembers them in later chats and picks follow them.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { VIBE_AXES } from '../experiences.ts';
import { firstName } from '../members.ts';
import { forget, memoryLines, remember, type GhoomateMemory } from '../memory.ts';
import type { Skill, SkillContext } from './types.ts';

/** Saves the speaker's memory onto their profile (preferences.ghoomate; other preference keys are left alone) */
async function save(ctx: SkillContext, memory: GhoomateMemory) {
  await ctx.api.patch('/auth/profile', { preferences: { ghoomate: memory } });
  ctx.memory = memory;
}

const failed = (err: unknown) => new llm.ToolError(`Couldn't save that (${(err as Error).message}). Tell them briefly; it still counts for this chat.`);

export const memory: Skill = {
  name: 'memory',

  working: { remember_preference: 'Noting that…', forget_preference: 'Forgetting that…' },

  instructions: (ctx) => {
    const lines = memoryLines(ctx.memory);
    const name = firstName(ctx.me.name);
    return `## Memory (what ${name} told you in earlier chats)
${lines.length ? lines.map(l => `- ${l}`).join('\n') : '- Nothing yet.'}
- Use these quietly: they already shape recommendations and day plans. Mention one only when it explains a pick ("no early starts, so…").
- When ${name} says something lasting about themselves that should shape suggestions (diet, "not a morning person", a budget, "I love history", "no water sports", fears), call remember_preference in the same turn, then confirm in a few words ("Noted!"). Fill the rule fields when they apply.
- Don't remember one-off moods ("tonight I want something chill"), anything about other people, or anything they didn't say about themselves. Keep notes short and neutral ("vegetarian", not reasons).
- "Forget that…" means forget_preference. "What do you remember about me?" means read the list above in one sentence.`;
  },

  tools: (ctx) => [
    llm.tool({
      name: 'remember_preference',
      description: 'Remember something lasting the speaker said about themselves, across chats. Shapes future picks.',
      parameters: z.object({
        note: z.string().describe('Short, in their words: "vegetarian", "not a morning person", "budget ₹1,500"'),
        no_early_starts: z.boolean().optional().describe('True if they don’t want things starting early in the morning'),
        max_price_rupees: z.number().int().positive().optional().describe('Most they want to spend per experience, if they said'),
        likes: z.array(z.enum(VIBE_AXES)).optional().describe('Vibes this note says they enjoy'),
        avoid: z.array(z.enum(VIBE_AXES)).optional().describe('Vibes this note says to steer clear of'),
      }),
      execute: async ({ note, no_early_starts, max_price_rupees, likes, avoid }) => {
        const next = remember(ctx.memory, { text: note, noEarlyStarts: no_early_starts, maxPriceRupees: max_price_rupees, likes, avoid });
        if (next === ctx.memory) throw new llm.ToolError('The note was empty. Ask what they want you to remember.');
        try {
          await save(ctx, next);
        } catch (err) {
          ctx.memory = next;
          throw failed(err);
        }
        const saved = next.notes[next.notes.length - 1].text;
        void ctx.ui({ type: 'notice', message: `I’ll remember: ${saved}` });
        return `Saved "${saved}". Confirm in a few words.`;
      },
    }),

    llm.tool({
      name: 'forget_preference',
      description: 'Forget something remembered about the speaker.',
      parameters: z.object({ about: z.string().describe('Words from the note to forget, e.g. "vegetarian"') }),
      execute: async ({ about }) => {
        const { memory: next, removed } = forget(ctx.memory, about);
        if (!removed.length) {
          const known = memoryLines(ctx.memory);
          throw new llm.ToolError(`Nothing remembered matches "${about}". ${known.length ? `You remember: ${known.join('; ')}.` : 'You remember nothing yet.'} Tell them briefly.`);
        }
        try {
          await save(ctx, next);
        } catch (err) {
          ctx.memory = next;
          throw failed(err);
        }
        const forgotten = removed.map(n => n.text).join(', ');
        void ctx.ui({ type: 'notice', message: `Forgot: ${forgotten}` });
        return `Forgot "${forgotten}". Confirm in a few words.`;
      },
    }),
  ],
};
