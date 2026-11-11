// A small key → JSON cache in MongoDB (impact_cache, _id = key), for answers that never change: what Gemini made of
// an expense description, how a swap was phrased, how far Google Routes says two points are apart.
import type { Database } from '../db.ts';

/** Only the Db handle is used */
export type ImpactDb = Pick<Database, 'db'>;

export type ImpactCache = {
  get(keys: string[]): Promise<Map<string, unknown>>;
  put(entries: [string, unknown][]): Promise<void>;
};

export function dbCache({ db }: ImpactDb): ImpactCache {
  const cache = db.collection<{ _id: string; value: unknown; created_at: Date }>('impact_cache');
  return {
    async get(keys) {
      if (!keys.length) return new Map();
      const docs = await cache.find({ _id: { $in: keys } }).toArray();
      return new Map(docs.map(d => [d._id, d.value]));
    },
    async put(entries) {
      if (!entries.length) return;
      const created_at = new Date();
      // First answer wins; the JSON round trip stores exactly what jsonb did (no undefined fields)
      await cache.bulkWrite(entries.map(([key, value]) => ({
        updateOne: { filter: { _id: key }, update: { $setOnInsert: { value: JSON.parse(JSON.stringify(value)), created_at } }, upsert: true },
      })), { ordered: false });
    },
  };
}

/** A cache that remembers nothing, for when the database can't be reached */
export const noCache: ImpactCache = { get: async () => new Map(), put: async () => {} };
