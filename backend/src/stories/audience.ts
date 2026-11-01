import type { Audience } from './types.ts';

// Who is listening, and what the squad likes. Both steer the Gemini retelling and decide which cached story is reused.

export const VIBE_AXES = ['adventure', 'food', 'nightlife', 'culture', 'chill', 'shops'] as const;
export type VibeAxis = (typeof VIBE_AXES)[number];

/** Guidance for the storyteller, per audience */
export const AUDIENCE_NOTES: Record<Audience, string> = {
  classic: 'A general audience of curious travellers. Warm, clear and balanced.',
  family: 'A family with children aged about 6 to 12 and grandparents listening together. Use simple words and short sentences, give each panel one playful "spot it" challenge, favour vivid sights, sounds and animals, and keep every line gentle and safe for children.',
  friends: 'A group of friends in their twenties and thirties. Be witty and quick, with a light, teasing tone, surprising details to share in the group chat, and a nudge to take one good photo together. Keep it respectful.',
  couple: 'A couple on a trip together. Lean into atmosphere: golden light, quiet corners, tales of love, loyalty and devotion where the facts support them, and a moment to simply sit together. Keep it tasteful.',
  history: 'History buffs who want depth. Be more specific about who built what and in what order, use proper names and terms, and say plainly when sources differ or something is tradition rather than record. Still only use the supplied facts.',
};

/** What each vibe axis means for a story */
const VIBE_HOOKS: Record<VibeAxis, string> = {
  adventure: 'climbs, steps, boats and anything you can do with your body',
  food: 'what the royal kitchens, markets and festivals tasted like, and where the story meets a meal',
  nightlife: 'evening light, lamps, music, dance and the city after dark',
  culture: 'crafts, rituals, art, performance and living traditions',
  chill: 'calm corners, water, shade, breezes and slowing down',
  shops: 'artisans, markets, what is made by hand here and how to buy it fairly',
};

/** The squad’s taste: the average of every member’s quiz scores, as the two strongest axes (e.g. "culture+food") */
export function vibeBucket(vibes: (Record<string, unknown> | null | undefined)[]): string {
  const rated = vibes.filter((v): v is Record<string, number> => !!v && VIBE_AXES.every(axis => typeof v[axis] === 'number'));
  if (!rated.length) return '';
  const mean = (axis: VibeAxis) => rated.reduce((sum, v) => sum + v[axis], 0) / rated.length;
  const top = VIBE_AXES
    .map(axis => ({ axis, score: mean(axis) }))
    .filter(entry => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score || VIBE_AXES.indexOf(a.axis) - VIBE_AXES.indexOf(b.axis))
    .slice(0, 2)
    .map(entry => entry.axis)
    .sort();
  return top.length ? top.join('+') : 'balanced';
}

/** The sentence for the prompt about what the squad likes, or '' when it isn't known */
export function vibeNote(bucket: string): string {
  if (!bucket) return '';
  if (bucket === 'balanced') return 'The squad has a balanced taste with no strong lean, so keep the telling well-rounded.';
  const axes = bucket.split('+').filter((a): a is VibeAxis => (VIBE_AXES as readonly string[]).includes(a));
  if (!axes.length) return '';
  return `The squad leans towards ${axes.join(' and ')}. Where the facts allow it, weave in one or two touches about ${axes.map(a => VIBE_HOOKS[a]).join(', and about ')}. Never stretch a fact to fit.`;
}
