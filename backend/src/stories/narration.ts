import { GeminiError, type Gemini } from '../gemini.ts';
import { logger } from '../logger.ts';
import { STATIC_NARRATION } from './curated/narration.ts';
import { narrationHash, panelPrompts } from './speech.ts';
import type { Lang, NarrationInfo, Panel } from './types.ts';
import { joinRecordings, type JoinedNarration } from './wav.ts';

/** The Kavadiya Bhat’s voice: warm and a little gravelly, tested in English and Hindi */
export const NARRATOR_VOICE = 'Algenib';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type SynthOptions = {
  panels: Panel[];
  siteName: string;
  lang: Lang;
  voice?: string;
  /** Recordings made at once; the Gemini API key’s free tier allows only 3 a minute, Vertex AI far more */
  concurrency?: number;
  attempts?: number;
  /** Wait before a retry (multiplied by the attempt number) */
  retryMs?: number;
};

/** Records every panel (retrying quota and server errors) and joins them into one track with each panel’s start time */
export async function synthesizeStory(gemini: Gemini, { panels, siteName, lang, voice = NARRATOR_VOICE, concurrency = 3, attempts = 3, retryMs = 12_000 }: SynthOptions): Promise<JoinedNarration> {
  const prompts = panelPrompts(panels, siteName, lang);
  const recordings: Buffer[] = new Array(prompts.length);
  let next = 0;

  async function record(text: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await gemini.speech({ text, voice, label: 'Stories', timeoutMs: 70_000 });
      } catch (err) {
        const retryable = err instanceof GeminiError && (err.status === 429 || (err.status ?? 0) >= 500 || err.message.includes('timed out'));
        if (!retryable || attempt >= attempts) throw err;
        logger.warn('Stories', `Narration attempt ${attempt} failed (${(err as Error).message.slice(0, 80)}); retrying`);
        await wait(retryMs * attempt);
      }
    }
  }

  async function worker() {
    while (next < prompts.length) {
      const at = next++;
      recordings[at] = await record(prompts[at]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, prompts.length) }, worker));
  return joinRecordings(recordings);
}

/** The ready-made recording for a classic telling, if one was shipped and still matches the words */
export function staticNarration(siteId: string, lang: Lang, panels: Panel[]): NarrationInfo | null {
  const entry = STATIC_NARRATION[siteId]?.[lang];
  if (!entry || entry.hash !== narrationHash(panels, lang, NARRATOR_VOICE) || entry.marks.length !== panels.length) return null;
  return { url: `/stories/${siteId}/${lang}.m4a`, durationSec: entry.durationSec, marks: entry.marks, source: 'static' };
}
