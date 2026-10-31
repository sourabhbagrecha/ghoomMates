import { MongoClient } from 'mongodb';
import { createServer } from './app.ts';
import { loadEnv } from './env.ts';
import { createApp as createAuthApp } from './auth/app.ts';
import { attachOAuthDatabase, createInMemoryOAuthDatabase } from './auth/database.ts';
import { createApp as createExpensesApp } from './expenses/app.ts';
import { attachDatabase } from './expenses/database.ts';

loadEnv();

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const hostname = process.env.HOST ?? '127.0.0.1';

const jwtSecret = process.env.JWT_SECRET || 'ghoomates-oauth-jwt-secret-key-32chars-min-dev-2026';
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in .env');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const apiKey = process.env.API_KEY ?? '';
if (apiKey && apiKey.length < 32) throw new Error('Set API_KEY to a secret of at least 32 characters in .env');

// One shared connection for every module. Without MONGODB_URI, auth runs on an in-memory store
// and the expense API is disabled, since its ledger requires transactions.
const mongoUri = process.env.MONGODB_URI;
const mongo = mongoUri ? new MongoClient(mongoUri) : undefined;
if (mongo) await mongo.connect();
const db = mongo?.db(process.env.DATABASE_NAME || 'splitwise');

const authDb = mongo && db ? await attachOAuthDatabase(mongo, db) : createInMemoryOAuthDatabase();
if (!mongo) console.log('No MONGODB_URI configured. Running auth with in-memory store.');

let expenses: ReturnType<typeof createExpensesApp> | undefined;
if (mongo && db && apiKey) {
  expenses = createExpensesApp(await attachDatabase(mongo, db), apiKey);
} else {
  console.warn(`Expense API disabled: set ${[!mongo && 'MONGODB_URI', !apiKey && 'API_KEY'].filter(Boolean).join(' and ')} to enable /api routes.`);
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
  await mongo?.close();
  await authDb.terminate();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
