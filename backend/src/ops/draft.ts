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
  startMinutes: number;
  endMinutes: number;
  level: AdvisoryLevel;
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

// Gemini polishes a baseline that already carries every fact. That keeps names, times and options exact while the
// wording gets warmer, and the small model answers in about a second.
const SYSTEM = [
  'You polish visitor advisories for the heritage sites of Udaipur, written for a site manager to publish.',
  'Keep every fact exactly: site names, times, the crowd word (busy or packed) and every calmer option. It is a forecast, so say "expected" or "likely", never state the crowd as a fact. Make the wording warm, natural and calm, like a friendly local guide: a gentle heads-up, never an alarm. No greetings.',
  'English starts with "Heads up:". Hindi is Devanagari only (no English words), simple spoken Hindi rather than formal Hindi, and starts with "ध्यान दें:".',
  'Never add a date, today or tomorrow, or how many people are coming. Never invent numbers, prices, rules or places. Each message is at most 190 characters.',
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: { messageEn: { type: 'STRING' }, messageHi: { type: 'STRING' } },
  required: ['messageEn', 'messageHi'],
};

export function promptFor(f: DraftFacts) {
  const baseline = templateMessages(f);
  const site = f.alternativeSite;
  const time = f.alternativeTime;
  const options = [
    site && `- ${site.name} (Hindi: ${hindiName(site.id, site.name)}) stays calm through that window${site.calmUntilMinutes !== null ? `, quiet until ${enTime(site.calmUntilMinutes)} (Hindi: ${hiTime(site.calmUntilMinutes)})` : ''}`,
    time && `- ${f.siteName} is calmer at ${enTime(time.minutes)} (Hindi: ${hiTime(time.minutes)})`,
  ].filter(Boolean);
  return [
    `Site: ${f.siteName} (Hindi: ${hindiName(f.siteId, f.siteName)}), Udaipur`,
    `Expected crowd: ${f.level} (Hindi: ${f.level === 'packed' ? 'बहुत भीड़' : 'काफ़ी भीड़'})`,
    `Window: ${enWindow(f.startMinutes, f.endMinutes)} (Hindi: ${hiWindow(f.startMinutes, f.endMinutes)})`,
    options.length ? `Calmer options:\n${options.join('\n')}` : 'There is no calmer option; visitors are asked to allow a little extra time.',
    `English draft: ${baseline.messageEn}`,
    `Hindi draft: ${baseline.messageHi}`,
    'Return better-worded versions of both, keeping all the facts.',
  ].join('\n');
}

const RELATIVE_DAY = /\b(today|tonight|tomorrow|yesterday)\b/i;
const HINDI_RELATIVE_DAY = /(^|\s)(आज|कल|परसों)(\s|[,।]|$)/;

/** Validated messages, or null when either is missing, too short or long, in the wrong script, or tied to a day */
export function cleanMessages(value: { messageEn?: unknown; messageHi?: unknown } | null | undefined): Messages | null {
  const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const en = tidy(value?.messageEn);
  const hi = tidy(value?.messageHi);
  if (en.length < MIN_LENGTH || en.length > MAX_EN || DEVANAGARI.test(en) || RELATIVE_DAY.test(en)) return null;
  // The Hindi may carry a stray Latin letter or two, but not English sentences
  if (hi.length < MIN_LENGTH || hi.length > MAX_HI || !DEVANAGARI.test(hi) || HINDI_RELATIVE_DAY.test(hi)) return null;
  if ((hi.match(/[A-Za-z]/g) ?? []).length > 4) return null;
  return { messageEn: en, messageHi: hi };
}

/** Gemini's two messages when it answers well within a short timeout, else the template */
export async function draftMessages(gemini: Gemini | undefined, facts: DraftFacts): Promise<Messages & { source: 'gemini' | 'template' }> {
  if (gemini?.enabled) {
    try {
      const raw = await gemini.json<{ messageEn?: unknown; messageHi?: unknown }>({
        prompt: promptFor(facts), schema: SCHEMA, system: SYSTEM, temperature: 0.4, timeoutMs: 12_000, label: 'Ops',
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
