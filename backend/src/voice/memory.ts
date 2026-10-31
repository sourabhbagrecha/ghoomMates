// What GhoomMate remembers about a person across chats, kept on their own profile (users.preferences.ghoomate).
// Each note is a short thing they said about themselves; some carry a rule the picks follow (no early starts, a
// price cap, vibes to lean into or avoid). Forgetting a note drops its rule with it.
import { VIBE_AXES, type VibeAxis } from './experiences.ts';

export type MemoryNote = {
  /** In their words, short: "vegetarian", "not a morning person" */
  text: string;
  /** Leave out experiences starting before EARLY_START */
  noEarlyStarts?: boolean;
  /** Most they want to spend per experience */
  maxPriceRupees?: number;
  likes?: VibeAxis[];
  avoid?: VibeAxis[];
  /** ISO time it was said */
  at: string;
};

export type GhoomateMemory = { notes: MemoryNote[] };

export type MemoryRules = { noEarlyStarts: boolean; maxPriceRupees: number | null; likes: VibeAxis[]; avoid: VibeAxis[] };

export const MAX_NOTES = 12;
const MAX_NOTE_LENGTH = 120;
/** 8:00 AM: "no early starts" leaves out anything before this */
export const EARLY_START_MINUTES = 8 * 60;

export const emptyMemory = (): GhoomateMemory => ({ notes: [] });

const axes = (value: unknown): VibeAxis[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((a): a is VibeAxis => VIBE_AXES.includes(a as VibeAxis));
  return list.length ? [...new Set(list)] : undefined;
};

const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE_LENGTH);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The memory saved on a profile's preferences; anything malformed is dropped rather than trusted */
export function memoryFrom(preferences: unknown): GhoomateMemory {
  const raw = (preferences as { ghoomate?: { notes?: unknown } } | null | undefined)?.ghoomate?.notes;
  if (!Array.isArray(raw)) return emptyMemory();
  const notes = raw.flatMap((n): MemoryNote[] => {
    if (!n || typeof n !== 'object' || typeof (n as MemoryNote).text !== 'string') return [];
    const note = n as Record<string, unknown>;
    const text = normalise(note.text as string);
    if (!text) return [];
    const price = Number(note.maxPriceRupees);
    return [{
      text,
      ...(note.noEarlyStarts === true ? { noEarlyStarts: true } : {}),
      ...(Number.isFinite(price) && price > 0 ? { maxPriceRupees: Math.round(price) } : {}),
      ...(axes(note.likes) ? { likes: axes(note.likes) } : {}),
      ...(axes(note.avoid) ? { avoid: axes(note.avoid) } : {}),
      at: typeof note.at === 'string' ? note.at : new Date(0).toISOString(),
    }];
  });
  return { notes: notes.slice(-MAX_NOTES) };
}

export type NoteInput = Omit<MemoryNote, 'at'>;

/** Adds a note (replacing one with the same text), keeping the newest MAX_NOTES */
export function remember(memory: GhoomateMemory, input: NoteInput, now = new Date()): GhoomateMemory {
  const text = normalise(input.text);
  if (!text) return memory;
  const note: MemoryNote = {
    text,
    ...(input.noEarlyStarts ? { noEarlyStarts: true } : {}),
    ...(input.maxPriceRupees && input.maxPriceRupees > 0 ? { maxPriceRupees: Math.round(input.maxPriceRupees) } : {}),
    ...(axes(input.likes) ? { likes: axes(input.likes) } : {}),
    ...(axes(input.avoid) ? { avoid: axes(input.avoid) } : {}),
    at: now.toISOString(),
  };
  return { notes: [...memory.notes.filter(n => !same(n.text, text)), note].slice(-MAX_NOTES) };
}

/** Drops notes matching `about` (either text contains the other, ignoring case) */
export function forget(memory: GhoomateMemory, about: string): { memory: GhoomateMemory; removed: MemoryNote[] } {
  const query = normalise(about).toLowerCase();
  if (!query) return { memory, removed: [] };
  const matches = (n: MemoryNote) => n.text.toLowerCase().includes(query) || query.includes(n.text.toLowerCase());
  return { memory: { notes: memory.notes.filter(n => !matches(n)) }, removed: memory.notes.filter(matches) };
}

/** The rules all notes add up to. Later notes win on price; an avoid beats a like for the same vibe. */
export function rulesOf(memory: GhoomateMemory): MemoryRules {
  const rules: MemoryRules = { noEarlyStarts: false, maxPriceRupees: null, likes: [], avoid: [] };
  for (const note of memory.notes) {
    if (note.noEarlyStarts) rules.noEarlyStarts = true;
    if (note.maxPriceRupees) rules.maxPriceRupees = note.maxPriceRupees;
    rules.likes.push(...(note.likes ?? []));
    rules.avoid.push(...(note.avoid ?? []));
  }
  rules.avoid = [...new Set(rules.avoid)];
  rules.likes = [...new Set(rules.likes)].filter(a => !rules.avoid.includes(a));
  return rules;
}

/** One line per note for the model, with the rule it carries */
export function memoryLines(memory: GhoomateMemory): string[] {
  return memory.notes.map(n => {
    const rules = [
      n.noEarlyStarts && 'no starts before 8 AM',
      n.maxPriceRupees && `up to ₹${n.maxPriceRupees.toLocaleString('en-IN')} per experience`,
      n.likes?.length && `leans ${n.likes.join(', ')}`,
      n.avoid?.length && `avoids ${n.avoid.join(', ')}`,
    ].filter(Boolean);
    return rules.length ? `${n.text} (${rules.join('; ')})` : n.text;
  });
}

/** How the rules shaped a set of picks, for the model to mention briefly */
export function rulesNote(rules: MemoryRules): string {
  const parts = [
    rules.noEarlyStarts && 'no starts before 8 AM',
    rules.maxPriceRupees && `nothing over ₹${rules.maxPriceRupees.toLocaleString('en-IN')}`,
    rules.likes.length && `leaning ${rules.likes.join(', ')}`,
    rules.avoid.length && `skipping ${rules.avoid.join(', ')}`,
  ].filter(Boolean);
  return parts.length ? `Following what they told you before: ${parts.join(', ')}.` : '';
}
