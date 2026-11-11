import { MongoClient, MongoServerError, type ClientSession, type Db } from 'mongodb';
import { logger } from './logger.ts';
import { ensureIndexes } from './schema.ts';

export type { ClientSession, Db };

// One MongoDB Atlas database shared by every module (and by the Python face services in cloud/).
export interface Database {
  client: MongoClient;
  db: Db;
  close(): Promise<void>;
}

export function isDatabaseConfigured(env = process.env) {
  return Boolean(env.MONGODB_CONNECTION_STRING);
}

// Commands that are connection housekeeping rather than application queries.
const QUIET_COMMANDS = new Set(['hello', 'isMaster', 'ping', 'saslStart', 'saslContinue', 'endSessions', 'buildInfo', 'createIndexes', 'listIndexes']);

// Connects to MONGODB_CONNECTION_STRING (database MONGODB_DB, default ghoomates) and creates any missing indexes.
export async function openDatabase(env = process.env): Promise<Database> {
  const uri = env.MONGODB_CONNECTION_STRING;
  if (!uri) throw new Error('Set MONGODB_CONNECTION_STRING in your environment or .env file');
  logger.info('DB', 'Connecting to MongoDB...');
  const client = new MongoClient(uri, {
    appName: 'ghoommates-backend',
    maxPoolSize: Number(env.DB_POOL_SIZE ?? 10),
    serverSelectionTimeoutMS: 15_000,
    monitorCommands: true,
  });

  // Log application commands to terminal
  client.on('commandSucceeded', (event) => {
    if (!QUIET_COMMANDS.has(event.commandName)) logger.debug('DB:CMD', `${event.commandName} (${event.duration}ms)`);
  });
  client.on('commandFailed', (event) => {
    logger.error('DB:CMD', `${event.commandName} failed (${event.duration}ms) -> ${event.failure.message}`);
  });

  try {
    await client.connect();
    const db = client.db(env.MONGODB_DB || 'ghoomates');
    await ensureIndexes(db);
    logger.info('DB', `MongoDB connection & indexes ready (${db.databaseName})`);
    return { client, db, close: () => client.close() };
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

// Runs fn in a multi-document transaction. Every operation inside must pass { session }. The driver retries
// the whole callback on transient errors (write conflicts), so fn must be safe to run more than once.
export async function transaction<T>(database: Pick<Database, 'client'>, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return database.client.withSession((session) => session.withTransaction(() => fn(session)));
}

// True for a unique-index violation (E11000 duplicate key).
export function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}
