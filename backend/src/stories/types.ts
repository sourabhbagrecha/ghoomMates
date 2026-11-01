// Shared shapes for Kaavad Tales: stories told panel by panel at Udaipur's heritage sites, narrated aloud, ending in a
// three-question quiz that earns a stamp in the Heritage Passport.

export const LANGS = ['en', 'hi'] as const;
export type Lang = (typeof LANGS)[number];

/** `classic` is the hand-written telling; the others are retold for the squad by Gemini */
export const AUDIENCES = ['classic', 'family', 'friends', 'couple', 'history'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);
export const isAudience = (value: unknown): value is Audience => AUDIENCES.includes(value as Audience);

export type Panel = {
  heading: string;
  /** At most 70 words, written to be heard */
  text: string;
  /** One thing to spot while standing right there */
  lookFor: string;
  /** Painted art for this panel (a path under the frontend's public folder), when the site has some */
  art?: string;
};

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  /** One line that confirms the answer */
  fact: string;
};

export type StoryBody = {
  title: string;
  panels: Panel[];
  quiz: QuizQuestion[];
  /** How to visit lightly */
  careNote: string;
};

/** Narration recorded ahead of time and shipped with the app, so the demo plays with no AI and no network to Google */
export type NarrationInfo = {
  url: string;
  durationSec: number;
  /** Second at which each panel starts, so the Kaavad can unfold in step with the voice */
  marks: number[];
  source: 'static' | 'gemini';
};

export type Story = StoryBody & {
  siteId: string;
  siteName: string;
  lang: Lang;
  audience: Audience;
  /** Written by Gemini for this audience (and squad), rather than the hand-written telling */
  generated: boolean;
  /** The squad vibe mix the story was tuned for, e.g. "culture+food"; null when it wasn't */
  vibe: string | null;
  /** Ready-made narration that matches this exact text, when there is one */
  narration: NarrationInfo | null;
};

/** What a curated site ships with: the same story in each language, plus its painted panels */
export type CuratedSite = {
  siteId: string;
  /** One per panel, in order: /stories/<siteId>/<n>.jpg */
  art: string[];
  en: StoryBody;
  hi: StoryBody;
};

export const QUIZ_SIZE = 3;
export const MAX_PANEL_WORDS = 70;
