// Drafts the bilingual advisory a site manager reviews before publishing. The numbers (window, level, alternatives) come
// from the forecast; Gemini only writes the two messages, and a hand-written template covers every failure.
import { GeminiError, type Gemini } from '../gemini.ts';
import { logger } from '../logger.ts';
import type { AlternativeSite, AlternativeTime } from './forecast.ts';
import { DEVANAGARI, enTime, enWindow, hiTime, hiWindow, hindiName } from './hindi.ts';

export type AdvisoryLevel = 'busy' | 'packed';

export type DraftFacts = {
  siteId: string;
  siteName: string;
  /** "Mon 2 Nov" */
  dateLabel: string;
  startMinutes: number;
  endMinutes: number;
  level: AdvisoryLevel;
  /** Squads planning to arrive in the window */
  squads: number;
  alternativeSite: AlternativeSite | null;
  alternativeTime: AlternativeTime | null;
};

export type Messages = { messageEn: string; messageHi: string };

const MIN_LENGTH = 20;
const MAX_EN = 320;
const MAX_HI = 420;

/** The hand-written fallback: the same facts, calm wording, in both languages */
export function templateMessages(f: DraftFacts): Messages {
  const site = f.alternativeSite;
  const time = f.alternativeTime;

  let en = `Heads up: ${f.siteName} is expected ${f.level} ${enWindow(f.startMinutes, f.endMinutes)}.`;
  if (site && time) en += ` ${site.name} is calm then, or come at ${enTime(time.minutes)} for a quieter visit.`;
  else if (site) en += ` ${site.name} is calm then${site.calmUntilMinutes !== null ? `, staying quiet till ${enTime(site.calmUntilMinutes)}` : ''}.`;
  else if (time) en += ` Coming at ${enTime(time.minutes)} is quieter.`;
  else en += ' Allow a little extra time at the gate.';

  const crowd = f.level === 'packed' ? 'बहुत भीड़' : 'काफ़ी भीड़';
  let hi = `ध्यान दें: ${hiWindow(f.startMinutes, f.endMinutes)} ${hindiName(f.siteId, f.siteName)} में ${crowd} रहने की संभावना है।`;
  if (site && time) hi += ` उस समय ${hindiName(site.id, site.name)} में कम भीड़ रहेगी, या ${hiTime(time.minutes)} आएँ।`;
  else if (site) hi += ` उस समय ${hindiName(site.id, site.name)} में कम भीड़ रहेगी।`;
  else if (time) hi += ` ${hiTime(time.minutes)} आना बेहतर रहेगा।`;
  else hi += ' गेट पर थोड़ा अतिरिक्त समय रखें।';

  return { messageEn: en, messageHi: hi };
}

const SYSTEM = [
  'You write short visitor advisories for the heritage sites of Udaipur, on behalf of the site manager.',
  'Tone: warm, calm and concrete, like a friendly local guide. It is a gentle heads-up, never an alarm: say "expected busy", not "dangerous".',
  'Always name the site and the time window, and give one easy way out using ONLY the alternatives provided. Never invent numbers, prices, rules or places.',
  'Write the same message twice: in English, and in Hindi (Devanagari script, simple spoken Hindi, not formal or Sanskritised). Each at most 200 characters.',
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: { messageEn: { type: 'STRING' }, messageHi: { type: 'STRING' } },
  required: ['messageEn', 'messageHi'],
};

export function promptFor(f: DraftFacts) {
  const site = f.alternativeSite;
  const time = f.alternativeTime;
  const options = [
    site && `- ${site.name} (Hindi: ${hindiName(site.id, site.name)}): calm during that window${site.calmUntilMinutes !== null ? `, stays quiet until ${enTime(site.calmUntilMinutes)}` : ''}`,
    time && `- ${f.siteName} itself is calmer at ${enTime(time.minutes)}`,
  ].filter(Boolean);
  return [
    `Site: ${f.siteName} (Hindi: ${hindiName(f.siteId, f.siteName)}), Udaipur`,
    `Day: ${f.dateLabel}`,
    `Expected: ${f.level} from ${enTime(f.startMinutes)} to ${enTime(f.endMinutes)}`,
    f.squads >= 3 && `About ${f.squads} travel squads (groups of friends and families) already plan to arrive then.`,
    options.length ? `Calmer options (use only these):\n${options.join('\n')}` : 'There is no calmer option to offer; suggest allowing extra time instead.',
    'Write the advisory the manager will publish to visitors’ phones. Do not mention the number of squads.',
  ].filter(Boolean).join('\n');
}

/** Validated messages, or null when either is missing, too short or long, or in the wrong script */
export function cleanMessages(value: { messageEn?: unknown; messageHi?: unknown } | null | undefined): Messages | null {
  const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const en = tidy(value?.messageEn);
  const hi = tidy(value?.messageHi);
  if (en.length < MIN_LENGTH || en.length > MAX_EN || DEVANAGARI.test(en)) return null;
  if (hi.length < MIN_LENGTH || hi.length > MAX_HI || !DEVANAGARI.test(hi)) return null;
  return { messageEn: en, messageHi: hi };
}

/** Gemini's two messages when it answers well within a short timeout, else the template */
export async function draftMessages(gemini: Gemini | undefined, facts: DraftFacts): Promise<Messages & { source: 'gemini' | 'template' }> {
  if (gemini?.enabled) {
    try {
      const raw = await gemini.json<{ messageEn?: unknown; messageHi?: unknown }>({
        prompt: promptFor(facts), schema: SCHEMA, system: SYSTEM, temperature: 0.5, timeoutMs: 12_000, label: 'Ops',
      });
      const clean = cleanMessages(raw);
      if (clean) return { source: 'gemini', ...clean };
      logger.warn('Ops', 'Gemini’s advisory draft did not pass validation; using the template');
    } catch (err) {
      logger.warn('Ops', `Gemini advisory draft failed (${err instanceof GeminiError ? err.message : String(err)}); using the template`);
    }
  }
  return { source: 'template', ...templateMessages(facts) };
}
