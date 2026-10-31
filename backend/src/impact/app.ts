import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { Gemini } from '../gemini.ts';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import { ImpactAi } from './ai.ts';
import { dbCache, type ImpactDb } from './cache.ts';
import { createRouteLookup } from './maps.ts';
import { ImpactService, type TripAccess } from './service.ts';

export type Authenticate = (token: string) => Promise<User>;

export type ImpactAppOptions = {
  db: ImpactDb;
  authenticate: Authenticate;
  /** Sorts expenses the rules can't place and re-words the swaps. Optional: without it the rules are used. */
  gemini?: Gemini;
  /** GOOGLE_MAPS_API_KEY switches on real road distances from the Routes API */
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// Green Trip: the squad's footprint, crowd-hours avoided, money kept local, pledges and swaps. Mount under /api/impact.
export function createImpactApp({ db, authenticate, gemini, env = process.env, fetchImpl }: ImpactAppOptions) {
  const cache = dbCache(db);
  const routes = createRouteLookup({ apiKey: env.GOOGLE_MAPS_API_KEY, cache, fetchImpl });
  const service = new ImpactService(db, new ImpactAi(gemini, cache), routes);
  logger.info('Impact', `Green Trip ready (distances: ${routes ? 'Google Routes API' : 'straight-line estimates'}; Gemini: ${gemini?.enabled ? 'on' : 'off'})`);

  const router = Router();
  const access = (res: { locals: Record<string, any> }) => res.locals.access as TripAccess;

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };
  router.use(requireUser);

  // Members only: anyone else gets the same 404 as a trip that doesn't exist.
  router.param('tripId', async (_req, res, next, tripId: string) => {
    res.locals.access = await service.access(tripId, (res.locals.user as User).id);
    next();
  });

  router.get('/trips/:tripId', async (_req, res) => {
    res.json(await service.report(access(res)));
  });

  router.put('/trips/:tripId/legs', jsonBody, async (req, res) => {
    res.json(await service.setLeg(access(res), req.body));
  });

  router.get('/trips/:tripId/pledges', async (_req, res) => {
    res.json(await service.pledges(access(res)));
  });

  router.put('/trips/:tripId/pledges', jsonBody, async (req, res) => {
    res.json(await service.setPledge(access(res), req.body));
  });

  return router;
}
