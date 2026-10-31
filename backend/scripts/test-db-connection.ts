import { openDatabase } from '../src/db.ts';
import { loadEnv } from '../src/env.ts';

loadEnv();
console.log(`Connecting to ${process.env.CLOUD_SQL_INSTANCE ? `Cloud SQL instance ${process.env.CLOUD_SQL_INSTANCE}` : 'DATABASE_URL'}...`);

const db = await openDatabase();
try {
  const { rows: [info] } = await db.pool.query('SELECT current_database() AS database, current_user AS user, version() AS version');
  console.log('Connected:', info);
  const { rows } = await db.pool.query(`SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY relname`);
  console.table(rows);
  console.log('Connection verified successfully!');
} finally {
  await db.close();
}
