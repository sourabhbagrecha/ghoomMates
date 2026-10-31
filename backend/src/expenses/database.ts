import { MongoClient, type Db } from 'mongodb';
import { loadEnv } from '../env.ts';

export interface Database {
  client: MongoClient;
  db: Db;
  terminate(): Promise<void>;
}

// Wrap an already-connected client, ensuring the indexes the expense ledger relies on.
export async function attachDatabase(client: MongoClient, db: Db): Promise<Database> {
  // Ensure necessary indexes exist for fast lookups & sequential history queries
  try {
    await Promise.all([
      db.collection('groups').createIndex({ id: 1 }, { unique: true }),
      db.collection('expenses').createIndex({ groupId: 1, sequence: -1 }),
      db.collection('settlements').createIndex({ groupId: 1, sequence: -1 }),
    ]);
  } catch (err) {
    console.warn('Notice: index creation check:', err instanceof Error ? err.message : err);
  }

  return {
    client,
    db,
    async terminate() {
      await client.close();
    },
  };
}

export async function openDatabase(
  uri = process.env.MONGODB_URI,
  dbName = process.env.DATABASE_NAME || 'splitwise'
): Promise<Database> {
  if (!uri) {
    loadEnv();
    uri = process.env.MONGODB_URI;
  }
  if (!uri) {
    throw new Error('Set MONGODB_URI in your environment or .env file to your Google Cloud Firestore MongoDB connection string');
  }

  const client = new MongoClient(uri);
  await client.connect();
  return attachDatabase(client, client.db(dbName));
}
