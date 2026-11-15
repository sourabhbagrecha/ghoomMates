import type { MediaStorage } from '../storage.ts';
import { isAudience, isLang, type Audience, type Lang, type NarrationInfo, type Panel, type StoryBody } from './types.ts';

// Prepared Kaavad Tales. The city batch (outside this app) writes one document per site, language and audience into
// `heritage_tales` and puts the panel art and narration audio in the media bucket; the app only reads them. Nothing is
// generated when a reader opens a story. docs/stories.md has the full contract.

/** A `heritage_tales` document, as the batch writes it */
export type TaleDoc = {
  /** HERITAGE_CITIES in heritage/sites.ts, e.g. "Udaipur" */
  city: string;
  /** A site id from heritage/sites.ts */
  site_id: string;
  lang: Lang;
  audience: Audience;
  title: string;
  panels: { heading: string; text: string; look_for?: string; art_key?: string | null }[];
  quiz: { question: string; options: string[]; answer_index: number; fact?: string }[];
  care_note?: string;
  /** One track for the whole tale, with the second each panel starts */
  narration?: { audio_key: string; duration_sec: number; marks: number[] } | null;
  updated_at?: Date;
};

/** A tale read back: the story with bucket keys still to be signed */
export type Tale = {
  siteId: string;
  lang: Lang;
  audience: Audience;
  body: StoryBody;
  /** Bucket key of each panel's art, or null when the batch left it out */
  artKeys: (string | null)[];
  narration: { audioKey: string; durationSec: number; marks: number[] } | null;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const key = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Checks a document from the batch; null (with the reason) when the app can't show it */
export function readTale(doc: unknown): { tale: Tale } | { problem: string } {
  const d = doc as Partial<TaleDoc> | null;
  if (!d || typeof d !== 'object') return { problem: 'not a document' };
  if (!text(d.site_id) || !isLang(d.lang) || !isAudience(d.audience)) return { problem: 'site_id, lang or audience missing or unknown' };
  if (!text(d.title)) return { problem: 'no title' };
  if (!Array.isArray(d.panels) || !d.panels.length || d.panels.length > 8) return { problem: 'needs 1 to 8 panels' };
  if (!d.panels.every(p => p && text(p.heading) && text(p.text))) return { problem: 'every panel needs a heading and text' };
  if (!Array.isArray(d.quiz) || !d.quiz.length || d.quiz.length > 5) return { problem: 'needs 1 to 5 quiz questions' };
  const quizOk = d.quiz.every(q => q && text(q.question) && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6
    && q.options.every(o => text(o)) && Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < q.options.length);
  if (!quizOk) return { problem: 'every question needs 2 to 6 options and an answer_index among them' };

  const n = d.narration;
  const narrationOk = !!n && !!key(n.audio_key) && Number(n.duration_sec) > 0 && Array.isArray(n.marks) && n.marks.length === d.panels.length
    && n.marks.every((m, i) => Number.isFinite(m) && m >= 0 && (i === 0 || m >= n.marks[i - 1]));

  const panels: Panel[] = d.panels.map(p => ({ heading: text(p.heading), text: text(p.text), lookFor: text(p.look_for) }));
  return {
    tale: {
      siteId: text(d.site_id),
      lang: d.lang,
      audience: d.audience,
      body: {
        title: text(d.title),
        panels,
        quiz: d.quiz.map(q => ({ question: text(q.question), options: q.options.map(text), answerIndex: q.answer_index, fact: text(q.fact) })),
        careNote: text(d.care_note),
      },
      artKeys: d.panels.map(p => key(p.art_key)),
      narration: narrationOk ? { audioKey: key(n!.audio_key)!, durationSec: Number(n!.duration_sec), marks: n!.marks.map(Number) } : null,
    },
  };
}

/** Signed links for a tale's art and audio. Panels without art borrow `fallbackArt` (the bundled paintings) when there is some. */
export async function signTale(storage: MediaStorage, tale: Tale, fallbackArt: string[] = []): Promise<{ panels: Panel[]; narration: NarrationInfo | null }> {
  const panels = await Promise.all(tale.body.panels.map(async (panel, i) => {
    const artKey = tale.artKeys[i];
    const art = artKey ? await storage.readUrl(artKey) : fallbackArt.length ? fallbackArt[Math.min(i, fallbackArt.length - 1)] : undefined;
    return art ? { ...panel, art } : panel;
  }));
  const narration = tale.narration
    ? { url: await storage.readUrl(tale.narration.audioKey), durationSec: tale.narration.durationSec, marks: tale.narration.marks, source: 'prepared' as const }
    : null;
  return { panels, narration };
}
