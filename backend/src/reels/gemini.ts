import { ApiError } from '../http.ts';
import { MOTIONS, REEL_STYLES, TRANSITIONS } from './plan.ts';
import type { ReelRequest } from './plan.ts';

// Returns the model's raw plan; normalizePlan makes it safe to play.
export type ReelPlanner = (request: ReelRequest) => Promise<unknown>;

export interface GeminiPlannerConfig {
  apiKey: string;
  model: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SYSTEM_PROMPT = `You are GhoomMate, the reel director for Ghoomates, a group-travel app for a squad of friends.
You turn a squad's trip photos into a short vertical (9:16) social reel, following the user's direction.

Pick a style:
${Object.entries(REEL_STYLES).map(([id, description]) => `- ${id}: ${description}`).join('\n')}

Rules:
- Only use photoId values from the photo list. Look at each photo and its metadata to pick the shots that best fit the direction.
- Order scenes to tell a story. Short reels may skip weak or off-topic photos; longer reels may reuse a strong photo with a different motion.
- Scene seconds should add up to roughly the target duration minus 3 seconds for the title and end cards.
  Highlights cuts are 0.8 to 2 seconds; cinematic shots are 3 to 6 seconds.
- Captions are at most 6 words, playful, in the squad's voice. Light Hinglish is welcome. No hashtags or emoji.
  Leave a caption empty when the shot speaks for itself.
- If the direction is about one person, set starring to their name exactly as listed in the squad and favour photos they are in.
- title is the reel's on-screen title (at most 5 words); subtitle is a short line under it, such as the place and dates.
- soundtrack names the kind of music that fits (for example "Bollywood beat" or "Lo-fi sunset"), at most 4 words.
- outro is a one-line sign-off for the end card.`;

function responseSchema(photoIds: string[]) {
  const str = { type: 'STRING' };
  return {
    type: 'OBJECT',
    properties: {
      title: str,
      subtitle: str,
      style: { type: 'STRING', enum: Object.keys(REEL_STYLES) },
      soundtrack: str,
      starring: { type: 'STRING', nullable: true },
      outro: str,
      scenes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            photoId: { type: 'STRING', enum: photoIds },
            seconds: { type: 'NUMBER' },
            caption: str,
            motion: { type: 'STRING', enum: [...MOTIONS] },
            transition: { type: 'STRING', enum: [...TRANSITIONS] },
          },
          required: ['photoId', 'seconds', 'caption', 'motion', 'transition'],
          propertyOrdering: ['photoId', 'seconds', 'caption', 'motion', 'transition'],
        },
      },
    },
    required: ['title', 'subtitle', 'style', 'soundtrack', 'outro', 'scenes'],
    propertyOrdering: ['style', 'title', 'subtitle', 'starring', 'soundtrack', 'scenes', 'outro'],
  };
}

// Text and thumbnails for one generateContent call: the brief, then each photo's metadata followed by its image.
function userParts(request: ReelRequest) {
  const brief = [
    `Direction: ${request.direction}`,
    `Style: ${request.style ?? 'choose the best fit for the direction'}`,
    `Target duration: ${request.durationSeconds} seconds`,
    request.squad.length ? `Squad: ${request.squad.join(', ')}` : '',
    request.previousTitle ? `This is a regenerate. The last cut was titled "${request.previousTitle}"; make this take feel different.` : '',
    'Photos:',
  ].filter(Boolean).join('\n');

  return [
    { text: brief },
    ...request.photos.flatMap((photo) => {
      const meta = [
        `photoId: ${photo.id}`,
        photo.caption && `place: ${photo.caption}`,
        photo.time && `taken: ${photo.time}`,
        photo.people.length > 0 && `people: ${photo.people.join(', ')}`,
      ].filter(Boolean).join(' | ');
      return photo.image ? [{ text: meta }, { inlineData: photo.image }] : [{ text: meta }];
    }),
  ];
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

// Plans reels with the Gemini API's structured JSON output.
export function createGeminiPlanner({ apiKey, model, fetch: fetchImpl = fetch, timeoutMs = 60_000 }: GeminiPlannerConfig): ReelPlanner {
  return async (request) => {
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: userParts(request) }],
          generationConfig: {
            temperature: 1,
            responseMimeType: 'application/json',
            responseSchema: responseSchema(request.photos.map((p) => p.id)),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error('Gemini request failed:', err instanceof Error ? err.message : 'UnknownError');
      throw new ApiError(502, 'PLANNER_FAILED', 'Could not reach the reel planner');
    }

    if (!response.ok) {
      console.error(`Gemini returned ${response.status}:`, (await response.text().catch(() => '')).slice(0, 500));
      if (response.status === 429) throw new ApiError(429, 'PLANNER_BUSY', 'The reel planner is busy, try again in a minute');
      throw new ApiError(502, 'PLANNER_FAILED', 'The reel planner could not plan this reel');
    }

    const data = await response.json() as GenerateContentResponse;
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') {
      throw new ApiError(422, 'DIRECTION_REJECTED', 'GhoomMate can’t make that reel. Try a different direction');
    }
    const json = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    try {
      return JSON.parse(json);
    } catch {
      throw new ApiError(502, 'PLANNER_FAILED', 'The reel planner returned an unreadable plan');
    }
  };
}
