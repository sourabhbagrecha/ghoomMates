import { GeminiError, type Gemini, type InlineData } from '../gemini.ts';
import { logger } from '../logger.ts';

// A quick look at the photo before painting: how many people are in it and what each one plainly looks like.
// Handing the painter that checklist is what keeps the count right and the faces recognisable. It is optional:
// when the look fails, the painting prompt falls back to a generic "same people, same number" rule.

export type CastMember = { place: string; look: string };
export type Cast = { people: number; members: CastMember[] };

const MAX_PEOPLE = 20;
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    people: { type: 'INTEGER' },
    cast: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { place: { type: 'STRING' }, look: { type: 'STRING' } }, required: ['place', 'look'] },
    },
  },
  required: ['people', 'cast'],
};

const PROMPT = 'Count the people in this photograph and describe each one so a painter can paint the same group. '
  + 'Include everyone whose face is visible, even partly, and nobody who is only a tiny distant figure. List them from left to right. '
  + 'For each: "place" is where they stand (for example "far left, front"); "look" is under 20 words about what is plainly visible only: '
  + 'age group (child, teen, adult, older adult), hair colour, length and style or bald, beard or moustache, glasses, and any head covering. '
  + 'Do not describe clothing or objects. Do not guess names, ethnicity, religion or anything you cannot see.';

// The description goes into another model's prompt, so keep it to one short plain line.
function plain(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Validates the vision answer; null when it is unusable. */
export function parseCast(raw: unknown): Cast | null {
  const list = (raw as { cast?: unknown } | null)?.cast;
  if (!Array.isArray(list)) return null;
  const members = list
    .map((m) => ({ place: plain((m as CastMember)?.place, 60), look: plain((m as CastMember)?.look, 200) }))
    .filter((m) => m.look)
    .slice(0, MAX_PEOPLE);
  return members.length ? { people: members.length, members } : null;
}

/** Looks at the photo; null when Gemini is off, slow or confused (the painting then goes ahead without a cast list). */
export async function describeCast(gemini: Gemini, image: InlineData, timeoutMs = 20_000): Promise<Cast | null> {
  if (!gemini.enabled) return null;
  try {
    const raw = await gemini.json<unknown>({
      prompt: [{ text: PROMPT }, { inlineData: image }],
      schema: SCHEMA,
      temperature: 0.2,
      timeoutMs,
      label: 'Artworks',
    });
    return parseCast(raw);
  } catch (err) {
    logger.warn('Artworks', `Could not list the people in the photo (${err instanceof GeminiError ? err.message : String(err)}); painting without a cast list`);
    return null;
  }
}

const COUNT_SCHEMA = { type: 'OBJECT', properties: { people: { type: 'INTEGER' } }, required: ['people'] };

const COUNT_PROMPT = 'How many people are painted in this picture? Count every adult and child whose face you can see, including those partly behind others. '
  + 'Ignore tiny background figures and anything in the border. Answer with the number only.';

/** How many people the finished painting shows; null when Gemini is off, slow or confused. */
export async function countPeople(gemini: Gemini, image: InlineData, timeoutMs = 20_000): Promise<number | null> {
  if (!gemini.enabled) return null;
  try {
    const raw = await gemini.json<{ people?: unknown }>({
      prompt: [{ text: COUNT_PROMPT }, { inlineData: image }],
      schema: COUNT_SCHEMA,
      temperature: 0,
      timeoutMs,
      label: 'Artworks',
    });
    return Number.isInteger(raw?.people) && (raw.people as number) >= 0 && (raw.people as number) <= MAX_PEOPLE ? (raw.people as number) : null;
  } catch (err) {
    logger.warn('Artworks', `Could not count the people in the painting (${err instanceof GeminiError ? err.message : String(err)})`);
    return null;
  }
}
