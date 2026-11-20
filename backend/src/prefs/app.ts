import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { Database } from '../db.ts';
import type { User } from '../auth/types.ts';
import type { AnswersResponse, CoreDeckResponse, MeResponse, ResetResponse, TripDeckResponse } from './contract.ts';
import { CORE_DECK } from './registry.ts';
import { PrefsService } from './service.ts';

export type Authenticate = (token: string) => Promise<User>;

export type PrefsAppOptions = {
  /** Needed for everything but the core deck: answers and tastes are stored */
  db?: Database;
  authenticate?: Authenticate;
  now?: () => Date;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// Vibe Swipe: the travel-style quiz and each trip's experience deck. Mount under /api/prefs. The core deck is public
// (the quiz runs before sign-up); everything else needs a signed-in user and the database.
export function createPrefsApp({ db, authenticate, now }: PrefsAppOptions = {}) {
  const router = Router();
  const service = db ? new PrefsService(db, now) : null;
  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;

  const requireUser: RequestHandler = async (req, res, next) => {
    if (!service || !authenticate) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Saving your vibe needs a database; set MONGODB_CONNECTION_STRING');
    }
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  router.get('/deck/core', (_req, res) => {
    const body: CoreDeckResponse = { deck: { scope: 'core', cards: CORE_DECK } };
    res.json(body);
  });

  // Unanswered cards first (adaptive order), then the ones you answered; `fans` = mates who liked or loved each card
  router.get('/trips/:tripId/deck', requireUser, async (req, res) => {
    const body: TripDeckResponse = { deck: await service!.tripDeck(user(res).id, String(req.params.tripId)) };
    res.json(body);
  });

  router.get('/me', requireUser, async (_req, res) => {
    const body: MeResponse = await service!.me(user(res).id);
    res.json(body);
  });

  router.post('/answers', requireUser, jsonBody, async (req, res) => {
    const { taste, summary, saved, scope } = await service!.saveAnswers(user(res).id, req.body);
    logger.info('Prefs', `${user(res).email} saved ${saved} answer(s) for ${scope === 'core' ? 'the core deck' : `trip ${scope}`} (${taste.answered} card(s) scored)`);
    const body: AnswersResponse = { taste, summary };
    res.json(body);
  });

  router.post('/reset', requireUser, jsonBody, async (req, res) => {
    const body: ResetResponse = await service!.resetCore(user(res).id, req.body);
    logger.info('Prefs', `${user(res).email} reset their core answers`);
    res.json(body);
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}
