import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import type { Database } from '../db.ts';
import { createVoiceSession, liveKitConfig, liveKitPresence, type InRoom } from './session.ts';

export type Authenticate = (token: string) => Promise<User>;

export type VoiceDb = Pick<Database, 'db'>;

export type VoiceAppOptions = {
  db: VoiceDb;
  authenticate: Authenticate;
  /** Mints the short-lived API token the agent uses to act as this user (never the user's own session JWT). */
  agentToken: (user: User) => string;
  /** The trip as the trips API returns it (GET /api/trips/:id), or a 404 ApiError for non-members. Powers /context. */
  tripDetail?: (tripId: string, userId: string) => Promise<unknown>;
  /** Source of LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** The worker this server runs (VOICE_WORKER=inline): sessions dispatch to its agent name once it has registered
   *  with LiveKit. Unset (local dev, where `npm run dev` runs the worker), sessions dispatch to GHOOMATE_AGENT_NAME. */
  worker?: { agentName: string; ready(): Promise<boolean> };
  /** Whether the user is in the call's room (default: asks LiveKit). Ends a held session once they've left. */
  inRoom?: InRoom;
  /** How long a held session request may stay open, how often it sends a heartbeat line, how often it checks the
   *  room, and how long the user has to join it */
  holdMs?: number;
  heartbeatMs?: number;
  watchMs?: number;
  joinMs?: number;
};

// Cloud Run allows a request 60 minutes (the web service's --timeout); a call ends a little before that.
const HOLD_MS = 55 * 60_000;
// Keeps proxies (Cloudflare, Google's front end) from closing a quiet response, and finds a client that has gone.
const HEARTBEAT_MS = 15_000;
// Cloud Run's front end doesn't pass a client's disconnect on to the server, so the server can't tell from the
// connection that the app has let go. It asks LiveKit instead and releases the request once the user has left the
// room (or never joined it).
const WATCH_MS = 10_000;
const JOIN_MS = 60_000;

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// GhoomMate: voice sessions (a LiveKit token whose room dispatches the agent) and chat history. Mount under /api/voice.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVoiceApp({
  db: { db }, authenticate, agentToken, tripDetail, env = process.env, worker, inRoom,
  holdMs = HOLD_MS, heartbeatMs = HEARTBEAT_MS, watchMs = WATCH_MS, joinMs = JOIN_MS,
}: VoiceAppOptions) {
  const base = liveKitConfig(env);
  const config = base && worker ? { ...base, agentName: worker.agentName } : base;
  const present = inRoom ?? (config ? liveKitPresence(config) : null);
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
    const member = await db.collection('trip_members').findOne({ trip_id: tripId, user_id: user.id }, { projection: { _id: 1 } });
    if (!member) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return tripId;
  }

  router.post('/session', jsonBody, async (req, res) => {
    if (!config) throw new ApiError(503, 'VOICE_DISABLED', 'GhoomMate voice is not configured on this server');
    const user = res.locals.user as User;
    const tripId = await memberTrip((req.body as { tripId?: unknown })?.tripId, user);
    // LiveKit dispatches the agent when the user joins the room and drops the job if no worker is registered then,
    // so the token waits until this instance's worker is (re)connected.
    if (worker && !(await worker.ready())) {
      throw new ApiError(503, 'VOICE_AGENT_WAKING', 'GhoomMate is still waking up. Try again in a few seconds.');
    }

    const session = await createVoiceSession(config, {
      tripId,
      userId: user.id,
      userName: user.name || user.username,
      authToken: agentToken(user),
    });
    logger.info('Voice', `${user.email} started a GhoomMate session in ${session.roomName} (agent "${config.agentName}")`);
    if (!(req.headers.accept ?? '').includes('application/x-ndjson')) {
      res.json(session);
      return;
    }

    // Held session: the token is the first line, then the response stays open (a newline every heartbeatMs) for as
    // long as the call lasts. While it is open Cloud Run keeps this instance's CPU on, which the worker running the
    // call needs; once it ends the instance is idle and, with request-based billing, free. It ends when the user has
    // left the room (or not joined it within joinMs), the client disconnects (where a proxy passes that on), or
    // after holdMs.
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
    res.write(`${JSON.stringify(session)}\n`);
    const started = Date.now();
    let reason = 'the app disconnected';
    const release = (why: string) => {
      if (res.writableEnded) return;
      reason = why;
      res.end();
    };
    const beat = setInterval(() => res.write('\n'), heartbeatMs);
    const limit = setTimeout(() => release('time is up'), holdMs);
    let joined = false;
    let checking = false;
    const watch = setInterval(async () => {
      if (checking || !present) return;
      checking = true;
      try {
        if (await present(session.roomName, session.participantIdentity)) joined = true;
        else if (joined) release('the user left the room');
        else if (Date.now() - started > joinMs) release('the user never joined the room');
      } catch (err) {
        // LiveKit unreachable: keep holding; the time limit still ends it
        logger.warn('Voice', `Couldn't check room ${session.roomName}: ${(err as Error).message}`);
      } finally {
        checking = false;
      }
    }, watchMs);
    res.on('close', () => {
      clearInterval(beat);
      clearInterval(watch);
      clearTimeout(limit);
      logger.info('Voice', `GhoomMate session ${session.roomName} released after ${Math.round((Date.now() - started) / 1000)} s: ${reason}`);
    });
  });

  async function recentHistory(tripId: string, userId: string, limit: number) {
    // ObjectIds grow with insert order, like the old bigserial id
    const rows = await db.collection('ghoomate_messages').find({ trip_id: tripId, user_id: userId }).sort({ _id: -1 }).limit(limit).toArray();
    return rows
      .map(r => ({ id: String(r._id), role: r.role, text: r.text, createdAt: new Date(r.created_at).toISOString() }))
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
    const createdAt = new Date();
    await db.collection('ghoomate_messages').insertMany(messages.map(m => ({ trip_id: tripId, user_id: user.id, role: m.role, text: m.text, created_at: createdAt })));
    res.status(201).json({ saved: messages.length });
  });

  // Clears your history in a trip.
  router.delete('/history', async (req, res) => {
    const user = res.locals.user as User;
    const tripId = await memberTrip(req.query.tripId, user);
    const { deletedCount } = await db.collection('ghoomate_messages').deleteMany({ trip_id: tripId, user_id: user.id });
    logger.info('Voice', `${user.email} cleared their GhoomMate history in trip ${tripId}`);
    res.json({ deleted: deletedCount });
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
