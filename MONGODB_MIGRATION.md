# Database migration: Cloud SQL Postgres → MongoDB Atlas

GhoomMates moved its database from Cloud SQL Postgres (with pgvector) to MongoDB Atlas (with Atlas Vector Search) in November 2026. This page records why, what changed, the tradeoffs we accepted, and what we measured.

**Status (2026-11-11): live.** Production runs on Atlas (web revision `ghoommates-00020-lxl`, face services `face-indexer-00002` and `face-search-00005`). Every Cloud SQL row was copied, and a second copy right after the release found nothing new. See [Cutover](#cutover) for what was done and how to roll back.

## Why

- The Cloud SQL instance `ghoomates` was a 30-day free trial (Enterprise Plus, `db-perf-optimized-N-8`, 8 vCPU). It stops serving around **2026-11-30**. Keeping it would cost about $19/day, and actual use was ~190 MB of data at ~1% CPU.
- We weighed two options:
  - a small Postgres (a shrunk Cloud SQL instance or Neon): no code changes, about $0–25/month;
  - MongoDB Atlas on the free **M0** tier: $0, but every module's data layer had to be rewritten.
- We chose Atlas M0 and accepted the rewrite, plus the tradeoffs listed below.

## What changed

| Area | Before | After |
|---|---|---|
| Database | Cloud SQL Postgres 18 (asia-south1) | Atlas M0, MongoDB 8.0, GCP asia-south1 |
| Connection | `CLOUD_SQL_INSTANCE` + `DB_USER/DB_PASSWORD/DB_NAME`, or `DATABASE_URL` | `MONGODB_CONNECTION_STRING` (+ `MONGODB_DB`, default `ghoomates`) |
| Schema | SQL migrations in `backend/migrations/`, run on startup | Collections and indexes declared in `backend/src/schema.ts`, created on startup |
| Face vectors | pgvector `vector(512)` + HNSW index | BSON float32 vectors + Atlas Vector Search index `faces_embedding` (cloud/faces/migrate.py) |
| Backend driver | `pg` | official `mongodb` driver (no ODM) |
| Face services driver | `psycopg` | `pymongo` |
| Backend tests | fake pools string-matching SQL; real-DB tests outside `npm test` | real in-process MongoDB (`backend/tests/mongo.ts`, `mongodb-memory-server`); all in `npm test` |
| Deploy secrets | `DB_PASSWORD` in Secret Manager | `MONGODB_CONNECTION_STRING` in Secret Manager (`ghoommates-mongodb-connection-string`) |

### Data-model decisions

- **Collections mirror the old tables.** Field names keep the SQL column names. A single-column `id` becomes `_id`, and uuid and `usr_` ids stay strings, so URLs and API responses didn't change.
- **Composite primary keys** get an ObjectId `_id` plus a unique compound index.
- **Field types:**
  - `date` columns stay `'YYYY-MM-DD'` strings;
  - `timestamptz` becomes `Date`;
  - `jsonb` becomes embedded documents;
  - `numeric` becomes a number.
- **`expense_shares` is embedded in each expense** as `shares: [{ position, member_id, amount_paise }]`.
- **There are no foreign keys.** Cascades the code depended on are done explicitly. `deleteStopsCascade` in `trips/itinerary.ts` deletes the RSVPs and impact legs, and unsets `stop_id` on maker bookings and hospitality reservations.
- **Face documents carry their photo's fields** (`bucket`, `object_name`, `generation`, `width`, `height`), so search needs no join.

### Concurrency decisions (replacing Postgres locks)

| Need | Postgres | MongoDB |
|---|---|---|
| Multi-row writes | `BEGIN/COMMIT`, retry on 40001/40P01 | `transaction()` in `src/db.ts` (`session.withTransaction`; the driver retries write conflicts) |
| Serialize ledger writes per group | `SELECT … FOR UPDATE` on `groups` | `$inc` on `groups.sequence` inside the transaction, so concurrent writers write-conflict and retry |
| Idempotent expense requests | `pg_advisory_xact_lock` | `idempotency_keys` doc read and written in the transaction; one full retry on duplicate key |
| Maker slot capacity | advisory lock + `SUM` | `maker_slots` counter doc, `$inc` in a transaction, abort over capacity |
| Serialize joins by invite | `FOR UPDATE` on `trips` | `$inc` on `trips.version` inside the transaction |
| Face photo generation guard | `ON CONFLICT … WHERE generation <= EXCLUDED.generation` | `find_one_and_update` with `{generation: {$lte}}` + upsert; DuplicateKey means the event is stale |

## Tradeoffs we accepted

- **Throughput ceiling.** M0 is shared and throttled to about 100 operations/second. At hackathon scale that's enough; a demo-day burst is not (see the benchmark). Atlas Flex (roughly $8–30/month) or M10 raise it.
- **Faces aren't searchable immediately.** Atlas Vector Search indexes asynchronously, so a newly indexed face takes about 9 s to show up in "find me". With pgvector it was visible as soon as the transaction committed.
- **Off GCP.** Atlas is a separate vendor. There's no IAM auth: the connection string is the credential, and the Atlas IP access list must be `0.0.0.0/0` because Cloud Run has no fixed egress IP.
- **No backups on M0.**
- **Integrity moved into code.** There are no foreign keys or CHECK constraints, so cascades and invariants live in the services.
- **Preference keys.** User preference keys that MongoDB can't use as a field path (containing `.` or starting with `$`) are dropped. The frontend never sends them.

## Benchmark results

**Setup:**
- Run on 2026-11-11 by three purpose-built suites against scratch databases on both live targets: the Cloud SQL trial instance and the Atlas M0 cluster, both in Mumbai.
- The Postgres side ran the pre-migration code; the Mongo side ran the ported code.
- Same seeded data and seed on both sides. One run per suite, from a laptop about 30 ms from either database.
- **"In-region"** is an estimate of what Cloud Run (~1 ms away) would see: p50 minus serial round trips × (RTT − 1 ms).
- The Cloud SQL side is the 8-vCPU trial machine. Server-side query times were under 1 ms, so a small instance should match its latency at this data size but not its throughput.

### Per-request latency (application code, p50)

| Operation | Round trips (pg → mongo) | In-region estimate (pg → mongo) |
|---|---|---|
| Trip detail | 2 → 5 | 5 → 10 ms |
| Expenses summary | 7 → 7 | 10 → 10 ms |
| Itinerary | 4 → 6 | 14 → 15 ms |
| Add expense (idempotent) | 13 → 11 | 98 → 104 ms |
| Replay same idempotency key | 6 → 5 | 16 → 18 ms |
| Create trip | 8 → 10 | 81 → 96 ms |
| Join trip | 11 → 12 | 91 → 106 ms |
| Add stop / RSVP | 5 → 5 / 3 → 4 | 10 → 14 / 6 → 16 ms |
| **List my trips** | **7 → 24** | **10 → 34 ms** |
| **Delete stop (cascade)** | **3 → 9** | **7 → 109 ms** |
| **Replace itinerary** | **9 → 15** | **86 → 152 ms** |

Simple operations each took about one round trip on both sides, and server time was under 1 ms. Mongo writes are a little slower because Atlas waits for a majority of the replica set to acknowledge (`w: majority`, 3 nodes). The three **bold** rows are regressions in the port (one query per trip, and cascade steps run one after another) and can be fixed.

### Throughput and contention

| Measure | Cloud SQL | Atlas M0 |
|---|---|---|
| Point reads, 50 parallel workers | 1,797 ops/s (p50 20 ms), still climbing | flat at ~100–108 ops/s from 5 workers up; p50 156 ms, p95 ~1 s at 50 |
| Inserts, 50 parallel workers | 1,266 ops/s | ~106 ops/s |
| 10 concurrent expenses, same trip | 3.7 ops/s, 0 retries | 2.1 ops/s, 566 write-conflict retries |
| 10 concurrent expenses, different trips | 22 ops/s | 8 ops/s (at the M0 cap) |

M0 throttles by queueing, not by returning errors. One "list my trips" load costs 24 operations, so about 4 simultaneous loads fill the cluster. The ledger balances stayed consistent on both sides in every concurrency test.

### Face search (~25k faces, 60 trips, real query code)

| Measure | pgvector | Atlas Vector Search |
|---|---|---|
| Recall vs exact search / cross-trip false positives | 1.0 / 0 | 1.0 / 0 |
| Selfie search, few matches (laptop p50) | 253 ms (6 round trips) | 132 ms (2 round trips) |
| Selfie search, ~1,000 matches (laptop p50) | 592 ms (server 31 ms) | 914 ms (server 70 ms) |
| Ingest, 8 photos in parallel | 42 photos/s | 25 photos/s (M0 cap) |
| New face searchable after commit | immediately | ~9 s (p95 10.4 s) |
| Index build | 8 s | 55 s until queryable |
| Storage | 139 MB (HNSW 65 MB) | 64 MB (search index size not reported) |

At this scale Postgres never used the HNSW index: the planner filtered by trip and ranked exactly.

### Cold connection (new process → first query)

| Path | p50 |
|---|---|
| Postgres, direct TLS | 0.32 s |
| Postgres via Cloud SQL connector (what production used; laptop includes ~1.3 s fetching credentials) | 1.78 s |
| MongoDB `mongodb+srv` (DNS SRV + TLS + auth) | 0.54 s |

## Known follow-ups

1. **Fix the three round-trip regressions:**
   - `TripService.list` should batch per-trip queries with `$in`;
   - `deleteStopsCascade` should run fewer sequential steps;
   - `ItineraryService.replace` needs the same treatment.
2. **Before any traffic spike,** move off M0 to Flex or M10 (the ~100 ops/s ceiling).
3. **Face search UX:** show "indexing…" for about 10 s after upload, since Atlas Vector Search lags.
4. **Copy-script edge case:** the `maker_slots` rebuild races with concurrent bookings; run it while writes are stopped.
5. **Vector index changes:** `cloud/faces/migrate.py` doesn't update an existing vector index whose definition changed. Drop and recreate it by hand.
6. **Vector search untested in CI:** it's covered only by `cloud/tests` with `TEST_MONGODB_CONNECTION_STRING` against `mongodb/mongodb-atlas-local`.

## Cutover

The general steps are in [backend/docs/deploy.md](backend/docs/deploy.md). CI's `release` only swaps the image; secrets come from Secret Manager. On 2026-11-11 the cutover went like this, changing only the database settings in production:

1. Ran `cloud/faces/migrate.py` against Atlas `ghoomates` to create the face indexes and the `faces_embedding` vector index.
2. Ran `backend/scripts/pg-to-mongo.ts`: 1,353 rows from 28 tables, with counts matching for every table.
3. Ran `cloud/deploy.sh build indexer search` to deploy the face services on Atlas (min instances 0, as before).
4. Created the Secret Manager secret `ghoommates-mongodb-connection-string`, gave `ghoommates-web` access to it, and added it to the web service with `gcloud run services update --update-secrets` while the old image was still running.
5. Pushed `main`. CI built and released image `0d7fe54`, and it logged `MongoDB connection & indexes ready`.
6. Re-ran the copy for anything written in between; there was nothing new.

The Atlas connection string is also stored as the GitHub Actions secret `MONGODB_CONNECTION_STRING`. No workflow reads it yet.

**Rollback (until the Cloud SQL trial ends on ~2026-11-30):** the old Cloud SQL settings are still on the web service, so `gcloud run services update-traffic ghoommates --to-revisions=ghoommates-00019-49p=100 --region=asia-south1` returns to Postgres. Anything written to Atlas after the cutover would not be in Postgres.

**Later:** remove `CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_NAME` and the `DB_PASSWORD` secret from the web service. A full `deploy/cloudrun.sh` does this. Then delete the Cloud SQL instance and the `ghoommates-db-password` secret.
