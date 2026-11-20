// Photos skill: find photos of any members, by expression and by scene, and show them on the Photos screen.
// The realtime model parses the request itself ("Sourabh's and Bhavya's photos", "where I was smiling", "my hiking
// photos"); names resolve like expense names, and POST /api/trips/:tripId/photos/find does the search.
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { BackendError } from '../backendClient.ts';
import { firstName, isEveryone, resolveMember, type Resolution } from '../members.ts';
import { PHOTO_EXPRESSIONS, type PhotoExpression, type PhotoFilter } from '../protocol.ts';
import type { Skill, SkillContext, TripMember } from './types.ts';

export type FindPhotosArgs = { people: string[]; together: boolean; expression: PhotoExpression | 'none'; scene: string };
export type FindResult = {
  filter: PhotoFilter;
  label: string;
  photoIds: string[];
  skipped: { userId: string; name: string; status: string }[];
};

const list = (items: string[], word = 'and') => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;

// Spoken names → trip user ids, or the question to ask when a name is unclear
export function photoFilterFor(args: FindPhotosArgs, members: TripMember[], meMemberId: string): { filter: PhotoFilter } | { question: string } {
  const userIds: string[] = [];
  const everyone = args.people.some(isEveryone);
  for (const name of everyone ? [] : args.people) {
    const result: Resolution = resolveMember(name, members, meMemberId);
    if (!result.ok) {
      const roster = list(members.map(m => m.name));
      return {
        question: result.reason === 'ambiguous'
          ? `"${result.name}" matches more than one member. Ask: which ${result.name}, ${list(result.candidates.map(c => c.name), 'or')}?`
          : `Nobody called "${result.name}" is in this trip. Members: ${roster}. Ask who they meant.`,
      };
    }
    const userId = members.find(m => m.memberId === result.ids[0])?.userId;
    if (userId && !userIds.includes(userId)) userIds.push(userId);
  }
  const filter: PhotoFilter = { userIds, match: args.together && userIds.length > 1 ? 'all' : 'any' };
  if (args.expression !== 'none') filter.expression = args.expression;
  const scene = args.scene.trim();
  if (scene) filter.scene = scene.slice(0, 80);
  if (!userIds.length && !filter.expression && !filter.scene) {
    return { question: 'It\'s unclear whose photos or which moments they want. Ask, e.g. "Whose photos, or which day or place?"' };
  }
  return { filter };
}

// What the model says once the photos are on screen
export function photosSpeech(result: FindResult, meUserId: string) {
  const count = result.photoIds.length;
  const skipped = result.skipped.map(s => (s.userId === meUserId ? 'you' : firstName(s.name)));
  const missing = skipped.length
    ? ` ${list(skipped)} ${skipped.length === 1 && skipped[0] !== 'you' ? 'hasn\'t' : 'haven\'t'} added a selfie that can be searched yet, so mention that only the others were searched and that a selfie in the profile fixes it.`
    : '';
  if (!count) return `No photos match "${result.label}". The Photos screen is open. Say so kindly in one sentence and suggest something broader.${missing}`;
  return `The Photos screen now shows ${count} photo${count === 1 ? '' : 's'} for "${result.label}". Say so in one short sentence; don't list them.${missing}`;
}

export const photos: Skill = {
  name: 'photos',

  instructions: () => `## Photos
- find_photos shows the trip's photos of any members, of a facial expression, and/or of a scene, on the Photos screen. Use it for "show my photos", "Sourabh's and Bhavya's photos", "photos where I was smiling", "my hiking photos", "Bhavya at the haldi", "conference hall photos".
- people: spoken names, "me" for the speaker. "X's and Y's photos" → together false; "X with Y", "both of us", "together" → together true.
- expression: smiling or laughing → happy; serious → neutral; shocked or surprised → surprise; otherwise none.
- scene: the activity, place, occasion or time in a few plain words ("hiking", "haldi", "conference hall", "sunset at the lake"); empty when not asked.
- People are found by the selfie in their profile; someone without one can't be found yet.`,

  working: { find_photos: 'Finding photos…' },

  tools: (ctx: SkillContext) => [
    llm.tool({
      name: 'find_photos',
      description: 'Find trip photos by who is in them, their facial expression and/or the scene, and show them on the Photos screen.',
      parameters: z.object({
        people: z.array(z.string()).describe('Names of the members who must be in the photos; "me" for the speaker; empty for anyone'),
        together: z.boolean().describe('True only when all of these people must be in the same photo'),
        expression: z.enum(['none', ...PHOTO_EXPRESSIONS]).describe('Facial expression: happy for smiling or laughing; none if not asked'),
        scene: z.string().describe('Activity, place, occasion or time of day, in a few words; empty if not asked'),
      }),
      execute: async (args) => {
        const built = photoFilterFor(args, ctx.members, ctx.me.memberId);
        if ('question' in built) throw new llm.ToolError(built.question);
        let result: FindResult;
        try {
          result = await ctx.api.post<FindResult>(`/api/trips/${ctx.tripId}/photos/find`, built.filter);
        } catch (err) {
          if (err instanceof BackendError && (err.code === 'NO_SELFIE' || err.code === 'SELFIE_PROCESSING')) {
            throw new llm.ToolError(`${err.message}. Tell the user in one sentence; a selfie in the profile lets the squad find them.`);
          }
          throw new llm.ToolError(`Couldn't search photos: ${(err as Error)?.message || 'something went wrong'}. Tell the user briefly.`);
        }
        void ctx.ui({ type: 'photos.filter', filter: result.filter, label: result.label, photoIds: result.photoIds });
        const me = ctx.members.find(m => m.memberId === ctx.me.memberId)?.userId ?? '';
        return photosSpeech(result, me);
      },
    }),
  ],
};
