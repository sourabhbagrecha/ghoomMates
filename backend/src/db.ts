import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

export interface Database {
  pool: Pool;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../migrations');
const MIGRATION_LOCK = 7_253_610;

// int8 columns (balances, amounts, sequences) are kept within Number.MAX_SAFE_INTEGER by the services.
const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === pg.types.builtins.INT8 ? Number : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
};

export function isDatabaseConfigured(env = process.env) {
  return Boolean(env.CLOUD_SQL_INSTANCE || env.DATABASE_URL);
}

// Opens the shared Postgres pool and applies pending migrations.
// CLOUD_SQL_INSTANCE (project:region:instance) connects through the Cloud SQL Node.js Connector using
// Application Default Credentials; otherwise DATABASE_URL is used as a plain connection string.
export async function openDatabase(env = process.env): Promise<Database> {
  let connector: Connector | undefined;
  let config: pg.PoolConfig;
  if (env.CLOUD_SQL_INSTANCE) {
    connector = new Connector();
    const ipType = (env.CLOUD_SQL_IP_TYPE ?? 'PUBLIC').toUpperCase() as keyof typeof IpAddressTypes;
    if (!(ipType in IpAddressTypes)) throw new Error('CLOUD_SQL_IP_TYPE must be PUBLIC, PRIVATE, or PSC');
    config = {
      ...await connector.getOptions({ instanceConnectionName: env.CLOUD_SQL_INSTANCE, ipType: IpAddressTypes[ipType] }),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME || 'ghoomates',
    };
  } else if (env.DATABASE_URL) {
    config = { connectionString: env.DATABASE_URL };
  } else {
    throw new Error('Set CLOUD_SQL_INSTANCE (with DB_USER, DB_PASSWORD, DB_NAME) or DATABASE_URL in your environment or .env file');
  }

  const pool = new pg.Pool({ ...config, types, max: Number(env.DB_POOL_SIZE ?? 10) });
  pool.on('error', (err) => console.error('Idle database connection failed:', err.message));
  try {
    await migrate(pool);
  } catch (err) {
    await pool.end();
    connector?.close();
    throw err;
  }
  return {
    pool,
    async close() {
      await pool.end();
      connector?.close();
    },
  };
}

// Applies migrations/*.sql in filename order, each in its own transaction, once per database.
async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const name of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
      if (applied.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf-8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}

// Runs fn in a READ COMMITTED transaction, retrying deadlocks and serialization failures.
export async function transaction<T>(pool: Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      const result = await fn(tx);
      await tx.query('COMMIT');
      return result;
    } catch (err) {
      await tx.query('ROLLBACK').catch(() => {});
      const code = (err as { code?: string }).code;
      if (attempt < 3 && (code === '40001' || code === '40P01')) continue;
      throw err;
    } finally {
      tx.release();
    }
  }
}
