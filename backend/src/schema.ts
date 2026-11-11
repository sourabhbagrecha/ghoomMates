import type { Db, IndexDescription } from 'mongodb';

// MongoDB collections and their indexes; this replaces the old SQL migrations. ensureIndexes runs on every startup
// and only creates what is missing, so a new collection or index is one line here.
//
// Document shape: each collection is named after its old Postgres table and keeps the column names as fields.
// A single-column primary key `id` becomes `_id` (uuid and usr_ strings stay strings; ghoomate_messages gets an
// ObjectId). Tables with a composite primary key get an ObjectId `_id` plus a unique index on those columns.
// `date` columns stay 'YYYY-MM-DD' strings, timestamptz becomes Date, jsonb becomes an embedded value, and
// expense_shares is embedded in expenses as `shares: [{ position, member_id, amount_paise }]`.
// Foreign keys and ON DELETE cascades are enforced in code (see trips/itinerary.ts for stop deletes).
//
// face_photos and faces belong to the Python face services; cloud/faces/migrate.py creates their indexes,
// including the Atlas Vector Search index.
const unique = true;

export const INDEXES: Record<string, IndexDescription[]> = {
  users: [
    { key: { google_id: 1 }, unique },
    { key: { email: 1 }, unique },
    { key: { username: 1 }, unique },
  ],
  groups: [],
  group_members: [
    { key: { group_id: 1, position: 1 }, unique },
  ],
  expenses: [
    { key: { group_id: 1, sequence: 1 }, unique },
  ],
  settlements: [
    { key: { group_id: 1, sequence: 1 }, unique },
  ],
  idempotency_keys: [],
  trips: [
    { key: { invite_code: 1 }, unique },
    { key: { expense_group_id: 1 }, unique },
  ],
  trip_members: [
    { key: { trip_id: 1, user_id: 1 }, unique },
    { key: { user_id: 1 } },
    { key: { ledger_member_id: 1 }, unique },
  ],
  trip_photos: [
    { key: { object_key: 1 }, unique },
    { key: { trip_id: 1, created_at: -1 } },
  ],
  trip_stops: [
    { key: { trip_id: 1, day_number: 1, minutes: 1 } },
  ],
  trip_stop_rsvps: [
    { key: { stop_id: 1, user_id: 1 }, unique },
  ],
  ghoomate_messages: [
    { key: { trip_id: 1, user_id: 1, _id: -1 } },
  ],
  maker_bookings: [
    { key: { trip_id: 1, workshop_date: 1 } },
    { key: { maker_id: 1, workshop_date: 1, slot: 1 }, partialFilterExpression: { status: 'confirmed' } },
  ],
  // One counter per maker workshop slot: { _id: `${maker_id}:${workshop_date}:${slot}`, people }
  maker_slots: [],
  story_cache: [
    { key: { site_id: 1, lang: 1, audience: 1, vibe_bucket: 1 }, unique },
  ],
  story_narrations: [
    { key: { site_id: 1, lang: 1, audience: 1, vibe_bucket: 1, text_hash: 1 }, unique },
  ],
  heritage_stamps: [
    { key: { user_id: 1, site_id: 1 }, unique },
    { key: { site_id: 1 } },
  ],
  impact_legs: [
    { key: { trip_id: 1, from_stop_id: 1, to_stop_id: 1 }, unique },
    { key: { from_stop_id: 1 } },
    { key: { to_stop_id: 1 } },
  ],
  impact_pledges: [
    { key: { trip_id: 1, user_id: 1, pledge_id: 1 }, unique },
  ],
  // _id is the cache key
  impact_cache: [],
  heritage_advisories: [
    { key: { city: 1, advisory_date: 1 } },
  ],
  hospitality_reservations: [
    { key: { trip_id: 1, host_id: 1, meal_date: 1, meal: 1 }, unique },
    { key: { host_id: 1, meal_date: 1 } },
  ],
  hospitality_waste_logs: [
    { key: { host_id: 1, log_date: 1 }, unique },
  ],
  trip_artworks: [
    { key: { object_key: 1 }, unique },
    { key: { trip_id: 1, created_at: -1 } },
  ],
  trip_reels: [
    { key: { trip_id: 1, created_at: -1 } },
  ],
  // embedding is a plain array of 512 numbers
  user_face_embeddings: [
    { key: { user_id: 1, selfie_hash: 1 }, unique },
  ],
};

export async function ensureIndexes(db: Db) {
  const existing = new Set(await db.listCollections({}, { nameOnly: true }).map(c => c.name).toArray());
  await Promise.all(Object.entries(INDEXES).map(async ([name, indexes]) => {
    // Create collections up front: a multi-document transaction cannot create one on its first insert.
    if (!existing.has(name)) await db.createCollection(name).catch(() => {});
    if (indexes.length > 0) await db.collection(name).createIndexes(indexes);
  }));
}
