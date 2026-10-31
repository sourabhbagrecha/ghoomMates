// Pure helpers the GhoomMate tools use to turn spoken names and amounts into ledger ids and paise.
import { splitExpense } from '../expenses/domain.ts';

export type MemberRef = { memberId: string; name: string };

export type Resolution =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'ambiguous'; name: string; candidates: MemberRef[] }
  | { ok: false; reason: 'unknown'; name: string };

// English and Hinglish ways a speaker refers to themselves or the whole group.
const ME_WORDS = new Set(['me', 'i', 'myself', 'mine', 'my', 'self', 'main', 'mai', 'mujhe', 'maine', 'mera', 'meri', 'mere']);
const EVERYONE_WORDS = new Set(['everyone', 'all', 'sab', 'sabhi', 'sabko', 'sab log', 'everybody', 'all of us', 'the group', 'group', 'whole group', 'squad', 'the squad']);

const normalise = (value: string) => value.toLowerCase().replace(/['’]s\b/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export const isEveryone = (name: string) => EVERYONE_WORDS.has(normalise(name));

const one = (member: MemberRef): Resolution => ({ ok: true, ids: [member.memberId] });

function pick(name: string, matches: MemberRef[]): Resolution | null {
  if (matches.length === 1) return one(matches[0]);
  if (matches.length > 1) return { ok: false, reason: 'ambiguous', name, candidates: matches };
  return null;
}

// "me/I/main" → the speaker; then case-insensitive full name, first name, any name word, and finally a prefix.
export function resolveMember(name: string, members: MemberRef[], meId: string): Resolution {
  const query = normalise(name);
  if (!query) return { ok: false, reason: 'unknown', name };
  if (ME_WORDS.has(query)) {
    const me = members.find(m => m.memberId === meId);
    return me ? one(me) : { ok: false, reason: 'unknown', name };
  }
  const words = (m: MemberRef) => normalise(m.name).split(' ');
  return pick(name, members.filter(m => normalise(m.name) === query))
    ?? pick(name, members.filter(m => words(m)[0] === query))
    ?? pick(name, members.filter(m => words(m).includes(query)))
    ?? pick(name, members.filter(m => normalise(m.name).startsWith(query) || words(m).some(w => w.startsWith(query))))
    ?? { ok: false, reason: 'unknown', name };
}

// Resolves a participant list; any "everyone/all/sab" entry means the whole trip. Duplicates collapse.
export function resolveParticipants(names: string[], members: MemberRef[], meId: string): Resolution {
  if (names.some(isEveryone)) return { ok: true, ids: members.map(m => m.memberId) };
  const ids: string[] = [];
  for (const name of names) {
    const result = resolveMember(name, members, meId);
    if (!result.ok) return result;
    for (const id of result.ids) if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return { ok: false, reason: 'unknown', name: '' };
  return { ok: true, ids };
}

// Rupees (possibly fractional) to integer paise. Rejects zero, negatives and non-numbers.
export function rupeesToPaise(rupees: number): number {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees)) throw new RangeError('Amount must be a number');
  const paise = Math.round(rupees * 100);
  if (paise <= 0) throw new RangeError('Amount must be more than ₹0');
  return paise;
}

// Same largest-remainder allocation the backend uses, so the preview matches what gets saved.
export function equalShares(amountPaise: number, memberIds: string[]): { memberId: string; amountPaise: number }[] {
  return splitExpense(amountPaise, { type: 'equal', participants: memberIds.map(memberId => ({ memberId })) }).shares;
}

// "₹250", "₹83.33", "₹1,200" — how amounts are shown and read back.
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
