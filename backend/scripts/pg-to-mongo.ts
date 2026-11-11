// One-off copy of the Cloud SQL Postgres database into MongoDB, following the document shapes in src/schema.ts.
// Re-runnable: every document is upserted, so a second run copies whatever changed since the first (the delta at
// cutover). A re-run replaces a copied document with its Postgres version, so run the delta right after the cutover.
//
//   PG_SOURCE_URL=postgres://user:pass@host:5432/ghoomates?sslmode=no-verify \
//   MONGODB_CONNECTION_STRING=mongodb+srv://... node scripts/pg-to-mongo.ts [--dry-run]
//
// --dry-run reads and maps every row and prints the counts; nothing is written. MONGODB_DB defaults to ghoomates.
import pg from 'pg';
import { Binary, Long, MongoClient, ObjectId, type AnyBulkWriteOperation, type Db, type Document } from 'mongodb';
import { loadEnv } from '../src/env.ts';
import { ensureIndexes } from '../src/schema.ts';

loadEnv();
const dryRun = process.argv.includes('--dry-run');
const BATCH = 500;

type Row = Record<string, any>;
interface Mapped { filter: Document; doc: Document }
interface Result { table: string; pgRows: number | string; collection: string; note?: string }

// int8 (amounts, sequences, GCS generations) and numeric fit in a double; date columns stay 'YYYY-MM-DD' strings.
const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === pg.types.builtins.INT8 || oid === pg.types.builtins.NUMERIC ? Number
      : oid === pg.types.builtins.DATE ? (value: string) => value
      : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
};

// node-postgres style sslmode=no-verify: encrypt without checking the server certificate.
function sourcePool(source: string) {
  const url = new URL(source);
  const noVerify = url.searchParams.get('sslmode') === 'no-verify';
  if (noVerify) url.searchParams.delete('sslmode');
  return new pg.Pool({ connectionString: url.toString(), ...(noVerify ? { ssl: { rejectUnauthorized: false } } : {}), types, max: 2 });
}

const source = process.env.PG_SOURCE_URL;
if (!source) throw new Error('Set PG_SOURCE_URL to the Postgres database to copy from');
const target = process.env.MONGODB_CONNECTION_STRING;
if (!target && !dryRun) throw new Error('Set MONGODB_CONNECTION_STRING to the MongoDB cluster to copy into');

const pool = sourcePool(source);
const client = target ? new MongoClient(target, { appName: 'ghoommates-pg-to-mongo', serverSelectionTimeoutMS: 15_000 }) : undefined;
const db: Db | undefined = client?.db(process.env.MONGODB_DB || 'ghoomates');

const { rows: tableRows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`);
const sourceTables = new Set<string>(tableRows.map(r => r.table_name));
const results: Result[] = [];
let failed = false;

const select = async (sql: string) => (await pool.query(sql)).rows as Row[];
const omit = (row: Row, ...keys: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map(k => [k, row[k]]));

// Upserts the mapped documents in batches: replaceOne keeps an existing _id and lets Mongo assign one otherwise.
async function write(collection: string, mapped: Mapped[]) {
  if (dryRun || !db) return;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const ops: AnyBulkWriteOperation[] = mapped.slice(i, i + BATCH)
      .map(({ filter, doc }) => ({ replaceOne: { filter, replacement: doc, upsert: true } }));
    try {
      await db.collection(collection).bulkWrite(ops, { ordered: false });
    } catch (err: any) {
      failed = true;
      const errors = err.writeErrors ?? [err];
      console.error(`  ${collection}: ${errors.length} write error(s) in batch at row ${i}, first: ${errors[0]?.errmsg ?? errors[0]?.message}`);
    }
  }
}

// Existing ObjectIds by a key, so re-runs update the same documents instead of adding new ones.
async function idsBy(collection: string, keyOf: (doc: Document) => string, projection: Document) {
  const ids = new Map<string, ObjectId>();
  if (!db) return ids;
  for await (const doc of db.collection(collection).find({}, { projection })) ids.set(keyOf(doc), doc._id);
  return ids;
}

async function copy(table: string, map: (rows: Row[]) => Promise<Mapped[]> | Mapped[], query = `SELECT * FROM ${table}`, collection = table) {
  if (!sourceTables.has(table)) {
    results.push({ table, pgRows: 'missing', collection, note: 'not in the source database, skipped' });
    return;
  }
  const rows = await select(query);
  const mapped = await map(rows);
  await write(collection, mapped);
  results.push({ table, pgRows: rows.length, collection });
}

const byId = (rows: Row[]) => rows.map(row => ({ filter: { _id: row.id }, doc: { _id: row.id, ...omit(row, 'id') } }));
const byKey = (keys: string[]) => (rows: Row[]) => rows.map(row => ({ filter: pick(row, keys), doc: row }));

// A dry run still reads Mongo (existing ids, current counts), which also checks the connection.
await client?.connect();
if (db && !dryRun) await ensureIndexes(db);

for (const table of ['users', 'groups', 'group_members', 'settlements', 'idempotency_keys', 'trips', 'trip_photos', 'trip_stops',
  'maker_bookings', 'heritage_advisories', 'hospitality_reservations', 'trip_artworks', 'trip_reels']) {
  await copy(table, byId);
}

// expense_shares is embedded in each expense, in position order.
await copy('expenses', async (rows) => {
  const shares = new Map<string, Row[]>();
  if (sourceTables.has('expense_shares')) {
    for (const s of await select('SELECT expense_id, position, member_id, amount_paise FROM expense_shares ORDER BY expense_id, position')) {
      if (!shares.has(s.expense_id)) shares.set(s.expense_id, []);
      shares.get(s.expense_id)!.push({ position: s.position, member_id: s.member_id, amount_paise: s.amount_paise });
    }
  }
  return byId(rows.map(row => ({ ...row, shares: shares.get(row.id) ?? [] })));
});
if (sourceTables.has('expense_shares')) {
  const [{ count }] = await select('SELECT count(*)::int AS count FROM expense_shares');
  results.push({ table: 'expense_shares', pgRows: count, collection: 'expenses', note: 'embedded as expenses.shares' });
}

const composite: [string, string[]][] = [
  ['trip_members', ['trip_id', 'user_id']],
  ['trip_stop_rsvps', ['stop_id', 'user_id']],
  ['story_cache', ['site_id', 'lang', 'audience', 'vibe_bucket']],
  ['story_narrations', ['site_id', 'lang', 'audience', 'vibe_bucket', 'text_hash']],
  ['heritage_stamps', ['user_id', 'site_id']],
  ['impact_legs', ['trip_id', 'from_stop_id', 'to_stop_id']],
  ['impact_pledges', ['trip_id', 'user_id', 'pledge_id']],
  ['hospitality_waste_logs', ['host_id', 'log_date']],
  ['user_face_embeddings', ['user_id', 'selfie_hash']], // real[] arrives as number[]
];
for (const [table, keys] of composite) await copy(table, byKey(keys));

// The cache key becomes _id.
await copy('impact_cache', rows => rows.map(row => ({ filter: { _id: row.key }, doc: { _id: row.key, value: row.value, created_at: row.created_at } })));

// bigserial ids become ObjectIds built from created_at seconds + the old id: the same id on every run, and _id order is
// still message order, including against messages written natively on Mongo after the cutover.
function messageId(row: Row) {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32BE(Math.floor(row.created_at.getTime() / 1000));
  bytes.writeBigUInt64BE(BigInt(row.id), 4);
  return new ObjectId(bytes);
}
await copy('ghoomate_messages', rows => rows.map(row => {
  const _id = messageId(row);
  return { filter: { _id }, doc: { _id, ...omit(row, 'id'), legacy_id: row.id } };
}), 'SELECT * FROM ghoomate_messages ORDER BY id');

// Face index: photos keyed by (bucket, object_name); faces point at the photo's ObjectId and carry its fields.
const photoIds = new Map<number, ObjectId>();
const photos = new Map<number, Row>();
await copy('face_photos', async (rows) => {
  const ids = await idsBy('face_photos', d => `${d.bucket}/${d.object_name}`, { bucket: 1, object_name: 1 });
  return rows.map(row => {
    const _id = ids.get(`${row.bucket}/${row.object_name}`) ?? new ObjectId();
    photoIds.set(row.id, _id);
    photos.set(row.id, row);
    // GCS generations stay Int64, as the Python indexer writes them
    return { filter: { _id }, doc: { _id, ...omit(row, 'id'), generation: Long.fromNumber(row.generation) } };
  });
}, 'SELECT * FROM face_photos ORDER BY id');

// A photo re-indexed on Mongo since the last run got new faces without legacy_id. The photo was just reset to its
// Postgres version, so its faces go back to the Postgres ones too.
if (db && !dryRun && photoIds.size > 0) {
  await db.collection('faces').deleteMany({ photo_id: { $in: [...photoIds.values()] }, legacy_id: { $exists: false } });
}

await copy('faces', async (rows) => {
  const ids = await idsBy('faces', d => String(d.legacy_id), { legacy_id: 1 });
  return rows.map(row => {
    const _id = ids.get(String(row.id)) ?? new ObjectId();
    const photo = photos.get(row.photo_id)!;
    const embedding = Binary.fromFloat32Array(new Float32Array(JSON.parse(row.embedding)));
    return {
      filter: { _id },
      doc: {
        _id, ...omit(row, 'id', 'photo_id', 'embedding'), photo_id: photoIds.get(row.photo_id), embedding,
        bucket: photo.bucket, object_name: photo.object_name, generation: Long.fromNumber(photo.generation), width: photo.width, height: photo.height,
        legacy_id: row.id,
      },
    };
  });
}, `SELECT id, photo_id, trip_id, x, y, w, h, det_confidence, embedding::text AS embedding, model_name, detector, created_at FROM faces ORDER BY id`);

// maker_slots counters are rebuilt from the confirmed bookings now in Mongo (copied plus any booked there since);
// a slot with no confirmed booking left goes back to 0.
if (sourceTables.has('maker_bookings')) {
  const [{ count }] = await select(`SELECT count(DISTINCT (maker_id, workshop_date, slot))::int AS count FROM maker_bookings WHERE status = 'confirmed'`);
  if (db && !dryRun) {
    const slots = db.collection<{ _id: string; people: number }>('maker_slots');
    const people = new Map<string, number>();
    for await (const b of db.collection('maker_bookings').find({ status: 'confirmed' }, { projection: { maker_id: 1, workshop_date: 1, slot: 1, people: 1 } })) {
      const key = `${b.maker_id}:${b.workshop_date}:${b.slot}`;
      people.set(key, (people.get(key) ?? 0) + b.people);
    }
    for await (const s of slots.find({}, { projection: { _id: 1 } })) if (!people.has(s._id)) people.set(s._id, 0);
    await write('maker_slots', [...people].map(([_id, n]) => ({ filter: { _id }, doc: { _id, people: n } })));
  }
  results.push({ table: 'maker_slots', pgRows: count, collection: 'maker_slots', note: 'rebuilt from confirmed maker_bookings' });
}

const copied = new Set([...results.map(r => r.table), 'schema_migrations', 'face_schema_migrations']);
for (const table of sourceTables) {
  if (!copied.has(table)) results.push({ table, pgRows: '?', collection: '-', note: 'unknown table, not copied' });
}

const report = [];
for (const r of results) {
  let mongo: number | string = '-';
  if (db && r.collection !== '-') mongo = await db.collection(r.collection).countDocuments();
  report.push({ table: r.table, 'pg rows': r.pgRows, collection: r.collection, 'mongo docs': mongo, note: r.note ?? '' });
}
console.log(dryRun ? 'DRY RUN: nothing was written. Mongo counts are the current ones.' : `Copied into ${db!.databaseName}.`);
console.table(report);

await pool.end();
await client?.close();
if (failed) {
  console.error('Some documents were not written (see the errors above).');
  process.exitCode = 1;
}
