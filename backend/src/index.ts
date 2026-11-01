import { createServer } from './app.ts';
import { isDatabaseConfigured, openDatabase } from './db.ts';
import { loadEnv } from './env.ts';
import { createArtworksApp } from './artworks/app.ts';
import { createApp as createAuthApp } from './auth/app.ts';
import { createInMemoryOAuthDatabase, createPostgresOAuthDatabase } from './auth/database.ts';
import { signJwt } from './auth/jwt.ts';
import { OAuthService } from './auth/service.ts';
import { createApp as createExpensesApp } from './expenses/app.ts';
import { createFrontendRouter } from './frontend.ts';
import { createGemini } from './gemini.ts';
import { createHeritageApp } from './heritage/app.ts';
import { createMakersApp, createPostgresMakers } from './makers/app.ts';
import { createImpactApp } from './impact/app.ts';
import { createHospitalityApp } from './hospitality/app.ts';
import { logger } from './logger.ts';
import { createOpsApp } from './ops/app.ts';
import { createStoriesApp } from './stories/app.ts';
import { createMediaRouter, createMediaStorage } from './storage.ts';
import { createApp as createTripsApp } from './trips/app.ts';
import { ItineraryService } from './trips/itinerary.ts';
import { TripService } from './trips/service.ts';
import { createVoiceApp } from './voice/app.ts';
import { liveKitConfig } from './voice/session.ts';

loadEnv();

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const hostname = process.env.HOST ?? '127.0.0.1';

// The dev fallback secret is public (it is in this repo), so a production server refuses to start without a real one.
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'ghoommates-oauth-jwt-secret-key-32chars-min-dev-2026');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters (backend/.env, or the JWT_SECRET secret on Cloud Run)');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const apiKey = process.env.API_KEY ?? '';
if (apiKey && apiKey.length < 32) throw new Error('Set API_KEY to a secret of at least 32 characters in .env');

// One shared Cloud SQL (Postgres) pool for every module. Without a database, auth runs on an
// in-memory store and the expense API is disabled.
let db: Awaited<ReturnType<typeof openDatabase>> | undefined;
let dbMode = 'In-memory (fallback)';
if (isDatabaseConfigured()) {
  try {
    db = await openDatabase();
    dbMode = process.env.CLOUD_SQL_INSTANCE ? `Cloud SQL (${process.env.CLOUD_SQL_INSTANCE})` : 'Postgres (DATABASE_URL)';
  } catch (err: any) {
    logger.warn('Server', `Cloud database connection failed (${err.message}). Falling back to in-memory store.`);
  }
}

const authDb = db ? createPostgresOAuthDatabase(db) : createInMemoryOAuthDatabase();
if (!db) {
  logger.info('Server', 'Running auth with in-memory store');
}

let expenses: ReturnType<typeof createExpensesApp> | undefined;
if (db && apiKey) {
  expenses = createExpensesApp(db, apiKey);
} else {
  const missing = [!db && 'database', !apiKey && 'API_KEY'].filter(Boolean).join(' and ');
  logger.warn('Server', `Expense API (/api/*) is disabled: requires ${missing}`);
}

const authConfig = {
  jwtSecret,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `${clientOrigin}/auth/callback`,
  clientOrigin,
};

// Photos and receipts: GCS with a service account key from .env, or local disk as a fallback.
const storage = createMediaStorage(jwtSecret);
const authService = new OAuthService(authDb, authConfig);

const authenticate = async (token: string) => (await authService.verifySessionToken(token)).user;

// One Gemini client for every AI feature; each feature falls back to hand-written content when it is off.
const gemini = createGemini();

let trips: ReturnType<typeof createTripsApp> | undefined;
let voice: ReturnType<typeof createVoiceApp> | undefined;
let artworks: ReturnType<typeof createArtworksApp> | undefined;
let impact: ReturnType<typeof createImpactApp> | undefined;
if (db) {
  trips = createTripsApp(db, storage, authenticate, clientOrigin);
  artworks = createArtworksApp({ db, storage, gemini, authenticate });
  voice = createVoiceApp({
    db,
    authenticate,
    // A separate 2-hour token for the agent, so the user's 7-day session JWT never leaves the browser.
    agentToken: (user) => signJwt({ userId: user.id, email: user.email, name: user.name }, jwtSecret, 2 * 60 * 60),
    env: process.env,
  });
  impact = createImpactApp({ db, authenticate, gemini, env: process.env });
} else {
  logger.warn('Server', 'Trips API (/api/trips/*) and voice (/api/voice/*) are disabled: requires a database');
}

// Kaavad Tales: hand-written stories and shipped narration need no database, stamps and the passport do. Speech goes through
// Vertex AI when it is set up, since the API key's free tier allows only 10 speech requests a day.
const noDatabase = { pool: { query: async () => { throw new Error('No database configured'); } } };
const stories = createStoriesApp({
  db: db ?? noDatabase,
  storage,
  gemini,
  vertex: process.env.VERTEX_PROJECT ? createGemini({ ...process.env, GEMINI_API_KEY: '' }) : undefined,
  authenticate,
});

const app = createServer({
  // Production: also serve the built web app from this server (SERVE_FRONTEND_DIR, set in the Docker image)
  frontend: createFrontendRouter(process.env.SERVE_FRONTEND_DIR),
  auth: createAuthApp(authDb, {
    ...authConfig,
    // Keep a copy of each new selfie in the media bucket for the face-matching pipeline
    onPictureSaved: (userId, picture) => {
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(picture);
      if (!match) return;
      const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1].slice(6);
      storage.put(`users/${userId}/selfie.${ext}`, Buffer.from(match[2], 'base64'), match[1])
        .catch((err) => logger.warn('Storage', `Could not store selfie for ${userId}: ${err.message}`));
    },
  }),
  expenses,
  trips,
  voice,
  artworks,
  impact,
  heritage: createHeritageApp(),
  makers: createMakersApp({ gemini, authenticate, ...(db ? createPostgresMakers(db, storage, clientOrigin) : {}) }),
  // Hosts and the dashboard work without a database; squad tables reuse the trips module's membership check and stop insert
  hospitality: createHospitalityApp({
    authenticate,
    gemini,
    db,
    trips: db ? new TripService(db, storage, clientOrigin) : undefined,
    stops: db ? new ItineraryService(db) : undefined,
  }),
  stories,
  media: createMediaRouter(storage),
  // Heritage Ops works without a database too (modelled baseline, advisories kept in memory)
  ops: createOpsApp({ db, authenticate, gemini }),
});

const server = app.listen(port, hostname, (err?: Error) => {
  if (err) throw err;
  const isGoogleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  console.log(`
┌────────────────────────────────────────────────────────┐
│               Ghoommates Backend Server                 │
├────────────────────────────────────────────────────────┤
│  Address:     http://${hostname}:${port.toString().padEnd(39)}│
│  Frontend:    ${clientOrigin.padEnd(41)}│
│  Database:    ${dbMode.slice(0, 41).padEnd(41)}│
│  Auth:        ${isGoogleConfigured ? 'Google OAuth 2.0 (configured)          ' : 'Dev Mock Mode (no Google keys)       '} │
│  Trips:       ${(trips ? 'Enabled' : 'Disabled (needs DB)').padEnd(41)}│
│  Voice:       ${(voice && liveKitConfig() ? 'Enabled (LiveKit)' : voice ? 'Disabled (needs LIVEKIT_* keys)' : 'Disabled (needs DB)').padEnd(41)}│
│  Media:       ${storage.description.slice(0, 41).padEnd(41)}│
│  Gemini:      ${(gemini.enabled ? `Enabled (${gemini.models.lite})` : 'Disabled (needs GEMINI_API_KEY)').slice(0, 41).padEnd(41)}│
│  Ledger API:  ${(expenses ? 'Enabled' : 'Disabled (needs DB + API_KEY)').padEnd(41)}│
└────────────────────────────────────────────────────────┘
`);
  logger.info('Server', `Listening at http://${hostname}:${port}`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('Server', 'Gracefully shutting down Ghoommates backend...');
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await authDb.terminate();
  await db?.close();
  logger.info('Server', 'Shutdown complete.');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
