import { ApiError } from '../http.ts';

// A reel plan is the edit decision list the frontend's Remotion templates play back:
// which photo shows when, for how long, with what caption, camera move and transition.

export const REEL_STYLES = {
  highlights: 'Fast, punchy recap. Short beat-synced cuts, bold all-caps captions, high energy.',
  cinematic: 'Slow travel film. Letterboxed, long Ken Burns moves, soft fades, poetic captions.',
  diary: 'Day-by-day trip diary in chronological order. Each card shows the day, time and place.',
  spotlight: 'Starring one squad member (or the whole squad). Name tags on the people in each shot.',
  scrapbook: 'Polaroids dropping onto a scrapbook page, tilted and stacked, with handwritten captions.',
} as const;
export type ReelStyle = keyof typeof REEL_STYLES;

export const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'drift'] as const;
export const TRANSITIONS = ['cut', 'fade', 'slide', 'wipe'] as const;
export type Motion = (typeof MOTIONS)[number];
export type Transition = (typeof TRANSITIONS)[number];

export interface ReelScene {
  photoId: string;
  seconds: number;
  caption: string;
  motion: Motion;
  transition: Transition;
}

export interface ReelPlan {
  title: string;
  subtitle: string;
  style: ReelStyle;
  soundtrack: string;
  starring: string | null;
  outro: string;
  scenes: ReelScene[];
}

export interface ReelPhoto {
  id: string;
  caption: string;
  time: string;
  people: string[];
  image?: { mimeType: string; data: string };
}

export interface ReelRequest {
  direction: string;
  style: ReelStyle | null;
  durationSeconds: number;
  squad: string[];
  photos: ReelPhoto[];
  // Title of the cut being regenerated, so the next take tries something different
  previousTitle: string | null;
}

export const LIMITS = {
  photos: 24,
  scenes: 30,
  directionChars: 500,
  // Base64 characters per thumbnail, about 300 KB of image
  imageChars: 400_000,
  minSeconds: 6,
  maxSeconds: 90,
  defaultSeconds: 30,
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_TRANSITION: Record<ReelStyle, Transition> = {
  highlights: 'cut',
  cinematic: 'fade',
  diary: 'slide',
  spotlight: 'wipe',
  scrapbook: 'cut',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const oneOf = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
  options.includes(value as T) ? (value as T) : undefined;

const isStyle = (value: unknown): value is ReelStyle => typeof value === 'string' && Object.hasOwn(REEL_STYLES, value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function invalid(message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

// Validates the POST /reels/plan body.
export function parseReelRequest(body: unknown): ReelRequest {
  if (!isRecord(body)) invalid('Body must be a JSON object');

  const direction = text(body.direction, LIMITS.directionChars);
  if (!direction) invalid('direction is required');

  const style = body.style === undefined || body.style === null || body.style === 'auto' ? null : body.style;
  if (style !== null && !isStyle(style)) invalid(`style must be one of auto, ${Object.keys(REEL_STYLES).join(', ')}`);

  const durationSeconds = body.durationSeconds === undefined ? LIMITS.defaultSeconds : Number(body.durationSeconds);
  if (!Number.isFinite(durationSeconds)) invalid('durationSeconds must be a number');

  if (!Array.isArray(body.photos) || body.photos.length === 0) invalid('photos must be a non-empty array');
  if (body.photos.length > LIMITS.photos) invalid(`At most ${LIMITS.photos} photos per reel`);

  const ids = new Set<string>();
  const photos = body.photos.map((photo: unknown, i: number): ReelPhoto => {
    if (!isRecord(photo)) invalid(`photos[${i}] must be an object`);
    const id = text(photo.id, 40);
    if (!id) invalid(`photos[${i}].id is required`);
    if (ids.has(id)) invalid(`photos[${i}].id is duplicated`);
    ids.add(id);

    let image: ReelPhoto['image'];
    if (photo.image !== undefined) {
      if (!isRecord(photo.image)) invalid(`photos[${i}].image must be an object`);
      const { mimeType, data } = photo.image;
      if (typeof mimeType !== 'string' || !IMAGE_TYPES.includes(mimeType)) {
        invalid(`photos[${i}].image.mimeType must be one of ${IMAGE_TYPES.join(', ')}`);
      }
      if (typeof data !== 'string' || !data || data.length > LIMITS.imageChars || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
        invalid(`photos[${i}].image.data must be base64 under ${LIMITS.imageChars} characters`);
      }
      image = { mimeType, data };
    }

    return {
      id,
      caption: text(photo.caption, 80),
      time: text(photo.time, 60),
      people: Array.isArray(photo.people) ? photo.people.map((p) => text(p, 40)).filter(Boolean).slice(0, 12) : [],
      image,
    };
  });

  return {
    direction,
    style,
    durationSeconds: clamp(Math.round(durationSeconds), LIMITS.minSeconds, LIMITS.maxSeconds),
    squad: Array.isArray(body.squad) ? body.squad.map((p) => text(p, 40)).filter(Boolean).slice(0, 20) : [],
    photos,
    previousTitle: text(body.previousTitle, 80) || null,
  };
}

// Turns whatever the model returned into a plan the templates can always play:
// unknown photos and options are dropped or defaulted, and scene lengths are scaled to the requested duration.
export function normalizePlan(raw: unknown, request: ReelRequest): ReelPlan {
  if (!isRecord(raw)) throw new ApiError(502, 'PLANNER_FAILED', 'The reel planner returned an unreadable plan');

  const style: ReelStyle = request.style ?? (isStyle(raw.style) ? raw.style : 'highlights');
  const photoIds = new Set(request.photos.map((p) => p.id));

  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .filter(isRecord)
    .filter((scene) => typeof scene.photoId === 'string' && photoIds.has(scene.photoId))
    .slice(0, LIMITS.scenes)
    .map((scene): ReelScene => ({
      photoId: scene.photoId as string,
      seconds: Number.isFinite(Number(scene.seconds)) && Number(scene.seconds) > 0 ? Number(scene.seconds) : 3,
      caption: text(scene.caption, 48),
      motion: oneOf(MOTIONS, scene.motion) ?? 'zoom-in',
      transition: oneOf(TRANSITIONS, scene.transition) ?? DEFAULT_TRANSITION[style],
    }));
  if (scenes.length === 0) throw new ApiError(502, 'PLANNER_FAILED', 'The reel planner did not pick any photos');

  // The intro and outro cards take about 3 seconds of the requested length
  const sceneBudget = Math.max(request.durationSeconds - 3, scenes.length);
  const total = scenes.reduce((sum, s) => sum + s.seconds, 0);
  for (const scene of scenes) {
    scene.seconds = Math.round(clamp((scene.seconds * sceneBudget) / total, 0.8, 8) * 10) / 10;
  }

  const starring = text(raw.starring, 40);
  return {
    title: text(raw.title, 48) || 'Our trip',
    subtitle: text(raw.subtitle, 60),
    style,
    soundtrack: text(raw.soundtrack, 40),
    starring: starring && request.squad.some((name) => name.toLowerCase() === starring.toLowerCase()) ? starring : null,
    outro: text(raw.outro, 60),
    scenes,
  };
}
