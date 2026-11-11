import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Database } from '../src/db.ts';
import { ensureIndexes } from '../src/schema.ts';

// A real in-process MongoDB (single-node replica set, so transactions work) shared by every test in this file.
// TEST_MONGODB_CONNECTION_STRING points tests at an existing server instead. Each call gets its own empty
// database with all indexes, so tests never see each other's data.
let server: Promise<{ client: MongoClient; stop: () => Promise<void> }> | undefined;

function start() {
  server ??= (async () => {
    const external = process.env.TEST_MONGODB_CONNECTION_STRING;
    const replSet = external ? undefined : await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    const client = await MongoClient.connect(external ?? replSet!.getUri());
    return { client, stop: async () => { await client.close(); await replSet?.stop(); } };
  })();
  return server;
}

after(async () => {
  if (server) await (await server).stop();
});

export async function testDatabase(): Promise<Database> {
  const { client } = await start();
  const db = client.db(`test_${randomUUID().replaceAll('-', '')}`);
  await ensureIndexes(db);
  // A file-level after() may run once the shared server is already stopped; its data went with it then.
  return { client, db, close: () => db.dropDatabase().then(() => {}, () => {}) };
}
