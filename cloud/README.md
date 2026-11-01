# Face indexing and selfie search (`cloud/`)

This folder contains two Cloud Run services that let a trip member find every trip photo they appear in. Both services are built from one Python container image.

| Service | Trigger | What it does |
| --- | --- | --- |
| `face-indexer` | Eventarc, on `google.cloud.storage.object.v1.finalized` and `.deleted` in bucket `ghoomates` | Downloads each new trip photo, detects faces, embeds them, and stores them in Cloud SQL (pgvector). When a photo is deleted, its faces are removed. |
| `face-search` | Private HTTPS, called by the backend with an ID token | Embeds the largest face in each of 1 to 3 selfies and returns the trip photos that contain that person, ranked by distance, with face boxes. |

The face pipeline must match the prototype notebook exactly: Pillow `exif_transpose`, conversion to RGB, a thumbnail at most 1600 px on its longest side, then `DeepFace.represent(model_name="Facenet512", detector_backend="retinaface", align=True, enforce_detection=True)`, followed by L2-normalization.

The search has to run here rather than in the backend. A selfie must be embedded with the same model and preprocessing as the gallery photos, and the Node backend cannot run DeepFace.

```text
browser ──PUT──> gs://ghoomates/trips/<tripId>/photos/<uuid>.jpg
                      │ object.v1.finalized / deleted
                      ▼
                 Eventarc ──> face-indexer ──> Cloud SQL: face_photos, faces (vector(512), HNSW)
                                                               ▲
backend ──ID token──> face-search  (selfies in memory only) ───┘
```

## Layout

```text
cloud/
  faces/config.py       every constant; each one can be overridden by an env var of the same name
  faces/pipeline.py     Pillow preprocessing, DeepFace call, face filtering, bbox scaling, L2-normalization
  faces/indexer.py      face-indexer Flask app (CloudEvent parsing, routing, idempotency, status codes)
  faces/search.py       face-search Flask app (request validation, selfie embedding)
  faces/store.py        all SQL: upsert/replace faces, generation-aware deletes, search query, grouping
  faces/db.py           connection pool (psycopg 3); accepts the backend's DATABASE_URL as is
  faces/storage.py      reads objects from GCS, or from a local folder in development
  faces/main.py         WSGI entry point; SERVICE=indexer|search picks the app; models load once at startup
  faces/migrate.py      applies migrations/*.sql, tracked in face_schema_migrations
  faces/warmup.py       Docker build step that downloads and loads both models into the image
  faces/backfill.py     indexes photos that were uploaded before the trigger existed
  faces/logs.py         JSON logs with a severity field for Cloud Logging
  migrations/001_faces.sql
  scripts/send_event.py      sends a fake GCS CloudEvent to the local indexer
  scripts/search_selfie.py   calls face-search with selfie files
  tests/                pytest: unit, database, and end-to-end integration tests
  Dockerfile            runtime stage (deployed) and test stage (local only)
  docker-compose.yml    pgvector Postgres, migrate, indexer, search, tests
  cloudbuild.yaml       Cloud Build config that builds the runtime stage
  deploy.sh             every deploy command, one step at a time
  requirements.txt      runtime dependencies, all pinned (Python 3.12)
  requirements-dev.txt  adds pytest on top of requirements.txt
  .env.example          DATABASE_URL template; the real value goes in cloud/.env (gitignored)
```

## How it fits the app

- **Scope is the trip.** The backend uploads photos to `trips/<tripId>/photos/<uuid>.<ext>` (`backend/src/trips/service.ts`). The indexer reads the trip id from that path, using the `INCLUDE_PATTERN` named group `scope`, and every search is limited to one trip.
- **Only trip photos are indexed.** An object is indexed only when all of the following hold. Otherwise it is acknowledged and ignored:
  - it matches `INCLUDE_PATTERN`
  - it is not under any of `SKIP_PREFIXES` (`users/,selfies/,thumbnails/,healthcheck/`)
  - its extension and its content type are both image types

  This keeps out receipts (`trips/<id>/receipts/`), the profile selfies the backend stores at `users/<id>/selfie.<ext>`, health checks, and anything a future pipeline might write. Nothing this service does writes to the bucket, so nothing can trigger itself in a loop.
- **Link to `trip_photos`.** `face_photos.object_name` equals `trip_photos.object_key`. There is no foreign key, because the browser uploads first and registers the photo afterwards (`POST /photos`), so the upload event usually arrives before the `trip_photos` row exists. The backend joins search results to `trip_photos` by object key (see "Calling from the backend").
- **Selfies** sent to `face-search` are decoded, embedded, and discarded in memory. They are never written to GCS, the database, or logs. The backend's existing selfie copies (`users.picture` and `users/<id>/selfie.*`) are left unchanged, as agreed, and are never indexed.

## Face pipeline

All values live in `faces/config.py`. Each can be overridden by an env var with the same name in upper case.

| Setting | Default | Notes |
| --- | --- | --- |
| `MODEL_NAME` / `DETECTOR_BACKEND` | `Facenet512` / `retinaface` | Stored on every face row and photo row. |
| `ALIGN` / `ENFORCE_DETECTION` | `true` / `true` | With enforcement on, DeepFace raises `ValueError` when it finds no face. The pipeline catches it and treats the photo as having no faces. |
| `MAX_IMAGE_SIDE` | `1600` | Pillow `thumbnail`, applied after `exif_transpose` and RGB conversion. pillow-heif is registered so HEIC and HEIF open. |
| `MIN_FACE_PX` | `40` | Applied to the face size in the downscaled image, which is the image the detector and the embedding model see. |
| `MIN_FACE_CONFIDENCE` | `0.90` | Uses DeepFace's `face_confidence`. |
| `MATCH_THRESHOLD` | `0.40` | Cosine distance. In the notebook the same person scored 0.16 to 0.34 and the closest stranger 0.80. |
| `EMBEDDING_DIM` | `512` | Embeddings are L2-normalized before storage. |

Notes:

- **Pixel format.** Images are passed to DeepFace as BGR `uint8` arrays, the layout DeepFace expects for in-memory images (the same as `cv2.imread`).
- **Face boxes** are scaled back from the downscaled copy to the original image after EXIF orientation, which is the upright image a browser displays. `face_photos.width/height` hold that size, so the frontend can draw boxes as percentages.
- **Selfies.** Each selfie uses its largest face that passes the filters. With several selfies, a gallery face's distance is its minimum across all of them.
- **Engine.** deepface 0.0.103 can run on TensorFlow, PyTorch, or ONNX. The image sets `DEEPFACE_BACKEND_ENGINE=tensorflow` so it uses the same TensorFlow Keras weights as the notebook.

## Data model (`migrations/001_faces.sql`)

```text
face_photos  id, bucket, object_name, generation, trip_id, width, height, face_count,
             status (indexed | no_faces | error), error, model_name, detector, indexed_at
             UNIQUE (bucket, object_name), btree (trip_id)
faces        id, photo_id -> face_photos ON DELETE CASCADE, trip_id, x, y, w, h, det_confidence,
             embedding vector(512), model_name, detector, created_at
             HNSW (embedding vector_cosine_ops), btree (trip_id), btree (photo_id)
```

- `faces.trip_id` duplicates the photo's trip, so the scope filter runs on the same table the HNSW index scans.
- `model_name` and `detector` are stored on faces (as requested) and also on photos. The photo copy means photos recorded as `no_faces` are also picked up for re-indexing after a model change.
- Migrations are tracked in their own `face_schema_migrations` table and use their own advisory lock. The backend's runner (`schema_migrations`) and this one never interact.

## Search and the HNSW index

Cloud SQL for PostgreSQL 13 and later provides **pgvector 0.8.5**. The instance is PostgreSQL 18.6 with 0.8.5 available, so `hnsw.iterative_scan` (added in pgvector 0.8.0) is available.

For each selfie, the search runs this inside one transaction:

```sql
SET LOCAL hnsw.ef_search = 100;                -- HNSW_EF_SEARCH
SET LOCAL hnsw.iterative_scan = relaxed_order; -- HNSW_ITERATIVE_SCAN
SET LOCAL hnsw.max_scan_tuples = 100000;       -- HNSW_MAX_SCAN_TUPLES

WITH nearest AS MATERIALIZED (
  SELECT ... , f.embedding <=> $q AS distance
  FROM faces f
  WHERE f.trip_id = $trip AND f.model_name = $model AND f.detector = $detector
  ORDER BY f.embedding <=> $q
  LIMIT $k
)
SELECT ... FROM nearest JOIN face_photos ... ORDER BY distance;
```

Python then keeps faces with distance below `MATCH_THRESHOLD`, takes each face's minimum distance across the selfies, and groups the faces by photo. A photo's distance is its closest face.

The two known gotchas, and how they are handled:

1. **`hnsw.ef_search` caps results (40 by default).** A plain HNSW scan returns at most `ef_search` candidates, however large `LIMIT` is.
2. **The scope filter is applied after the approximate scan.** Without iterative scan, the index returns its `ef_search` nearest faces across every trip, and Postgres then discards those from other trips. A selfie could return 3 matches, or none, even when the person is in 300 of this trip's photos.

With `hnsw.iterative_scan = relaxed_order`, the index scan keeps going after the first `ef_search` candidates until `LIMIT k` rows pass the `trip_id` filter, or until it has visited `hnsw.max_scan_tuples` tuples. `relaxed_order` can return rows slightly out of order, so the materialized CTE is sorted again outside (the pattern the pgvector docs recommend). `strict_order` is exact but slower.

**No silent truncation.** The first query asks for `SEARCH_INITIAL_K = 500` faces. If every returned face is a match, there may be more, so `k` doubles and the query runs again. This stops at the first non-match or at `SEARCH_MAX_K = 20000`. If the cap is reached, the response says `"truncated": true` and a WARNING is logged. Someone in hundreds of photos is never dropped without a signal.

**Trade-offs.**

- A higher `ef_search` improves recall, but every query costs more. With iterative scan it only sets the size of the first batch, so 100 is enough.
- `max_scan_tuples` bounds the work when one trip is a tiny fraction of a large table. Raise it if logs ever show a trip returning fewer matches than expected.
- If you turn iterative scan off (`HNSW_ITERATIVE_SCAN=off`), you must raise `ef_search` to at least `k`, up to its maximum of 1000. That makes every query slower and still loses results once a trip is a small share of all faces.

**Which index Postgres uses.** The query has the shape HNSW serves (`ORDER BY embedding <=> q LIMIT k`), but the planner chooses by cost. Measured on pgvector 0.8.5 / Postgres 18 with random 512-dim faces:

| Faces in table | Faces in the trip | k = 40 | k = 100 | k = 500 |
| --- | --- | --- | --- | --- |
| 3,000 | 3,000 (all) | HNSW | HNSW | seq scan + sort |
| 10,000 | 3,700 | HNSW | trip btree + sort | trip btree + sort |
| 30,000 | 5,700 | trip btree + sort | trip btree + sort | trip btree + sort |

When the trip filter is selective, Postgres reads only that trip's faces through `faces_trip_idx` and sorts them exactly. That is both faster and exact, and the `ef_search` and filtering gotchas don't apply to it. HNSW is chosen when the trip makes up most of the table and `k` is small, which is the case the iterative scan settings protect.

Two tests cover this:

- `test_planner_uses_hnsw_for_a_broad_scope` checks the plan with EXPLAIN.
- `test_iterative_scan_keeps_filtered_hnsw_results_complete` forces the HNSW path. With 120 matches in trip A and 200 lookalikes in trip B, it shows a plain scan (`iterative_scan=off`, `ef_search=40`) silently returns fewer than 120 photos, while the deployed settings return all 120.

## Event handling

- **Delivery.** Eventarc delivers at least once and retries non-2xx responses with backoff. The indexer is idempotent:
  - A `finalized` event for a generation that is already `indexed` or `no_faces` with the current model is skipped.
  - Otherwise, one transaction upserts the photo row, deletes its faces, and inserts the new ones.
  - The upsert only applies if the stored generation is not newer, so a late retry of an old generation never overwrites a newer upload.
- **Deletes.** A `deleted` event removes the photo row, and its faces cascade, but only if the stored generation is not newer. GCS also sends `deleted` for the old generation when an object is overwritten, and that event must not remove the new upload.
- **Permanent failures return 204 with the status recorded,** so Eventarc does not retry them for a day:
  - corrupt or unsupported image: `error`, with the message
  - no usable faces: `no_faces`
  - object larger than `MAX_IMAGE_BYTES`: `error`
  - unexpected model error on one image: `error`
  - object already gone: nothing recorded
  - malformed event or ignored object: nothing recorded
- **Transient failures return 500,** so Eventarc retries: database unavailable, or GCS download error.
- **Logs.** Each event logs one JSON line with `severity`, `message`, `event_id`, `bucket`, `object`, `generation`, `trip_id`, `status`, `face_count`, and `timings_ms` (`db_read`, `download`, `analyze`, `db_write`, `total`).

## Searching by cached embedding

Detecting and embedding the selfie is the slow part of a search. The backend caches it: the first search sends the selfie and `face-search` returns each selfie's embedding (`selfies[].embedding`, 512 floats). The backend stores it in `user_face_embeddings` (migration `028`, keyed by user and a hash of the selfie) and later sends `{ "trip_id": "…", "embeddings": [[…512 floats…]] }` instead of images. That request skips decoding, RetinaFace and Facenet and runs only the SQL below. Changing the profile selfie changes the hash, so it misses the cache and is embedded again. The response has the same shape, except `selfies` is empty.

## face-search API

`POST /search` with `Content-Type: application/json`:

```json
{ "trip_id": "<uuid>", "selfies": ["<base64 or data:image/jpeg;base64,...>", "..."] }
```

You can send 1 to 3 selfies, each at most 6 MiB (`MAX_SELFIE_BYTES`), so the base64 body stays under Cloud Run's 32 MiB request limit. Data URLs are accepted, so `users.picture` can be passed through unchanged.

`200`:

```json
{
  "trip_id": "…", "model_name": "Facenet512", "detector": "retinaface", "threshold": 0.4,
  "selfies": [{ "confidence": 0.999 }],
  "matches": [
    { "bucket": "ghoomates", "object_name": "trips/<tripId>/photos/<uuid>.jpg", "generation": "1730…",
      "width": 4032, "height": 3024, "distance": 0.21,
      "faces": [{ "x": 1210, "y": 640, "w": 380, "h": 470, "distance": 0.21 }] }
  ],
  "truncated": false
}
```

Errors use the backend's envelope, `{ "error": { "code", "message" } }`:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad input: not a UUID, wrong selfie count, or invalid base64. |
| 413 | `SELFIE_TOO_LARGE` / `BODY_TOO_LARGE` | A selfie or the whole body is over the limit. |
| 422 | `NO_FACE` / `INVALID_IMAGE` | Applies to one selfie. Includes `"selfie": <index>`. |
| 503 | `SEARCH_UNAVAILABLE` | The database is unreachable. |

`face-search` trusts the `trip_id` it receives. The backend must check that the signed-in user is a member of the trip before calling it.

## Calling from the backend (not applied: backend files were not edited)

The backend already holds the `ghoomates-storage` service account key (`GCS_CREDENTIALS_BASE64`). `deploy.sh invokers` gives that account `roles/run.invoker` on `face-search`. A service account key can mint ID tokens, so the same code works locally and in production. `google-auth-library` already comes in with `@google-cloud/storage`; add it to `backend/package.json` explicitly if you use it directly.

```ts
// backend/src/trips/faces.ts (suggested)
import { GoogleAuth, type IdTokenClient } from 'google-auth-library';
import type { Pool } from '../db.ts';

const FACE_SEARCH_URL = process.env.FACE_SEARCH_URL ?? ''; // https://face-search-<hash>.asia-south1.run.app
const credentials = JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS_BASE64 ?? '', 'base64').toString('utf8'));
let client: Promise<IdTokenClient> | undefined;

type FaceMatch = {
  object_name: string; width: number | null; height: number | null; distance: number;
  faces: { x: number; y: number; w: number; h: number; distance: number }[];
};

// Call only after checking the user is a member of tripId. selfies: data URLs or base64 (users.picture works as is).
export async function findMyPhotos(pool: Pool, tripId: string, selfies: string[]) {
  // The ID token's audience must be the service URL; the client caches and refreshes the token.
  client ??= new GoogleAuth({ credentials }).getIdTokenClient(FACE_SEARCH_URL);
  const res = await (await client).request<{ matches: FaceMatch[]; truncated: boolean }>({
    url: `${FACE_SEARCH_URL}/search`,
    method: 'POST',
    data: { trip_id: tripId, selfies },
    timeout: 60_000,
  });
  // Keep only photos registered in the album, and attach their ids.
  const keys = res.data.matches.map(m => m.object_name);
  const { rows } = await pool.query<{ id: string; object_key: string }>(
    'SELECT id, object_key FROM trip_photos WHERE trip_id = $1 AND object_key = ANY($2::text[])',
    [tripId, keys],
  );
  const idByKey = new Map(rows.map(r => [r.object_key, r.id]));
  return {
    truncated: res.data.truncated,
    photos: res.data.matches
      .filter(m => idByKey.has(m.object_name))
      .map(m => ({ photoId: idByKey.get(m.object_name)!, objectKey: m.object_name, distance: m.distance,
                   width: m.width, height: m.height, faces: m.faces })),
  };
}
```

Add `FACE_SEARCH_URL=` to `backend/.env.example`. The URL is printed by `./deploy.sh status`.

## Local development

You need Docker Desktop. On Apple Silicon the image builds natively for arm64; every pinned wheel exists for both arm64 and x86_64.

```bash
cd cloud
docker compose up --build             # db (pgvector 0.8.5 on Postgres 18, like Cloud SQL), migrate, indexer :8081, search :8082
```

In a second terminal, run the following. The scripts use only the Python standard library.

```bash
cd cloud
# Index a photo: copies it to ./local-bucket/trips/<trip>/photos/<file> and POSTs a finalized CloudEvent.
python3 scripts/send_event.py ~/Pictures/group.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001
python3 scripts/send_event.py ~/Pictures/beach.heic --trip 6f1c7f9e-0000-4000-8000-000000000001
# Search with 1 to 3 selfies.
python3 scripts/search_selfie.py ~/Pictures/me.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001
# Delete event (removes the photo's faces).
python3 scripts/send_event.py ~/Pictures/group.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001 --deleted
# Look at the rows.
docker compose exec db psql -U faces -d faces -c "SELECT object_name, status, face_count FROM face_photos"
```

Sending the same image again uses a new generation (the current time), so it is re-indexed. To see a redelivery being skipped, send a new object name twice with the same generation, for example `--name trips/<trip>/photos/dup.jpg --generation 5`. An older generation than the stored one is skipped as stale.

### Tests

```bash
cd cloud
docker compose --profile test run --rm tests                        # everything: unit, database, integration
docker compose --profile test run --rm tests pytest -v tests/test_pipeline.py tests/test_events.py   # unit only
```

- `test_pipeline.py` covers preprocessing (EXIF orientation, modes, HEIC, thumbnail, corrupt files), bbox scaling, face filtering, L2-normalization, and largest-face selection. A fake replaces DeepFace.
- `test_events.py` covers CloudEvent parsing, which objects get indexed, config, the DSN, and search request validation.
- `test_indexer_db.py` covers idempotency, generations, deletes, and permanent versus transient failures, against real Postgres.
- `test_search_db.py` covers the search SQL: trip scoping, the threshold, minimum distance over several selfies, grouping, k doubling (no truncation), model filtering, the HNSW plan, and the filtered-HNSW gotcha with and without iterative scan.
- `test_integration.py` indexes sample photos with the real models through the indexer endpoint, then searches with a selfie. The photos come from the deepface repository's test set, at a pinned commit.

The database tests create and drop their own database, so they never touch the `faces` database the local stack uses.

## Deploy

Every command is in `deploy.sh` and runs one step at a time. Nothing has been run. The defaults are project `optimal-comfort-510810-d1`, region `asia-south1` (Mumbai, where bucket `ghoomates` is), and the Cloud SQL instance at the public IP in `cloud/.env`.

### Order

```bash
cd cloud
cat .env                          # cloud/.env (gitignored) already holds the real DATABASE_URL
gcloud auth login                 # if needed; your account must be able to change IAM in the project
gcloud auth application-default login   # only needed for ./deploy.sh backfill
docker compose build migrate      # builds ghoommates-faces:local, used by the migrate and backfill steps

./deploy.sh apis         # 1. enable APIs (Cloud Run is currently disabled in the project)
./deploy.sh registry     # 2. Artifact Registry repository
./deploy.sh accounts     # 3. service accounts face-indexer, face-search, face-trigger
./deploy.sh iam          # 4. bucket and project roles
./deploy.sh migrate      # 5. CREATE EXTENSION vector + tables, in Cloud SQL
./deploy.sh build        # 6. Cloud Build builds and pushes the image (about 10 to 15 minutes the first time)
./deploy.sh indexer      # 7. deploy face-indexer
./deploy.sh search       # 8. deploy face-search (MIN_SEARCH_INSTANCES=1 ./deploy.sh search for a warm demo)
./deploy.sh invokers     # 9. run.invoker for the trigger (indexer) and the backend account (search)
./deploy.sh triggers     # 10. Eventarc triggers, finalized + deleted
./deploy.sh backfill     # 11. index photos uploaded before step 10 (4 rows in trip_photos today)
./deploy.sh status       # URLs and triggers
```

Steps 9 and 10 come after the deploys because IAM bindings on a service, and triggers pointing at it, need the service to exist. If `triggers` fails with a permission error on the project's first Eventarc trigger, wait a minute and run it again. Google's docs say the Eventarc service agent can take a moment to be set up. A new trigger can take up to two minutes to start delivering.

**About the database URL.** As agreed, the connection is the public IP URL and there is no Secret Manager secret. The URL, including the password, is set as a plain environment variable on both services. It is visible to anyone in the project with `run.services.get`. To move it into Secret Manager later:

1. Create a secret `ghoommates-db-url`.
2. Grant `roles/secretmanager.secretAccessor` (the commented lines in `deploy.sh iam`).
3. Replace the `DATABASE_URL` line of the env file with `--set-secrets=DATABASE_URL=ghoommates-db-url:latest`.

### Commands and flags

`gcloud services enable SERVICES... --project` (step `apis`) turns on these APIs:

- `run`: Cloud Run.
- `eventarc`: triggers.
- `pubsub`: the transport Eventarc uses for Cloud Storage events.
- `storage`: the bucket.
- `artifactregistry`: the image repository.
- `cloudbuild`: builds the image.
- `iam`: service accounts.
- `logging`: logs.

`--project` selects the project. Every command below uses it, and it is not repeated.

`gcloud artifacts repositories create REPO` (step `registry`):

- `--location=asia-south1`: the repository's region. It matches the services, so image pulls stay in region.
- `--repository-format=docker`: stores container images.
- `--description`: a label shown in the console.

`gcloud iam service-accounts create NAME --display-name` (step `accounts`) creates one identity per job, so each gets only the roles it needs:

- `face-indexer` runs the indexer.
- `face-search` runs the search service.
- `face-trigger` is the identity Eventarc uses to call the indexer.

`--display-name` is a human-readable label.

`gcloud storage buckets add-iam-policy-binding gs://ghoomates` (step `iam`):

- `--member=serviceAccount:face-indexer@…`: who gets the role.
- `--role=roles/storage.objectViewer`: read objects, scoped to this one bucket only.

`gcloud projects add-iam-policy-binding PROJECT` (step `iam`, used twice):

- `--member=serviceAccount:face-trigger@…` with `--role=roles/eventarc.eventReceiver`: lets the trigger's identity receive events.
- `--member=serviceAccount:<Cloud Storage service agent>` with `--role=roles/pubsub.publisher`: lets Cloud Storage publish bucket notifications to the Pub/Sub topic Eventarc creates. The agent's address comes from `gcloud storage service-agent --project`, which prints the project's Cloud Storage service account.
- `--condition=None`: adds the binding without an IAM condition, and avoids an interactive prompt on projects that already use conditions.

These roles are not granted. Each is commented in `deploy.sh` with the reason:

- **Cloud SQL Client** is only needed with the Cloud SQL connector. The services connect straight to the public IP.
- **Secret Manager Secret Accessor** is not needed because no secret is used.

`docker run --rm -e DATABASE_URL=… ghoommates-faces:local python -m faces.migrate` (step `migrate`):

- `--rm`: deletes the container when it exits.
- `-e DATABASE_URL`: passes the connection URL.
- `ghoommates-faces:local`: the image `docker compose build` creates.
- `python -m faces.migrate`: applies `migrations/*.sql` once each, under an advisory lock.

The `ghoomates` user is a member of `cloudsqlsuperuser`, which Cloud SQL requires for `CREATE EXTENSION vector`.

`gcloud builds submit .` (step `build`):

- `.`: uploads this folder as the build context. `.gcloudignore` keeps `.env` out.
- `--region=asia-south1`: runs the build in Mumbai.
- `--config=cloudbuild.yaml`: builds the `runtime` stage only (the Dockerfile's last stage is the test image) and pushes it.
- `--substitutions=_IMAGE=…`: the image name, `asia-south1-docker.pkg.dev/<project>/ghoomates/faces:<git sha>`.

`cloudbuild.yaml` sets `machineType: E2_HIGHCPU_8` (TensorFlow installs and the model warm-up run faster) and `timeout: 3600s`.

`gcloud run deploy face-indexer` (step `indexer`):

| Flag | Value | Why |
| --- | --- | --- |
| `--region` | `asia-south1` | Same region as the bucket and Cloud SQL. |
| `--image` | the built image | Same image for both services. |
| `--service-account` | `face-indexer@…` | Runtime identity, with read access to the bucket. |
| `--no-allow-unauthenticated` | | Callers need `roles/run.invoker`. Only the trigger's account has it. |
| `--ingress` | `internal` | Only internal sources can reach it. Eventarc in the same project counts as internal, so the public internet can't reach it at all. |
| `--execution-environment` | `gen2` | Full Linux compatibility and faster CPU, which suits TensorFlow. |
| `--cpu` | `2` | Two vCPUs for TensorFlow inference. |
| `--memory` | `4Gi` | TensorFlow plus both models and a decoded 1600 px image fit with headroom. |
| `--concurrency` | `1` | One photo per instance at a time. The models use all the CPU, and memory stays predictable. |
| `--timeout` | `300` | Max seconds per event. A photo takes a few seconds; this covers cold starts and big HEICs. |
| `--min-instances` | `0` | Scales to zero when nobody uploads. |
| `--max-instances` | `10` | Caps parallel indexing (see sizing below). |
| `--cpu-boost` | | Extra CPU during startup to load TensorFlow and the models faster. |
| `--env-vars-file` | temp YAML | `SERVICE=indexer`, `LOG_LEVEL`, `DATABASE_URL`. A file avoids shell quoting problems with the URL and is deleted right after. |

`gcloud run deploy face-search` (step `search`) uses the same flags with these differences:

- `--service-account=face-search@…`: needs no roles, because it reads only the database.
- `--ingress=all`: the backend is not on Cloud Run or in a VPC yet, so it calls over the internet. Access is still blocked without an ID token from an account with `run.invoker`.
- `--timeout=60`
- `--max-instances=3`
- `--min-instances=$MIN_SEARCH_INSTANCES` (0 by default; see cost below).

`gcloud run services add-iam-policy-binding SERVICE` (step `invokers`):

- `face-indexer`, `--member=serviceAccount:face-trigger@…`, `--role=roles/run.invoker`: Eventarc calls the private indexer as that account.
- `face-search`, `--member=serviceAccount:ghoomates-storage@…` (override with `BACKEND_SA`), `--role=roles/run.invoker`: the backend's identity may call search.
- `--region`: where the service is.

`gcloud eventarc triggers create NAME` (step `triggers`, once for `finalized` and once for `deleted`):

| Flag | Value | Why |
| --- | --- | --- |
| `--location` | `asia-south1` | Must be the bucket's region for Cloud Storage triggers. |
| `--destination-run-service` | `face-indexer` | Where events go. |
| `--destination-run-region` | `asia-south1` | The service's region. |
| `--destination-run-path` | `/` | The indexer's endpoint. |
| `--event-filters` | `type=google.cloud.storage.object.v1.finalized` (or `.deleted`) | Which event. Filters match exactly, so there are no path wildcards; the indexer filters paths itself. |
| `--event-filters` | `bucket=ghoomates` | Which bucket. |
| `--service-account` | `face-trigger@…` | The identity used to call the private service. |

Retries are left at the default, which retries non-2xx responses with backoff. `--max-retry-attempts=1` would turn retries off, and is not used.

`docker run … python -m faces.backfill` (step `backfill`):

- `-e GOOGLE_APPLICATION_CREDENTIALS=/adc.json -v ~/.config/gcloud/application_default_credentials.json:/adc.json:ro`: mounts your Application Default Credentials read-only, so the container can list and read the bucket.
- `-e GOOGLE_CLOUD_PROJECT`: sets the project for the storage client.
- `-e BUCKET`, `-e PREFIX=trips/`: what to scan.

The backfill runs the same indexer code locally against Cloud SQL. Photos that are already indexed are skipped.

`gcloud run services list --filter="metadata.name~^face-" --format=table(...)` and `gcloud eventarc triggers list --location` (step `status`): `--filter` keeps only these two services, and `--format` prints the name, URL, and live revision.

### Sizing and cost

- **Connections.** Each instance uses a pool of at most 2 connections (`DB_POOL_MAX`). With 10 indexers and 3 search instances, that is at most 26 connections, against the instance's `max_connections` of 800 plus the backend's 10.
- **Bulk uploads.** In local Docker a photo takes about 5 to 7 seconds, almost all of it RetinaFace plus Facenet512 (`timings_ms.analyze`). A bulk upload of 500 photos queues in Eventarc and drains about 10 at a time, so roughly 4 to 6 minutes. Raise `MAX_INDEXER_INSTANCES` if you want it faster; the database has plenty of headroom.
- **Cold start.** The models are in the image (`DEEPFACE_HOME=/opt/deepface`), so a cold start only loads TensorFlow and about 215 MB of weights from local disk, plus one warm-up inference. Expect roughly 10 to 25 seconds; measure it after deploying in the `models loaded` log line. A warm search takes about 5 seconds per selfie (face detection on the 1600 px image dominates; the SQL takes about 15 ms).
- **Warm search instance (`min-instances=1` on face-search).** An idle 2 vCPU / 4 GiB instance is billed at Cloud Run's idle min-instance rate the whole time. That is roughly 40 to 60 USD a month in asia-south1, which I believe is a Tier 2 region; check the Cloud Run pricing page or calculator before relying on this. For a hackathon, set it to 1 only around demos:
  - `MIN_SEARCH_INSTANCES=1 ./deploy.sh search` before the demo
  - `MIN_SEARCH_INSTANCES=0 ./deploy.sh search` after it

  The indexer stays at 0 because nobody waits on it.

## Operations

- **Logs.** In Logs Explorer, query `resource.labels.service_name="face-indexer" jsonPayload.status="error"`.
- **Re-index after changing `MODEL_NAME`, `DETECTOR_BACKEND` or preprocessing.** Deploy, then run `./deploy.sh backfill`. Rows with a different `model_name`/`detector` are not skipped, so every photo is re-indexed. Search only compares faces from the current model.
- **Photos that failed.** `SELECT object_name, error FROM face_photos WHERE status = 'error'`.
