import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env if present
try {
  const envPath = resolve(import.meta.dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length > 0 && !process.env[key]) {
      process.env[key] = vals.join('=').replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI not found in environment or .env');
  process.exit(1);
}

console.log('Connecting to Google Cloud Firestore via MongoDB protocol...');
console.log('Target host:', new URL(uri.replace(/^mongodb:\/\/[^@]+@/, 'mongodb://***:***@')).host);

const client = new MongoClient(uri);

async function testConnection() {
  try {
    await client.connect();
    console.log(' Connected to Firestore cluster successfully!');

    const dbName = process.env.DATABASE_NAME || 'splitwise';
    const db = client.db(dbName);

    // Ping test
    const pingResult = await db.command({ ping: 1 });
    console.log(' Ping response:', pingResult);

    // List collections
    const collections = await db.listCollections().toArray();
    console.log(` Found ${collections.length} collection(s) in database "${dbName}":`, collections.map(c => c.name));

    console.log(' Connection verified successfully!');
  } catch (err) {
    console.error(' Connection failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

testConnection();

