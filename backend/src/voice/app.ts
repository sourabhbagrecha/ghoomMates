import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import { createVoiceSession, liveKitConfig } from './session.ts';

export type Authenticate = (token: string) => Promise<User>;

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }`. */
export type VoiceDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }> };
};

export type VoiceAppOptions = {
  db: VoiceDb;
  authenticate: Authenticate;
  /** Mints the short-lived API token the agent uses to act as this user (never the user's own session JWT). */
  agentToken: (user: User) => string;
  /** Source of LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Defaults to process.env. */
  env?: Record<string, string | undefined>;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// GhoomMate voice sessions: mints a LiveKit token whose room dispatches the agent. Mount under /api/voice.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVoiceApp({ db, authenticate, agentToken, env = process.env }: VoiceAppOptions) {
  const config = liveKitConfig(env);
  if (!config) logger.warn('Voice', 'GhoomMate voice is disabled: set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET');
  const router = Router();

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  router.use(requireUser);

  router.post('/session', jsonBody, async (req, res) => {
    if (!config) throw new ApiError(503, 'VOICE_DISABLED', 'GhoomMate voice is not configured on this server');
    const user = res.locals.user as User;
    const tripId = (req.body as { tripId?: unknown })?.tripId;
    if (typeof tripId !== 'string' || !tripId.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'tripId is required');

    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rowCount } = await db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, user.id]);
    if (!rowCount) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');

    const session = await createVoiceSession(config, {
      tripId,
      userId: user.id,
      userName: user.name || user.username,
      authToken: agentToken(user),
    });
    logger.info('Voice', `${user.email} started a GhoomMate session in ${session.roomName}`);
    res.json(session);
  });

  return router;
}
