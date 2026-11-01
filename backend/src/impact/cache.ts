// A small key → JSON cache in Postgres (impact_cache), for answers that never change: what Gemini made of an expense
// description, how a swap was phrased, how far Google Routes says two points are apart.

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }`. */
export type ImpactDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }> };
};

export type ImpactCache = {
  get(keys: string[]): Promise<Map<string, unknown>>;
  put(entries: [string, unknown][]): Promise<void>;
};

export function dbCache(db: ImpactDb): ImpactCache {
  return {
    async get(keys) {
      if (!keys.length) return new Map();
      const { rows } = await db.pool.query('SELECT key, value FROM impact_cache WHERE key = ANY($1::text[])', [keys]);
      return new Map((rows as { key: string; value: unknown }[]).map(r => [r.key, r.value]));
    },
    async put(entries) {
      if (!entries.length) return;
      await db.pool.query(
        `INSERT INTO impact_cache (key, value)
         SELECT k, v::jsonb FROM unnest($1::text[], $2::text[]) AS t (k, v)
         ON CONFLICT (key) DO NOTHING`,
        [entries.map(([key]) => key), entries.map(([, value]) => JSON.stringify(value))],
      );
    },
  };
}

/** A cache that remembers nothing, for when the database can't be reached */
export const noCache: ImpactCache = { get: async () => new Map(), put: async () => {} };
