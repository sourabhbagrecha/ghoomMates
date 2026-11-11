import { openDatabase } from '../src/db.ts';
import { loadEnv } from '../src/env.ts';

loadEnv();
console.log('Connecting to MONGODB_CONNECTION_STRING...');

const db = await openDatabase();
try {
  const { version } = await db.db.admin().command({ buildInfo: 1 });
  console.log('Connected:', { database: db.db.databaseName, version });
  const names = (await db.db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).sort();
  const rows = await Promise.all(names.map(async collection => ({ collection, docs: await db.db.collection(collection).estimatedDocumentCount() })));
  console.table(rows);
  console.log('Connection verified successfully!');
} finally {
  await db.close();
}
