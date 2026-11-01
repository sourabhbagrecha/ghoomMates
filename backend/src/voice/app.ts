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
  /** The trip as the trips API returns it (GET /api/trips/:id), or a 404 ApiError for non-members. Powers /context. */
  tripDetail?: (tripId: string, userId: string) => Promise<unknown>;
  /** Source of LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Defaults to process.env. */
  env?: Record<string, string | undefined>;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// GhoomMate: voice sessions (a LiveKit token whose room dispatches the agent) and chat history. Mount under /api/voice.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVoiceApp({ db, authenticate, agentToken, tripDetail, env = process.env }: VoiceAppOptions) {
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

  /** The trip id, if the caller is a member; non-members get 404 so trip ids don't leak */
  async function memberTrip(raw: unknown, user: User): Promise<string> {
    if (typeof raw !== 'string' || !raw.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'tripId is required');
    const tripId = raw.trim();
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rowCount } = await db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, user.id]);
    if (!rowCount) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return tripId;
  }

  router.post('/session', jsonBody, async (req, res) => {
    if (!config) throw new ApiError(503, 'VOICE_DISABLED', 'GhoomMate voice is not configured on this server');
    const user = res.locals.user as User;
    const tripId = await memberTrip((req.body as { tripId?: unknown })?.tripId, user);

    const session = await createVoiceSession(config, {
      tripId,
      userId: user.id,
      userName: user.name || user.username,
      authToken: agentToken(user),
    });
    logger.info('Voice', `${user.email} started a GhoomMate session in ${session.roomName} (agent "${config.agentName}")`);
    res.json(session);
  });

  async function recentHistory(tripId: string, userId: string, limit: number) {
    const { rows } = await db.pool.query(
      `SELECT id, role, text, created_at FROM ghoomate_messages WHERE trip_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT $3`,
      [tripId, userId, limit],
    );
    return (rows as { id: string | number; role: HistoryRole; text: string; created_at: Date | string }[])
      .map(r => ({ id: String(r.id), role: r.role, text: r.text, createdAt: new Date(r.created_at).toISOString() }))
      .reverse();
  }

  // Everything the agent needs to start a chat in one call: the trip, the caller's profile preferences (their
  // GhoomMate memory) and the latest history. It replaces three round trips from the worker. The trip lookup
  // checks membership itself, so non-members get 404.
  router.get('/context', async (req, res) => {
    if (!tripDetail) throw new ApiError(503, 'VOICE_DISABLED', 'GhoomMate voice is not configured on this server');
    const user = res.locals.user as User;
    const tripId = typeof req.query.tripId === 'string' ? req.query.tripId.trim() : '';
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const limit = Math.min(MAX_HISTORY_PAGE, Math.max(1, Number(req.query.limit) || 50));
    const [trip, history] = await Promise.all([tripDetail(tripId, user.id), recentHistory(tripId, user.id, limit)]);
    res.json({ trip, preferences: user.preferences ?? {}, history });
  });

  // Your GhoomMate chat history in a trip, oldest first: the latest `limit` messages (default 50, at most 200).
  router.get('/history', async (req, res) => {
    const user = res.locals.user as User;
    const tripId = await memberTrip(req.query.tripId, user);
    const limit = Math.min(MAX_HISTORY_PAGE, Math.max(1, Number(req.query.limit) || 50));
    const items = await recentHistory(tripId, user.id, limit);
    res.json({ items });
  });

  // Appends messages to your history (the agent saves each turn as the chat goes).
  router.post('/history', jsonBody, async (req, res) => {
    const user = res.locals.user as User;
    const body = (req.body ?? {}) as { tripId?: unknown; messages?: unknown };
    const tripId = await memberTrip(body.tripId, user);
    const messages = historyMessages(body.messages);
    const values: unknown[] = [tripId, user.id];
    const rows = messages.map((m, i) => {
      values.push(m.role, m.text);
      return `($1, $2, $${3 + i * 2}, $${4 + i * 2})`;
    });
    await db.pool.query(`INSERT INTO ghoomate_messages (trip_id, user_id, role, text) VALUES ${rows.join(', ')}`, values);
    res.status(201).json({ saved: messages.length });
  });

  // Clears your history in a trip.
  router.delete('/history', async (req, res) => {
    const user = res.locals.user as User;
    const tripId = await memberTrip(req.query.tripId, user);
    const { rowCount } = await db.pool.query('DELETE FROM ghoomate_messages WHERE trip_id = $1 AND user_id = $2', [tripId, user.id]);
    logger.info('Voice', `${user.email} cleared their GhoomMate history in trip ${tripId}`);
    res.json({ deleted: rowCount ?? 0 });
  });

  return router;
}

const MAX_HISTORY_PAGE = 200;
const MAX_HISTORY_BATCH = 50;
const MAX_MESSAGE_LENGTH = 4000;
type HistoryRole = 'user' | 'agent';

/** Validated messages to save: 1–50 of {role: user|agent, text}; text is trimmed and cut to 4,000 characters */
function historyMessages(raw: unknown): { role: HistoryRole; text: string }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_HISTORY_BATCH) {
    throw new ApiError(400, 'VALIDATION_ERROR', `messages must be a list of 1 to ${MAX_HISTORY_BATCH}`);
  }
  return raw.map((m) => {
    const { role, text } = (m ?? {}) as { role?: unknown; text?: unknown };
    if (role !== 'user' && role !== 'agent') throw new ApiError(400, 'VALIDATION_ERROR', 'role must be user or agent');
    if (typeof text !== 'string' || !text.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'text is required');
    return { role, text: text.trim().slice(0, MAX_MESSAGE_LENGTH) };
  });
}
