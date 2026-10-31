import { Router } from 'express';
import type { RequestHandler } from 'express';
import { verifyJwt } from '../auth/jwt.ts';
import { cors, getBearerToken, jsonBodyUpTo } from '../http.ts';
import type { ReelPlanner } from './gemini.ts';
import { normalizePlan, parseReelRequest } from './plan.ts';

export interface ReelsConfig {
  jwtSecret: string;
  clientOrigin: string;
}

// Up to 24 thumbnails of a few hundred KB each
const reelBody = jsonBodyUpTo('10mb');

// AI reel planning. Mount under /reels. Signed-in users only, since every plan is a paid model call.
export function createApp(planner: ReelPlanner, { jwtSecret, clientOrigin }: ReelsConfig) {
  const router = Router();
  router.use(cors(clientOrigin));

  const requireSession: RequestHandler = (req, _res, next) => {
    verifyJwt(getBearerToken(req), jwtSecret);
    next();
  };

  router.post('/plan', requireSession, reelBody, async (req, res) => {
    const request = parseReelRequest(req.body);
    res.json({ plan: normalizePlan(await planner(request), request) });
  });

  return router;
}
