// What a reel is: an ordered list of scenes (photos, collages, an animated map, trip stats, kinetic text) with captions,
// stickers, effects, camera moves and transitions, in one of a few looks. Gemini writes it (see reelPrompt), Claude when
// Gemini fails, and templatePlan() is the hand-written cut when both do. The app plays the plan with Remotion
// (frontend/src/pages/Reel/ReelComposition.tsx), so these names are shared with it.

export const REEL_STYLES = ['cinematic', 'energetic', 'dreamy', 'retro', 'playful'] as const;
export const REEL_KINDS = ['photo', 'collage', 'map', 'stats', 'text'] as const;
export const REEL_MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up'] as const;
// Only transitions the in-browser MP4 renderer can draw (CSS and SVG, no WebGL)
export const REEL_TRANSITIONS = ['fade', 'slide', 'wipe', 'flip', 'clock-wipe', 'iris', 'push', 'cut'] as const;
export const REEL_EFFECTS = ['none', 'light-leak', 'confetti', 'sparkle', 'grain'] as const;
export const REEL_LAYOUTS = ['grid', 'stack', 'split'] as const;

export type ReelStyle = (typeof REEL_STYLES)[number];
export type ReelKind = (typeof REEL_KINDS)[number];
export type ReelMotion = (typeof REEL_MOTIONS)[number];
export type ReelTransition = (typeof REEL_TRANSITIONS)[number];
export type ReelEffect = (typeof REEL_EFFECTS)[number];
export type ReelLayout = (typeof REEL_LAYOUTS)[number];

export type ReelPlace = { name: string; lat: number; lng: number };
// A true number about the trip, for the stats scene
export type ReelFact = { value: number; label: string };

export type ReelScene = {
  kind: ReelKind;
  // One photo for a photo scene, 2 to 4 for a collage, none for the others
  photoIds: string[];
  // On-screen line: a photo's caption, a map or stats heading, or a text card's words
  caption: string;
  seconds: number;
  // Camera move over the photo (photo scenes; the others use it for their own drift)
  motion: ReelMotion;
  // How this scene comes in from the one before it
  transition: ReelTransition;
  // Emoji objects that pop onto the scene, at most 3
  stickers: string[];
  effect: ReelEffect;
  // Collage arrangement
  layout?: ReelLayout;
  // Map pins, in route order
  places?: ReelPlace[];
};

export type ReelPlan = {
  title: string;
  // The end card's line
  tagline: string;
  style: ReelStyle;
  scenes: ReelScene[];
  // What the stats scene counts up
  facts?: ReelFact[];
};

/** A photo Gemini may use, numbered from 1 in the prompt. */
export type ReelCandidate = { id: string; uploader: string; caption: string | null; takenOn: string };

export const MIN_SCENES = 3;
export const MAX_SCENES = 20;
export const MIN_SCENE_SECONDS = 1;
export const MAX_SCENE_SECONDS = 5;
// Scene time only; the title and end cards add about 4.5 seconds
export const MAX_REEL_SECONDS = 55;
const MAX_STICKERS = 3;
const MAX_PLACES = 5;
const MAX_TEXT_SCENES = 2;
// Map pins further than this (in degrees) from the first one are dropped as guesses gone wrong
const MAX_PLACE_SPREAD = 2;

export const MAX_PROMPT_LENGTH = 300;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const line = (value: unknown, max: number) =>
  (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '').slice(0, max).trim();
const EMOJI = /^\p{Extended_Pictographic}/u;

// The plan as JSON Schema (Claude's structured outputs). Photos are referred to by their number in the prompt, not by id.
// Every property is required so both models fill every field; unused ones are empty.
export const CLAUDE_REEL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Reel title, at most 6 words' },
    tagline: { type: 'string', description: 'One closing line for the end card, at most 8 words' },
    style: { type: 'string', enum: [...REEL_STYLES] },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...REEL_KINDS] },
          photos: { type: 'array', items: { type: 'integer' }, description: 'Photo numbers: 1 for photo, 2 to 4 for collage, empty otherwise' },
          caption: { type: 'string', description: 'On-screen text, at most 6 words; required for text scenes' },
          seconds: { type: 'number' },
          motion: { type: 'string', enum: [...REEL_MOTIONS] },
          transition: { type: 'string', enum: [...REEL_TRANSITIONS] },
          stickers: { type: 'array', items: { type: 'string' }, description: 'Up to 3 single emoji that pop onto the scene' },
          effect: { type: 'string', enum: [...REEL_EFFECTS] },
          layout: { type: 'string', enum: [...REEL_LAYOUTS], description: 'Collage arrangement; any value for other kinds' },
          places: {
            type: 'array',
            description: 'Map scenes only: 1 to 5 real places in route order with their coordinates; empty otherwise',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' } },
              required: ['name', 'lat', 'lng'],
              additionalProperties: false,
            },
          },
        },
        required: ['kind', 'photos', 'caption', 'seconds', 'motion', 'transition', 'stickers', 'effect', 'layout', 'places'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'tagline', 'style', 'scenes'],
  additionalProperties: false,
};

/** JSON Schema in Gemini's responseSchema dialect: upper-case types and no additionalProperties. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => key !== 'additionalProperties')
    .map(([key, value]) => [key, key === 'type' && typeof value === 'string' ? value.toUpperCase() : toGeminiSchema(value)]));
}

export const REEL_SCHEMA = toGeminiSchema(CLAUDE_REEL_SCHEMA) as object;

export const REEL_SYSTEM = `You are GhoomMate, the video editor of a group-travel app. A squad of friends shares their trip photos and asks for a short vertical reel (Instagram/WhatsApp style).
You see the photos, numbered. Write the edit as JSON: an ordered list of scenes that fits what the user asked for.

Scene kinds:
- photo: one photo, full screen. Put its number in photos.
- collage: 2 to 4 photos on screen together (layout grid, stack of prints, or split screen). Good for group moments and quick recaps.
- map: an animated map that flies in to the destination, drops pins and draws the route between them. Give 1 to 5 real places of this trip in route order (the destination itself, or landmarks the photos show) with accurate latitude and longitude. Use at most one map, usually near the start.
- stats: the trip's numbers counting up (given below). At most one, usually near the end. Leave photos empty.
- text: a big kinetic-typography card with the caption as its words (a day marker, a punchline, a mood). At most two.

Rules:
- Use only photo numbers you were shown. In photo scenes never use a photo twice; collages may reuse photos. Leave out blurry, dark, duplicate or off-brief photos.
- Between ${MIN_SCENES} and ${MAX_SCENES} scenes, mostly photos. Honour a requested length (e.g. "30s"); otherwise aim for 15 to 25 seconds.
- Each scene lasts ${MIN_SCENE_SECONDS} to ${MAX_SCENE_SECONDS} seconds: quick (1 to 1.5) for energetic edits, longer (3 to 4) for dreamy or cinematic ones; maps and stats need 3 to 4.
- Order the scenes to tell the trip's story: an opener that sets the place, a build, and a strong close.
- Captions are optional for photos, at most 6 words, in the language and tone the user wrote in; describe what is in the photo and never invent names for people.
- stickers: 0 to 3 single emoji that fit the moment (🌅 🍛 🛶 😂 ✨). Use them where they add fun, not on every scene, and rarely in cinematic edits.
- effect: light-leak (warm film glow), confetti (celebration), sparkle (magic moments), grain (film texture), or none. Use them sparingly.
- style: cinematic (slow, moody, elegant), energetic (fast cuts, bold), dreamy (soft, warm, slow), retro (film-photo look), playful (fun, bright, cheeky).
- motion is the camera move; transition is how the scene comes in. Vary them: cut and push suit fast beats, fade and iris suit slow ones, flip and clock-wipe are showy, use them once or twice.
- title: at most 6 words. tagline: at most 8 words, for the end card.
- Keep it friendly and suitable for everyone.`;

/** The words sent before the photos: the brief, the trip and its facts. */
export function reelPrompt(prompt: string, trip: { name: string; destination: string }, candidates: ReelCandidate[], facts: ReelFact[] = []) {
  const where = [trip.name, trip.destination].filter(Boolean).join(', ');
  return [
    `What the user wants: "${prompt}"`,
    where ? `The trip: ${where}.` : '',
    facts.length ? `Trip facts for a stats scene: ${facts.map((f) => `${f.value} ${f.label}`).join(', ')}.` : 'There are no trip facts, so do not use a stats scene.',
    `There are ${candidates.length} photos, in the order they were added. Each one follows its number.`,
  ].filter(Boolean).join('\n');
}

export function candidateLabel(candidate: ReelCandidate, number: number) {
  const caption = candidate.caption ? `, captioned "${candidate.caption.slice(0, 80)}"` : '';
  return `Photo ${number} (added by ${candidate.uploader} on ${candidate.takenOn}${caption}):`;
}

type RawScene = {
  kind?: unknown; photos?: unknown; photo?: unknown; caption?: unknown; seconds?: unknown; motion?: unknown;
  transition?: unknown; stickers?: unknown; effect?: unknown; layout?: unknown; places?: unknown;
};
type RawPlan = { title?: unknown; tagline?: unknown; style?: unknown; scenes?: unknown };

function stickersOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === 'string' && s.trim().length <= 8 && EMOJI.test(s.trim())).map((s) => s.trim()).slice(0, MAX_STICKERS);
}

function placesOf(value: unknown): ReelPlace[] {
  if (!Array.isArray(value)) return [];
  const places: ReelPlace[] = [];
  for (const raw of value as { name?: unknown; lat?: unknown; lng?: unknown }[]) {
    const name = line(raw?.name, 40);
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) continue;
    if (places.length && (Math.abs(lat - places[0].lat) > MAX_PLACE_SPREAD || Math.abs(lng - places[0].lng) > MAX_PLACE_SPREAD)) continue;
    places.push({ name, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
    if (places.length === MAX_PLACES) break;
  }
  return places;
}

/**
 * Turns a model's answer into a plan the player can trust: known photos only (each once outside collages), at most one
 * map and one stats scene, plausible map pins, emoji-only stickers, and lengths and names in range. Returns null when too
 * few usable scenes are left, so the caller can fall back.
 */
export function normalizePlan(raw: unknown, candidates: ReelCandidate[], fallbackTitle: string, facts: ReelFact[] = []): ReelPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const plan = raw as RawPlan;
  const used = new Set<number>();
  const scenes: ReelScene[] = [];
  const count = { map: 0, stats: 0, text: 0 };
  let total = 0;
  const known = (n: unknown) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= candidates.length;

  for (const value of Array.isArray(plan.scenes) ? (plan.scenes as RawScene[]) : []) {
    if (!value || typeof value !== 'object') continue;
    // Older answers had a single `photo` number
    const numbers = [...new Set((Array.isArray(value.photos) ? value.photos : [value.photo]).filter(known).map(Number))];
    let kind = oneOf(REEL_KINDS, value.kind, numbers.length > 1 ? 'collage' : 'photo');
    const caption = line(value.caption, 48);
    let photoNumbers: number[] = [];
    let places: ReelPlace[] | undefined;

    if (kind === 'collage') {
      photoNumbers = numbers.slice(0, 4);
      if (photoNumbers.length === 1) kind = 'photo';
      else if (!photoNumbers.length) continue;
    }
    if (kind === 'photo') {
      const fresh = numbers.find((n) => !used.has(n));
      if (fresh === undefined) continue;
      photoNumbers = [fresh];
    }
    if (kind === 'map') {
      places = placesOf(value.places);
      if (!places.length || count.map) continue;
    }
    if (kind === 'stats' && (!facts.length || count.stats)) continue;
    if (kind === 'text' && (!caption || count.text >= MAX_TEXT_SCENES)) continue;

    const minimum = kind === 'map' || kind === 'stats' ? 2.5 : MIN_SCENE_SECONDS;
    const seconds = Math.round(clamp(Number(value.seconds) || 2.5, minimum, MAX_SCENE_SECONDS) * 10) / 10;
    if (total + seconds > MAX_REEL_SECONDS || scenes.length >= MAX_SCENES) break;
    total += seconds;
    if (kind === 'photo') used.add(photoNumbers[0]);
    if (kind === 'map' || kind === 'stats' || kind === 'text') count[kind]++;
    scenes.push({
      kind,
      photoIds: photoNumbers.map((n) => candidates[n - 1].id),
      caption,
      seconds,
      motion: oneOf(REEL_MOTIONS, value.motion, 'zoom-in'),
      transition: oneOf(REEL_TRANSITIONS, value.transition, 'fade'),
      stickers: stickersOf(value.stickers),
      effect: oneOf(REEL_EFFECTS, value.effect, 'none'),
      ...(kind === 'collage' ? { layout: oneOf(REEL_LAYOUTS, value.layout, 'grid') } : {}),
      ...(places ? { places } : {}),
    });
  }
  const withPhotos = scenes.filter((s) => s.photoIds.length).length;
  if (scenes.length < MIN_SCENES || withPhotos < Math.min(2, candidates.length)) return null;
  return {
    title: line(plan.title, 48) || fallbackTitle,
    tagline: line(plan.tagline, 64) || 'Same squad, next trip?',
    style: oneOf(REEL_STYLES, plan.style, 'cinematic'),
    scenes,
    ...(count.stats ? { facts } : {}),
  };
}

// A look for the template cut, read from the words people usually use for it
const STYLE_WORDS: [ReelStyle, RegExp][] = [
  ['energetic', /\b(fast|hype|energ|party|beat|dance|bollywood|edm|night|club|adventure|action|bold)/i],
  ['dreamy', /\b(dream|soft|calm|chill|sunset|sunrise|romantic|slow|lofi|lo-fi|aesthetic|peace)/i],
  ['retro', /\b(retro|vintage|film|old|90s|80s|polaroid|nostalg)/i],
  ['playful', /\b(fun|funny|goofy|silly|meme|cute|playful|lol|crazy|candid)/i],
];

export function styleFromPrompt(prompt: string): ReelStyle {
  return STYLE_WORDS.find(([, words]) => words.test(prompt))?.[0] ?? 'cinematic';
}

/** Spreads `count` picks evenly over `items`, keeping their order. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / Math.max(1, count - 1))]);
}

const TEMPLATE_EFFECT: Record<ReelStyle, ReelEffect> = { cinematic: 'none', energetic: 'sparkle', dreamy: 'light-leak', retro: 'grain', playful: 'confetti' };

/**
 * The hand-written cut: up to 12 photos spread over the trip, paced and moved to suit the look the prompt asks for, with
 * a collage in the middle when there are enough photos and the trip's numbers near the end.
 */
export function templatePlan(prompt: string, candidates: ReelCandidate[], tripName: string, facts: ReelFact[] = []): ReelPlan {
  const style = styleFromPrompt(prompt);
  const seconds = { cinematic: 3, energetic: 1.4, dreamy: 3.5, retro: 2.5, playful: 2 }[style];
  const picks = spread(candidates, style === 'energetic' ? 14 : 10);
  const transitions: ReelTransition[] = style === 'energetic' ? ['cut', 'push', 'cut', 'slide'] : ['fade', 'wipe', 'iris', 'slide'];
  const scenes: ReelScene[] = picks.map((photo, i) => ({
    kind: 'photo',
    photoIds: [photo.id],
    caption: i === 0 ? 'And so it began' : '',
    seconds,
    motion: REEL_MOTIONS[i % REEL_MOTIONS.length],
    transition: i === 0 ? 'fade' : transitions[i % transitions.length],
    stickers: [],
    effect: i === 0 ? TEMPLATE_EFFECT[style] : 'none',
  }));
  if (picks.length >= 6) {
    scenes.splice(Math.floor(scenes.length / 2), 0, {
      kind: 'collage', photoIds: spread(candidates, 4).map((p) => p.id), caption: 'The squad', seconds: 3, motion: 'zoom-in',
      transition: 'flip', stickers: style === 'cinematic' ? [] : ['✨'], effect: 'none', layout: style === 'retro' ? 'stack' : 'grid',
    });
  }
  if (facts.length) {
    scenes.push({ kind: 'stats', photoIds: [], caption: 'By the numbers', seconds: 3, motion: 'zoom-in', transition: 'clock-wipe', stickers: [], effect: TEMPLATE_EFFECT[style] === 'none' ? 'sparkle' : TEMPLATE_EFFECT[style] });
  }
  const length = Math.round(scenes.reduce((sum, s) => sum + s.seconds, 0));
  return {
    title: tripName ? `${tripName} in ${length} seconds` : 'Our trip in a minute',
    tagline: 'Same squad, next trip?',
    style,
    scenes,
    ...(facts.length ? { facts } : {}),
  };
}

export const planSeconds = (plan: { scenes: { seconds: number }[] }) => plan.scenes.reduce((sum, scene) => sum + scene.seconds, 0);

type StoredScene = Partial<ReelScene> & { photoId?: string };

/** A scene as stored, upgraded from the first version (one `photoId`, no kind, stickers or effect). */
export function upgradeScene(scene: StoredScene): ReelScene {
  return {
    kind: scene.kind ?? 'photo',
    photoIds: scene.photoIds ?? (scene.photoId ? [scene.photoId] : []),
    caption: scene.caption ?? '',
    seconds: scene.seconds ?? 2.5,
    motion: scene.motion ?? 'zoom-in',
    transition: scene.transition ?? 'fade',
    stickers: scene.stickers ?? [],
    effect: scene.effect ?? 'none',
    ...(scene.layout ? { layout: scene.layout } : {}),
    ...(scene.places ? { places: scene.places } : {}),
  };
}
