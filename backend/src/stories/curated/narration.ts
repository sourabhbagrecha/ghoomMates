import type { Lang, NarrationInfo, Panel } from '../types.ts';

// Narration recorded ahead of time for the bundled classic tellings, shipped as frontend/public/stories/<siteId>/<lang>.m4a
// so the demo plays with no network to Google. Prepared tales in the database carry their own narration.
export type StaticNarration = { durationSec: number; marks: number[] };

export const STATIC_NARRATION: Record<string, Partial<Record<Lang, StaticNarration>>> = {
  'bagore-ki-haveli': {
    en: { durationSec: 99.4, marks: [0, 27, 49.3, 75.2] },
    hi: { durationSec: 100.8, marks: [0, 23.3, 46.1, 75.7] },
  },
  'city-palace': {
    en: { durationSec: 98.8, marks: [0, 29.2, 52.5, 78.3] },
  },
  'fateh-sagar': {
    en: { durationSec: 98.2, marks: [0, 24.7, 47.8, 72.2] },
  },
  'jagdish-temple': {
    en: { durationSec: 98.2, marks: [0, 25.3, 46, 69] },
  },
  'pichola-boat': {
    en: { durationSec: 91.4, marks: [0, 24.5, 45.5, 71.4] },
  },
  'saheliyon-ki-bari': {
    en: { durationSec: 94.2, marks: [0, 27.6, 47.5, 74] },
  },
  'sajjangarh': {
    en: { durationSec: 100.9, marks: [0, 28.5, 52.2, 74.2] },
  },
};

/** The shipped recording for a bundled classic telling, when there is one with a start time for every panel */
export function staticNarration(siteId: string, lang: Lang, panels: Panel[]): NarrationInfo | null {
  const entry = STATIC_NARRATION[siteId]?.[lang];
  if (!entry || entry.marks.length !== panels.length) return null;
  return { url: `/stories/${siteId}/${lang}.m4a`, durationSec: entry.durationSec, marks: entry.marks, source: 'static' };
}
