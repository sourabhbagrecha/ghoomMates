import { MongoClient, type Db } from 'mongodb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Database {
  client: MongoClient;
  db: Db;
  terminate(): Promise<void>;
}

function loadEnvIfPresent() {
  try {
    const envPath = resolve(import.meta.dirname, '../.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...vals] = trimmed.split('=');
      if (key && vals.length > 0 && !process.env[key]) {
        process.env[key] = vals.join('=').replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}

export async function openDatabase(
  uri = process.env.MONGODB_URI,
  dbName = process.env.DATABASE_NAME || 'splitwise'
): Promise<Database> {
  if (!uri) {
    loadEnvIfPresent();
    uri = process.env.MONGODB_URI;
  }
  if (!uri) {
    throw new Error('Set MONGODB_URI in your environment or .env file to your Google Cloud Firestore MongoDB connection string');
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

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
