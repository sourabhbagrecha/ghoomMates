import { createServer } from './app.ts';
import { isDatabaseConfigured, openDatabase } from './db.ts';
import { loadEnv } from './env.ts';
import { createApp as createAuthApp } from './auth/app.ts';
import { createInMemoryOAuthDatabase, createPostgresOAuthDatabase } from './auth/database.ts';
import { createApp as createExpensesApp } from './expenses/app.ts';

loadEnv();

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const hostname = process.env.HOST ?? '127.0.0.1';

const jwtSecret = process.env.JWT_SECRET || 'ghoomates-oauth-jwt-secret-key-32chars-min-dev-2026';
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in .env');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const apiKey = process.env.API_KEY ?? '';
if (apiKey && apiKey.length < 32) throw new Error('Set API_KEY to a secret of at least 32 characters in .env');

// One shared Cloud SQL (Postgres) pool for every module. Without a database, auth runs on an
// in-memory store and the expense API is disabled.
const db = isDatabaseConfigured() ? await openDatabase() : undefined;

const authDb = db ? createPostgresOAuthDatabase(db) : createInMemoryOAuthDatabase();
if (!db) console.log('No CLOUD_SQL_INSTANCE or DATABASE_URL configured. Running auth with in-memory store.');

let expenses: ReturnType<typeof createExpensesApp> | undefined;
if (db && apiKey) {
  expenses = createExpensesApp(db, apiKey);
} else {
  console.warn(`Expense API disabled: set ${[!db && 'CLOUD_SQL_INSTANCE or DATABASE_URL', !apiKey && 'API_KEY'].filter(Boolean).join(' and ')} to enable /api routes.`);
}

const app = createServer({
  auth: createAuthApp(authDb, {
    jwtSecret,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `${clientOrigin}/auth/callback`,
    clientOrigin,
  }),
  expenses,
});

const server = app.listen(port, hostname, (err?: Error) => {
  if (err) throw err;
  console.log(`Ghoomates backend listening at http://${hostname}:${port}`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Shutting down Ghoomates backend...');
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await authDb.terminate();
  await db?.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
