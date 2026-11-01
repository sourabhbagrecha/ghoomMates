import type { Gemini } from '../gemini.ts';
import type { HeritageSite } from '../heritage/sites.ts';
import { AUDIENCE_NOTES, vibeNote } from './audience.ts';
import { shuffleQuiz } from './quiz.ts';
import { MAX_PANEL_WORDS, QUIZ_SIZE, type Audience, type Lang, type Panel, type QuizQuestion, type StoryBody } from './types.ts';

// Retelling a site's story for a particular audience (and squad) with Gemini. The prompt only offers facts we hold, and the
// answer is checked before it is used: shape, length, language and that no year appears that the facts don't contain.

export const SYSTEM_PROMPT = [
  'You are the Kavadiya Bhat, a traditional storyteller of Mewar, writing for the Ghoomates travel app. A Kaavad is a painted wooden shrine whose panels unfold one by one while the storyteller speaks. You write those panels for visitors standing at a heritage site in Udaipur.',
  '',
  'Hard rules:',
  '1. Be historically grounded. Use ONLY the facts supplied under SITE FACTS. Never invent dates, names, numbers, quotes, measurements or events, and never add a year that is not in SITE FACTS. If a detail is not there, leave it out.',
  '2. Anything that comes from legend or oral tradition must be introduced as such: "Legend says…" or "It is said…" in English, "कहा जाता है कि…" or "किंवदंती है कि…" in Hindi.',
  '3. Write for the ear: short sentences, concrete images, no lists, no emoji, no markdown, no stage directions.',
  `4. Write exactly 4 panels. Each has a heading of 2 to 5 words, a text of 40 to ${MAX_PANEL_WORDS - 8} words, and a lookFor of 8 to 22 words that names one thing the listeners can spot right where they stand. The first panel opens with a warm greeting ("Khamma ghani!") and sets the scene; the last closes gently.`,
  `5. Then a quiz of exactly ${QUIZ_SIZE} multiple-choice questions, each with exactly 3 options and an answerIndex of 0, 1 or 2. Every answer must be stated in your panels. "fact" is one short line that confirms the answer.`,
  '6. careNote is one short line on visiting lightly (respect, waste, crowds, transport), built from the CARE TIP.',
  '7. Be respectful to every faith and community. Nothing frightening for children. If the facts are thin, say less and describe what to see, hear and do; never pad with invented history.',
].join('\n');

const STRING = { type: 'STRING' };
export const STORY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STRING,
    panels: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { heading: STRING, text: STRING, lookFor: STRING }, required: ['heading', 'text', 'lookFor'] },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { question: STRING, options: { type: 'ARRAY', items: STRING }, answerIndex: { type: 'INTEGER' }, fact: STRING },
        required: ['question', 'options', 'answerIndex', 'fact'],
      },
    },
    careNote: STRING,
  },
  required: ['title', 'panels', 'quiz', 'careNote'],
};

/** What we know about a site: the heritage module's notes, plus the hand-written English telling when there is one */
export function siteFacts(site: HeritageSite, classic?: StoryBody): string[] {
  const facts = [`${site.name} is a ${site.kind.toLowerCase()} in ${site.city}.`, site.story];
  if (site.gem) facts.push('It is a lesser-known gem that few visitors reach, so it is usually quiet.');
  if (classic) facts.push(...classic.panels.map(p => p.text));
  return facts;
}

export type GenerateRequest = {
  site: HeritageSite;
  lang: Lang;
  audience: Audience;
  /** Squad vibe bucket from `vibeBucket`, or '' */
  bucket: string;
  /** The hand-written English telling to stay close to, when the site has one */
  classic?: StoryBody;
  timeoutMs?: number;
};

export function buildPrompt({ site, lang, audience, bucket, classic }: GenerateRequest): string {
  return [
    `SITE: ${site.name} (${site.kind}), ${site.city}`,
    'SITE FACTS (the only history you may use):',
    ...siteFacts(site, classic).map(fact => `- ${fact}`),
    `CARE TIP: ${site.care}`,
    `LANGUAGE: ${lang === 'hi' ? 'Hindi in Devanagari script, natural spoken Hindi a family would use, not formal or Sanskritised. Keep the greeting "खम्मा घणी!". Write years as digits.' : 'English, warm and plain, easy to follow for Indian travellers.'}`,
    `AUDIENCE: ${AUDIENCE_NOTES[audience]}`,
    vibeNote(bucket),
    classic ? 'The facts above include the classic telling. Retell it for this audience in fresh words; do not copy it sentence by sentence.' : '',
    'Write the title, the 4 panels, the quiz and the care note.',
  ].filter(Boolean).join('\n');
}

type Raw = {
  title?: unknown;
  panels?: { heading?: unknown; text?: unknown; lookFor?: unknown }[];
  quiz?: { question?: unknown; options?: unknown; answerIndex?: unknown; fact?: unknown }[];
  careNote?: unknown;
};

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** Cuts a text back to whole sentences within `max` words; null if even the first sentence is too long */
export function limitWords(text: string, max: number): string | null {
  if (wordCount(text) <= max) return text;
  const sentences = text.match(/[^.!?।]+[.!?।]+["”’]?\s*/g) ?? [];
  let kept = '';
  for (const sentence of sentences) {
    if (wordCount(kept + sentence) > max) break;
    kept += sentence;
  }
  return kept.trim() ? kept.trim() : null;
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
// "1651", and "1550s" counts as 1550
const YEAR = /\b(1[0-9]{3}|20[0-9]{2})(?:s\b|\b)/g;
const ascii = (text: string) => text.replace(/[०-९]/g, d => String(DEVANAGARI_DIGITS.indexOf(d)));
const yearsIn = (text: string) => new Set([...ascii(text).matchAll(YEAR)].map(match => match[1]));

/** Share of letters that are Devanagari, to catch a Hindi request answered in English */
function devanagariShare(text: string) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter(ch => /[ऀ-ॿ]/.test(ch)).length / letters.length;
}

export class StoryRejected extends Error {}

/** Checks Gemini's answer and shapes it into a story body; throws StoryRejected when it can't be trusted */
export function cleanStory(raw: unknown, { site, lang, classic, fallbackCare, seed }: { site: HeritageSite; lang: Lang; classic?: StoryBody; fallbackCare: string; seed: string }): StoryBody {
  const data = (raw ?? {}) as Raw;
  const reject = (why: string): never => {
    throw new StoryRejected(why);
  };

  const panels: Panel[] = [];
  for (const p of (Array.isArray(data.panels) ? data.panels : []).slice(0, 5)) {
    const heading = clean(p?.heading);
    const text = limitWords(clean(p?.text), MAX_PANEL_WORDS);
    const lookFor = clean(p?.lookFor);
    if (heading && text && wordCount(text) >= 12 && lookFor && wordCount(heading) <= 9 && wordCount(lookFor) <= 34) panels.push({ heading, text, lookFor });
  }
  if (panels.length < 3) reject('fewer than 3 usable panels');

  const quiz: QuizQuestion[] = [];
  for (const q of Array.isArray(data.quiz) ? data.quiz : []) {
    const options = Array.isArray(q?.options) ? q.options.map(clean).filter(Boolean) : [];
    const answerIndex = Number(q?.answerIndex);
    const question = clean(q?.question);
    const fact = clean(q?.fact);
    if (question && fact && options.length === 3 && new Set(options).size === 3 && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < 3) {
      quiz.push({ question, options, answerIndex, fact });
    }
  }
  if (quiz.length < QUIZ_SIZE) reject(`only ${quiz.length} usable quiz questions`);

  const body = panels.map(p => `${p.text} ${p.lookFor}`).join(' ') + quiz.map(q => ` ${q.question} ${q.options.join(' ')} ${q.fact}`).join('');
  if (lang === 'hi' && devanagariShare(panels.map(p => p.text).join(' ')) < 0.5) reject('Hindi requested but the text is not Devanagari');

  // No year may appear that our own facts don't contain
  const known = yearsIn(siteFacts(site, classic).join(' ') + ' ' + site.care);
  const invented = [...yearsIn(body)].filter(year => !known.has(year));
  if (invented.length) reject(`years not in the facts: ${invented.join(', ')}`);

  const care = clean(data.careNote);
  return {
    title: clean(data.title) || site.name,
    panels,
    quiz: shuffleQuiz(quiz.slice(0, QUIZ_SIZE), seed),
    careNote: care && wordCount(care) <= 40 ? care : fallbackCare,
  };
}

/** Asks Gemini for the retelling; throws GeminiError (offline, slow, quota) or StoryRejected (answer not trustworthy) */
export async function generateStory(gemini: Gemini, request: GenerateRequest, seed: string, fallbackCare: string): Promise<StoryBody> {
  const raw = await gemini.json<unknown>({
    model: gemini.models.smart,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(request),
    schema: STORY_SCHEMA,
    temperature: 0.6,
    timeoutMs: request.timeoutMs ?? 40_000,
    label: 'Stories',
  });
  return cleanStory(raw, { site: request.site, lang: request.lang, classic: request.classic, fallbackCare, seed });
}
