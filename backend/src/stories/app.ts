import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { User } from '../auth/types.ts';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import { StoriesService, type StoriesOptions } from './service.ts';
import { isAudience, isLang, type Audience, type Lang } from './types.ts';

export type Authenticate = (token: string) => Promise<User>;

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function langOf(value: unknown): Lang {
  if (value === undefined || value === '') return 'en';
  if (!isLang(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'lang must be en or hi');
  return value;
}

function audienceOf(value: unknown): Audience {
  if (value === undefined || value === '') return 'classic';
  if (!isAudience(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'audience must be classic, family, friends, couple or history');
  return value;
}

const tripOf = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Quiz answers: one option index per question (null for a skipped one) */
function answersOf(value: unknown): (number | null)[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new ApiError(400, 'VALIDATION_ERROR', 'answers must be a list of 1 to 5 option numbers');
  return value.map((answer) => {
    if (answer === null) return null;
    if (!Number.isInteger(answer) || answer < 0 || answer > 9) throw new ApiError(400, 'VALIDATION_ERROR', 'each answer must be an option number');
    return answer as number;
  });
}

function userIdsOf(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20 || value.some(id => typeof id !== 'string' || !id || id.length > 100)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'withUserIds must be a list of up to 20 user ids');
  }
  return value as string[];
}

export type StoriesAppOptions = StoriesOptions & { authenticate: Authenticate };

/**
 * Kaavad Tales: Udaipur's heritage stories told panel by panel, narrated aloud, with a quiz that stamps your Heritage
 * Passport. Mount under /api/stories.
 */
export function createStoriesApp({ authenticate, ...options }: StoriesAppOptions) {
  const service = new StoriesService(options);
  const router = Router();

  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;
  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };
  /** Stories are public; a signed-in reader on a trip also gets them tuned to the squad */
  const optionalUser = async (req: Request) => {
    const token = bearer(req);
    return token ? await authenticate(token).catch(() => null) : null;
  };

  // Every site with its story, for the Explore carousel and the passport grid
  router.get('/', (_req, res) => {
    res.json({ items: service.catalogue() });
  });

  // Your Heritage Passport: your stamps and every site, stamped or not yet. Registered before /:siteId.
  router.get('/passport', requireUser, async (_req, res) => {
    res.json(await service.passport(user(res).id));
  });

  // The squad's passports: who has which stamp, and a leaderboard
  router.get('/passport/trip/:tripId', requireUser, async (req, res) => {
    res.json(await service.tripPassport(String(req.params.tripId), user(res).id));
  });

  router.get('/:siteId', async (req, res) => {
    const lang = langOf(req.query.lang);
    const audience = audienceOf(req.query.audience);
    const viewer = await optionalUser(req);
    res.json(await service.story({ siteId: String(req.params.siteId), lang, audience, viewerId: viewer?.id, tripId: tripOf(req.query.tripId) }));
  });

  // The storyteller's voice for the story as shown: { lang, audience, tripId? } → a playable URL and where each panel starts
  router.post('/:siteId/narration', requireUser, jsonBody, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const narration = await service.narration({
      siteId: String(req.params.siteId),
      lang: langOf(body.lang),
      audience: audienceOf(body.audience),
      viewerId: user(res).id,
      tripId: tripOf(body.tripId),
    });
    res.json(narration);
  });

  // Scores the quiz on the server and stamps the passport: yours, plus anyone from the trip who listened with you
  router.post('/:siteId/stamp', requireUser, jsonBody, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stamp = await service.stamp({
      siteId: String(req.params.siteId),
      lang: langOf(body.lang),
      audience: audienceOf(body.audience),
      viewerId: user(res).id,
      tripId: tripOf(body.tripId),
      answers: answersOf(body.answers),
      withUserIds: userIdsOf(body.withUserIds),
    });
    logger.info('Stories', `${user(res).email} scored ${stamp.score}/${stamp.total} at ${stamp.siteId}${stamp.stampedWith ? ` and stamped ${stamp.stampedWith} more` : ''}`);
    res.json(stamp);
  });

  return router;
}
