# Face indexing (`cloud/`)

This folder contains the `face-indexer` Cloud Run service, which embeds every face in trip photos and profile selfies so a trip member can find every trip photo they appear in. The find-me search itself runs in the backend (`backend/src/trips/faces.ts`): it takes the selfie vector this service wrote to `selfie_faces` and runs `$vectorSearch` on the `faces_embedding` index directly.

| Service | Trigger | What it does |
| --- | --- | --- |
| `face-indexer` | Eventarc, on `google.cloud.storage.object.v1.finalized` and `.deleted` in bucket `ghoomates` | Downloads each new trip photo, detects faces, embeds them, reads each face's emotion, and stores them in MongoDB Atlas (Atlas Vector Search). In parallel, asks Gemini for a caption and scene tags (`photo_tags`) for photo search. When a photo is deleted, its faces and tags are removed. Also embeds each new profile selfie (`users/<userId>/selfies/`) into `selfie_faces`. |

The face pipeline must match the prototype notebook exactly: Pillow `exif_transpose`, conversion to RGB, a thumbnail at most 1600 px on its longest side, then `DeepFace.represent(model_name="Facenet512", detector_backend="retinaface", align=True, enforce_detection=True)`, followed by L2-normalization.

Embedding has to run here: a selfie must be embedded with the same model and preprocessing as the gallery photos, and the Node backend cannot run DeepFace. Searching needs no model, only the stored vectors, so it runs in the backend.

```text
browser ──PUT──> gs://ghoomates/trips/<tripId>/photos/<uuid>.jpg
                 gs://ghoomates/users/<userId>/selfies/<uuid>.jpg
                      │ object.v1.finalized / deleted
                      ▼
                 Eventarc ──> face-indexer ──> Atlas: face_photos, faces (float32[512], vector index, emotion, smile)
                                           ├─> Gemini (Vertex AI) ──> Atlas: photo_tags (caption, tags)
                                           └─> Atlas: selfie_faces (one selfie vector per upload)
                                                               ▲
backend find-me ──$vectorSearch on faces (query = selfie vector from selfie_faces) ┘
```

## Layout

```text
cloud/
  faces/config.py       every constant; each one can be overridden by an env var of the same name
  faces/pipeline.py     Pillow preprocessing, DeepFace call, face filtering, bbox scaling, L2-normalization, per-face emotion
  faces/tagger.py       Gemini caption + scene tags per photo (Vertex AI REST), daily budget in usage_counters
  faces/indexer.py      face-indexer Flask app (CloudEvent parsing, routing, idempotency, status codes)
  faces/store.py        all MongoDB access: upsert/replace faces, photo_tags, generation-aware deletes, $vectorSearch and grouping (reference for the backend's find-me)
  faces/db.py           one pymongo MongoClient per process (MONGODB_CONNECTION_STRING, MONGODB_DB)
  faces/storage.py      reads objects from GCS, or from a local folder in development
  faces/main.py         WSGI entry point for the indexer; models load once at startup
  faces/migrate.py      creates the face_photos / faces / selfie_faces / photo_tags indexes and the Atlas Vector Search index (idempotent)
  faces/warmup.py       Docker build step that downloads and loads the models (Facenet512, RetinaFace, Emotion) into the image
  faces/backfill.py     indexes photos uploaded before the trigger existed; catches up emotions and tags
  faces/logs.py         JSON logs with a severity field for Cloud Logging
  scripts/send_event.py      sends a fake GCS CloudEvent to the local indexer
  tests/                pytest: unit, database, and end-to-end integration tests
  Dockerfile            runtime stage (deployed) and test stage (local only)
  docker-compose.yml    MongoDB Atlas Local, migrate, indexer, tests
  cloudbuild.yaml       Cloud Build config that builds the runtime stage
  deploy.sh             every deploy command, one step at a time
  requirements.txt      runtime dependencies, all pinned (Python 3.12)
  requirements-dev.txt  adds pytest on top of requirements.txt
  .env.example          MONGODB_CONNECTION_STRING template; the real value goes in cloud/.env (gitignored)
```

## How it fits the app

- **Scope is the trip.** The backend uploads photos to `trips/<tripId>/photos/<uuid>.<ext>` (`backend/src/trips/service.ts`). The indexer reads the trip id from that path, using the `INCLUDE_PATTERN` named group `scope`, and every search is limited to one trip.
- **Only trip photos and profile selfies are indexed.** A trip photo is indexed only when all of the following hold. Otherwise it is acknowledged and ignored:
  - it matches `INCLUDE_PATTERN`
  - it is not under any of `SKIP_PREFIXES` (`users/,selfies/,thumbnails/,healthcheck/`)
  - its extension and its content type are both image types

  A profile selfie is an image matching `SELFIE_PATTERN` (`users/<userId>/selfies/<file>`, checked before `SKIP_PREFIXES`). Its largest face is embedded into `selfie_faces` (`object_name`, `user_id`, `generation`, `status` = `indexed` / `no_face` / `error`, `embedding` as a plain array of 512 floats), and deleting the object removes the row. Selfies never become gallery faces. This keeps out receipts (`trips/<id>/receipts/`), profile photos (`users/<id>/avatars/`), health checks, and anything a future pipeline might write. Nothing this service does writes to the bucket, so nothing can trigger itself in a loop.
- **Link to `trip_photos`.** `face_photos.object_name` equals `trip_photos.object_key`. There is no foreign key, because the browser uploads first and registers the photo afterwards (`POST /photos`), so the upload event usually arrives before the `trip_photos` row exists. The backend joins search results to `trip_photos` by object key.
- **Selfies** are uploaded by the browser to `users/<userId>/selfies/` (see `backend/docs/auth.md`); `users.selfie_key` names the current one. Only the indexer reads selfie images; it stores the vector, never the image or anything in logs.

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

### Emotion per face

Each face that passes the filters is cropped from the downscaled image (the detector's `facial_area`, padded 10% on each side, clamped to the image) and run through `DeepFace.analyze(actions=["emotion"], detector_backend="skip", enforce_detection=False)`. Each `faces` document gets:

- `emotion`: the dominant emotion, one of `angry`, `disgust`, `fear`, `happy`, `sad`, `surprise`, `neutral`, or `null`
- `smile`: DeepFace's `happy` probability as 0..1 (3 decimals), or `null`

A failure on one face leaves both `null`; it never fails the photo. Selfies skip the emotion model. Settings:

| Setting | Default | Notes |
| --- | --- | --- |
| `EMOTIONS` | `true` | Off: faces are stored with `null` emotion and the photo with `attrs_version: 0`. |
| `ATTRS_VERSION` | `1` | Stored on `face_photos`. An `indexed` photo with an older (or missing) `attrs_version` has its faces run again on redelivery or backfill. `no_faces` photos are left alone. |

The Emotion model (about 6 MB) is downloaded and loaded by `faces.warmup` at image build time, like the other two.

## Photo tags (Gemini)

For photo search ("haldi", "beach", "sunset"), each trip photo gets a caption and 5 to 12 scene tags from Gemini on Vertex AI. `faces/tagger.py` sends the decoded, upright image re-encoded as a JPEG (longest side `TAGS_IMAGE_SIDE`, 768 px) inline to `generateContent` with a JSON response schema (`caption`, `tags`), temperature 0.2 and minimal thinking. The URL is the backend's (`backend/src/gemini.ts`): `https://aiplatform.googleapis.com/v1/projects/<VERTEX_PROJECT>/locations/global/publishers/google/models/<TAGS_MODEL>:generateContent` (`<location>-aiplatform.googleapis.com` for a regional location), authenticated with Application Default Credentials (the service account on Cloud Run).

The prompt asks for a one-sentence caption that never names or identifies people, and lowercase singular tags covering the activity, the setting, a visible occasion (haldi, mehendi, sangeet, wedding, birthday, conference, festival; Indian ceremonies only when clearly visible), the time of day and notable objects. The answer is normalised: lowercase, trimmed, deduplicated, tags over 40 characters dropped, at most 15 tags, caption at most 200 characters.

**Runs in parallel with DeepFace** on the same decoded image (a worker thread), so it adds no time to an event. Tagging never fails face indexing and never makes the indexer answer non-2xx: an HTTP or parsing failure is stored as `status: error` with the message. An image that can't be decoded gets no tags.

**Budget.** Before each call the tagger takes one unit of a daily counter in `usage_counters`, the same documents as the backend's `mongoCounters.take` (`backend/src/limits.ts`): `_id: "gemini:photo-tags:<YYYY-MM-DD in IST>"`, `count`, `expires_at` (now + 2 days, removed by the backend's TTL index). Once `PHOTO_TAGS_PER_DAY` is reached, photos are stored with `status: skipped` and a later backfill tags them. If the counter can't be written (database trouble), the call goes ahead.

| Setting | Default | Notes |
| --- | --- | --- |
| `TAGS_ENABLED` | `true` | Tagging runs only when this is on **and** `VERTEX_PROJECT` is set. |
| `VERTEX_PROJECT` | (empty) | The project billed for Gemini. `deploy.sh` sets it to `PROJECT_ID`. Empty locally, so tags are off. |
| `VERTEX_LOCATION` | `global` | |
| `TAGS_MODEL` | `gemini-3.5-flash-lite` | |
| `TAGS_VERSION` | `1` | Stored on each `photo_tags` doc. Bump it after changing the prompt or model; the backfill re-tags older docs. |
| `PHOTO_TAGS_PER_DAY` | `1500` | Daily cap (IST days). `0` turns calls off. |
| `TAGS_IMAGE_SIDE` | `768` | Longest side of the JPEG sent to Gemini. |
| `TAGS_TIMEOUT` | `30` | Seconds per call. |

## Data model (`faces/migrate.py`)

Collections in the backend's Atlas database (`MONGODB_DB`, default `ghoomates`). This service creates their indexes.

```text
face_photos  _id (ObjectId), bucket, object_name, generation, trip_id (uuid string), width, height, face_count,
             status (indexed | no_faces | error), error, model_name, detector, attrs_version, indexed_at
             unique (bucket, object_name), (trip_id), (object_name, trip_id)
faces        _id, photo_id -> face_photos._id, trip_id, x, y, w, h, det_confidence,
             emotion (angry | disgust | fear | happy | sad | surprise | neutral | null), smile (0..1 | null),
             embedding (BSON float32 vector, 512), model_name, detector, created_at,
             bucket, object_name, generation, width, height   (copied from the photo)
             (photo_id), (trip_id), vector search index faces_embedding
photo_tags   _id, object_name (= trip_photos.object_key), bucket, trip_id (uuid string), generation,
             status (tagged | error | skipped), caption, tags (lowercase strings), error, model, tags_version, tagged_at
             unique (object_name), (trip_id, tags)
```

`photo_tags` is written independently of `face_photos`: a tags-only rerun (new `TAGS_VERSION`, a budget-skipped photo) never touches the faces, and the upsert is generation-aware like `face_photos` (an older event never overwrites a newer generation's tags).

- `faces_embedding` is an Atlas Vector Search index: `embedding` (512 dims, cosine) plus `trip_id`, `model_name` and `detector` as filter fields, so the trip filter is applied inside the approximate scan.
- Each face carries its photo's fields, so a search is one `$vectorSearch` with no join. Deleting a photo deletes its faces in the same transaction (there are no foreign keys).
- `model_name` and `detector` are stored on faces and also on photos. The photo copy means photos recorded as `no_faces` are also picked up for re-indexing after a model change.
- `python -m faces.migrate` is idempotent: it creates the regular indexes, creates the vector index only if it is missing, and waits until it is queryable.

## Search

The backend's find-me (`backend/src/trips/faces.ts`) runs this; `store.search` in `faces/store.py` is the reference implementation the database tests cover, and the two must stay in step. For each selfie, the search runs one aggregation on `faces`:

```js
{ $vectorSearch: {
    index: "faces_embedding", path: "embedding", queryVector: q,
    numCandidates: min(max(10 * k, 100), 10000), limit: k,
    filter: { $and: [{ trip_id: { $eq: trip } }, { model_name: { $eq: model } }, { detector: { $eq: detector } }] } } },
{ $project: { photo_id: 1, x: 1, ..., score: { $meta: "vectorSearchScore" } } }
```

Atlas reports cosine similarity as `score = (1 + cos) / 2`, so the code converts it back to cosine distance, `distance = 2 * (1 - score)` (= `1 - cos`). `MATCH_THRESHOLD = 0.40` keeps the meaning it had with pgvector. The code then keeps faces with distance below the threshold, takes each face's minimum distance across the selfies, and groups the faces by photo. A photo's distance is its closest face.

**Filtering.** `filter` is a pre-filter: Atlas walks the HNSW graph looking only at faces of this trip, model and detector, so `limit` results come back whenever the trip has that many faces, however many faces other trips hold. (This replaces the pgvector `hnsw.iterative_scan` setup, where the scope filter ran after the approximate scan.) `numCandidates` is the size of the candidate list; 10 times `k` gives near-exact recall.

**No silent truncation.** The first query asks for `SEARCH_INITIAL_K = 500` faces. If every returned face is a match, there may be more, so `k` doubles and the query runs again. This stops at the first non-match or at `SEARCH_MAX_K = 10000` (Atlas caps `limit` and `numCandidates` at 10000, so larger values are lowered). If the cap is reached, the result says `truncated: true`. Someone in hundreds of photos is never dropped without a signal.

**Eventual consistency.** The vector index is updated asynchronously from the oplog, so a photo becomes searchable about a second after it is indexed. The database tests wait for it (`wait_searchable` in `tests/conftest.py`).

`test_trip_filter_finds_the_match_among_other_trips_and_noise` covers recall with the filter: one match in trip A among 1,500 strangers, while trip B holds 200 closer lookalikes and 1,500 strangers. The search finds it and never returns anything from trip B.

## Event handling

- **Delivery.** Eventarc delivers at least once and retries non-2xx responses with backoff. The indexer is idempotent. A trip photo's `finalized` event decides two things separately:
  - **Faces** are needed unless this generation is already `indexed` or `no_faces` with the current model and detector (and, for `indexed`, the current `attrs_version`).
  - **Tags** are needed when tagging is on and there is no `photo_tags` doc, its generation is older, its `tags_version` is older, or its status is not `tagged`.
  - Neither needed: the event is skipped. Only tags needed: download, decode and tag; the faces are left as they are. An event older than the stored generation is skipped for both.
  - Otherwise, one transaction upserts the photo document, deletes its faces, and inserts the new ones.
  - The upsert only matches if the stored generation is not newer (`generation: {$lte}`). If a newer one is stored, the upsert collides with the unique `(bucket, object_name)` index and the event is treated as stale, so a late retry of an old generation never overwrites a newer upload.
- **Deletes.** A `deleted` event removes the photo document, its faces and its `photo_tags` doc (one transaction), but only if the stored generation is not newer. GCS also sends `deleted` for the old generation when an object is overwritten, and that event must not remove the new upload.
- **Permanent failures return 204 with the status recorded,** so Eventarc does not retry them for a day:
  - corrupt or unsupported image: `error`, with the message
  - no usable faces: `no_faces`
  - object larger than `MAX_IMAGE_BYTES`: `error`
  - unexpected model error on one image: `error`
  - object already gone: nothing recorded
  - malformed event or ignored object: nothing recorded
- **Transient failures return 500,** so Eventarc retries: database unavailable, or GCS download error.
- **Logs.** Each event logs one JSON line with `severity`, `message`, `event_id`, `bucket`, `object`, `generation`, `trip_id`, `work` (`faces`, `tags`, or `faces+tags`), `status`, `face_count`, `tags_status`, and `timings_ms` (`db_read`, `download`, `analyze`, `tags`, `db_write`, `total`).

## Selfie embeddings

Detecting and embedding the selfie is the slow part, so it happens once, on upload: the indexer stores each selfie's embedding in `selfie_faces`, and the backend's find-me uses it as the query vector. Until that row exists (the event is still in flight, or locally, where nothing sends events), find-me can't search, because the backend can't embed images. To embed selfies uploaded before the indexer handled them, run the backfill with `PREFIX=users/`.

## Local development

You need Docker Desktop. On Apple Silicon the image builds natively for arm64. tensorflow-cpu has no Linux arm64 wheel, so arm64 installs `tensorflow` at the same version instead (an environment marker in `requirements.txt`). Every other pinned wheel exists for both arm64 and x86_64.

```bash
cd cloud
docker compose up --build             # db (MongoDB Atlas Local: mongod + mongot, on :27018), migrate, indexer :8081
```

In a second terminal, run the following. The scripts use only the Python standard library.

```bash
cd cloud
# Index a photo: copies it to ./local-bucket/trips/<trip>/photos/<file> and POSTs a finalized CloudEvent.
python3 scripts/send_event.py ~/Pictures/group.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001
python3 scripts/send_event.py ~/Pictures/beach.heic --trip 6f1c7f9e-0000-4000-8000-000000000001
# Delete event (removes the photo's faces).
python3 scripts/send_event.py ~/Pictures/group.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001 --deleted
# Look at the documents.
docker compose exec db mongosh ghoomates --quiet --eval 'db.face_photos.find({}, {object_name: 1, status: 1, face_count: 1})'
```

Photo tags are off locally unless you export `VERTEX_PROJECT` before `docker compose up`. The container then also needs Google credentials, e.g. a `docker-compose.override.yml` for the `indexer` service with `GOOGLE_APPLICATION_CREDENTIALS: /adc.json` and the volume `~/.config/gcloud/application_default_credentials.json:/adc.json:ro`. Look at the tags with `docker compose exec db mongosh ghoomates --quiet --eval 'db.photo_tags.find({}, {object_name: 1, status: 1, caption: 1, tags: 1})'`.

Sending the same image again uses a new generation (the current time), so it is re-indexed. To see a redelivery being skipped, send a new object name twice with the same generation, for example `--name trips/<trip>/photos/dup.jpg --generation 5`. An older generation than the stored one is skipped as stale.

### Tests

```bash
cd cloud
docker compose --profile test run --rm tests                        # everything: unit, database, integration
docker compose --profile test run --rm tests pytest -v tests/test_pipeline.py tests/test_events.py   # unit only
```

- `test_pipeline.py` covers preprocessing (EXIF orientation, modes, HEIC, thumbnail, corrupt files), bbox scaling, face filtering, L2-normalization, largest-face selection, and emotion (crop padding and clamping, failures, emotions off, selfies skipping it). Fakes replace DeepFace.
- `test_tagger.py` covers the Gemini request (URL, body, schema), parsing and normalisation of the answer, HTTP and JSON failures, the daily budget (counter documents, IST day, a full counter, a down database). Fakes replace HTTP and credentials.
- `test_events.py` covers CloudEvent parsing, which objects get indexed, config (including the Atlas `k` cap), and lazy database connection.
- `test_indexer_db.py` covers idempotency, generations, deletes, and permanent versus transient failures, against MongoDB with transactions; plus emotion fields, `attrs_version` re-runs, and photo tags (tags-only reruns leave faces untouched, Gemini failures and a spent budget never fail the photo, deletes remove tags).
- `test_search_db.py` covers `$vectorSearch`: trip scoping, the threshold, minimum distance over several selfies, grouping, k doubling (no truncation), model filtering, recall with the trip filter, and that hits carry `emotion` and `smile`.
- `test_integration.py` indexes sample photos with the real models through the indexer endpoint, then embeds a selfie and runs `store.search`. The photos come from the deepface repository's test set, at a pinned commit.

The database tests need `TEST_MONGODB_CONNECTION_STRING` (set by the compose `tests` service; locally: `TEST_MONGODB_CONNECTION_STRING='mongodb://localhost:27018/?directConnection=true' pytest`). They create and drop their own database (`faces_test_<random>`), so they never touch the `ghoomates` database the local stack uses. Without it they are skipped.

## Deploy

Every command is in `deploy.sh` and runs one step at a time. Nothing has been run. The defaults are project `optimal-comfort-510810-d1`, region `asia-south1` (Mumbai, where bucket `ghoomates` is), and the Atlas cluster in `cloud/.env`.

### Order

```bash
cd cloud
cat .env                          # cloud/.env (gitignored) must hold MONGODB_CONNECTION_STRING (same as the backend's)
gcloud auth login                 # if needed; your account must be able to change IAM in the project
gcloud auth application-default login   # only needed for ./deploy.sh backfill
docker compose build migrate      # builds ghoommates-faces:local, used by the migrate and backfill steps

./deploy.sh apis         # 1. enable APIs (Cloud Run is currently disabled in the project)
./deploy.sh registry     # 2. Artifact Registry repository
./deploy.sh accounts     # 3. service accounts face-indexer, face-trigger
./deploy.sh iam          # 4. bucket and project roles
./deploy.sh migrate      # 5. face_photos / faces indexes + the faces_embedding vector index, in Atlas
./deploy.sh build        # 6. Cloud Build builds and pushes the image (about 10 to 15 minutes the first time)
./deploy.sh indexer      # 7. deploy face-indexer
./deploy.sh invokers     # 8. run.invoker for the trigger on the indexer
./deploy.sh triggers     # 9. Eventarc triggers, finalized + deleted
./deploy.sh backfill     # 10. index photos uploaded before step 9 (4 rows in trip_photos today)
./deploy.sh status       # URLs and triggers
```

Steps 8 and 9 come after the deploy because IAM bindings on a service, and triggers pointing at it, need the service to exist. If `triggers` fails with a permission error on the project's first Eventarc trigger, wait a minute and run it again. Google's docs say the Eventarc service agent can take a moment to be set up. A new trigger can take up to two minutes to start delivering.

**About the connection string.** There is no Secret Manager secret: `MONGODB_CONNECTION_STRING`, including the password, is set as a plain environment variable on the service. It is visible to anyone in the project with `run.services.get`. Atlas Network Access must allow Cloud Run's egress (it has no fixed IP without a NAT, so `0.0.0.0/0` for the hackathon). To move the string into Secret Manager later:

1. Create a secret `ghoommates-mongodb-uri`.
2. Grant `roles/secretmanager.secretAccessor` (the commented lines in `deploy.sh iam`).
3. Replace the `MONGODB_CONNECTION_STRING` line of the env file with `--set-secrets=MONGODB_CONNECTION_STRING=ghoommates-mongodb-uri:latest`.

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
- `aiplatform`: Vertex AI, for photo tags (Gemini).

`--project` selects the project. Every command below uses it, and it is not repeated.

`gcloud artifacts repositories create REPO` (step `registry`):

- `--location=asia-south1`: the repository's region. It matches the services, so image pulls stay in region.
- `--repository-format=docker`: stores container images.
- `--description`: a label shown in the console.

`gcloud iam service-accounts create NAME --display-name` (step `accounts`) creates one identity per job, so each gets only the roles it needs:

- `face-indexer` runs the indexer.
- `face-trigger` is the identity Eventarc uses to call the indexer.

`--display-name` is a human-readable label.

`gcloud storage buckets add-iam-policy-binding gs://ghoomates` (step `iam`):

- `--member=serviceAccount:face-indexer@…`: who gets the role.
- `--role=roles/storage.objectViewer`: read objects, scoped to this one bucket only.

`gcloud projects add-iam-policy-binding PROJECT` (step `iam`, used three times):

- `--member=serviceAccount:face-trigger@…` with `--role=roles/eventarc.eventReceiver`: lets the trigger's identity receive events.
- `--member=serviceAccount:<Cloud Storage service agent>` with `--role=roles/pubsub.publisher`: lets Cloud Storage publish bucket notifications to the Pub/Sub topic Eventarc creates. The agent's address comes from `gcloud storage service-agent --project`, which prints the project's Cloud Storage service account.
- `--member=serviceAccount:face-indexer@…` with `--role=roles/aiplatform.user`: lets the indexer call Gemini on Vertex AI (`generateContent`) for photo tags, in `VERTEX_PROJECT` (default `PROJECT_ID`).
- `--condition=None`: adds the binding without an IAM condition, and avoids an interactive prompt on projects that already use conditions.

These roles are not granted. Each is commented in `deploy.sh` with the reason:

- **Secret Manager Secret Accessor** is not needed because no secret is used.

`docker run --rm -e MONGODB_CONNECTION_STRING=… -e MONGODB_DB=… ghoommates-faces:local python -m faces.migrate` (step `migrate`):

- `--rm`: deletes the container when it exits.
- `-e MONGODB_CONNECTION_STRING`, `-e MONGODB_DB`: the cluster and database.
- `ghoommates-faces:local`: the image `docker compose build` creates.
- `python -m faces.migrate`: creates the indexes if missing and waits for the vector index to be queryable. Safe to rerun. The database user needs a role that can create search indexes (`readWrite` plus Atlas's search index privileges, e.g. `dbAdmin`, or Atlas admin).

`gcloud builds submit .` (step `build`):

- `.`: uploads this folder as the build context. `.gcloudignore` keeps `.env` out.
- `--region=asia-south1`: runs the build in Mumbai.
- `--config=cloudbuild.yaml`: builds the `runtime` stage only (the Dockerfile's last stage is the test image) and pushes it.
- `--substitutions=_IMAGE=…`: the image name, `asia-south1-docker.pkg.dev/<project>/ghoomates/faces:<git sha>`.

`cloudbuild.yaml` sets `machineType: E2_HIGHCPU_8` (TensorFlow installs and the model warm-up run faster) and `timeout: 3600s`.

`gcloud run deploy face-indexer` (step `indexer`):

| Flag | Value | Why |
| --- | --- | --- |
| `--region` | `asia-south1` | Same region as the bucket. |
| `--image` | the built image | The image Cloud Build pushed. |
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
| `--env-vars-file` | temp YAML | `LOG_LEVEL`, `MONGODB_CONNECTION_STRING`, `MONGODB_DB`, `VERTEX_PROJECT` (default `PROJECT_ID`), `VERTEX_LOCATION` (`global`), `PHOTO_TAGS_PER_DAY` (`1500`). A file avoids shell quoting problems with the URL and is deleted right after. |

`gcloud run services add-iam-policy-binding SERVICE` (step `invokers`):

- `face-indexer`, `--member=serviceAccount:face-trigger@…`, `--role=roles/run.invoker`: Eventarc calls the private indexer as that account.
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
- `-e VERTEX_PROJECT`, `-e VERTEX_LOCATION`, `-e PHOTO_TAGS_PER_DAY`: tags the photos too, with your ADC (your account needs Vertex AI access in the project).

The backfill runs the same indexer code locally against Atlas, with the same per-photo decisions: photos whose faces and tags are both current are skipped, so it is safe to rerun.

`gcloud run services list --filter="metadata.name~^face-" --format=table(...)` and `gcloud eventarc triggers list --location` (step `status`): `--filter` keeps only the face services, and `--format` prints the name, URL, and live revision.

### Sizing and cost

- **Connections.** Each instance has one `MongoClient` with at most 4 pooled connections (plus pymongo's monitoring connections). With 10 indexers that stays well under an Atlas cluster's connection limit.
- **Bulk uploads.** In local Docker a photo takes about 5 to 7 seconds, almost all of it RetinaFace plus Facenet512 (`timings_ms.analyze`). A bulk upload of 500 photos queues in Eventarc and drains 2 at a time (`MAX_INDEXER_INSTANCES`, kept low to cap what an upload flood can cost), so roughly 20 to 30 minutes; 100 photos take about 5. Raise it if you want it faster; the database has plenty of headroom.
- **Cold start.** The models are in the image (`DEEPFACE_HOME=/opt/deepface`), so a cold start only loads TensorFlow and about 215 MB of weights from local disk, plus one warm-up inference. Expect roughly 10 to 25 seconds; measure it after deploying in the `models loaded` log line.
- **Scale to zero.** The indexer stays at `min-instances=0` because nobody waits on it.

## Operations

- **Logs.** In Logs Explorer, query `resource.labels.service_name="face-indexer" jsonPayload.status="error"`.
- **Re-index after changing `MODEL_NAME`, `DETECTOR_BACKEND` or preprocessing.** Deploy, then run `./deploy.sh backfill`. Documents with a different `model_name`/`detector` are not skipped, so every photo is re-indexed. Search only compares faces from the current model.
- **Add emotions and tags to photos indexed before them.** After deploying this version (image rebuilt so the Emotion weights are baked in, `./deploy.sh iam` for `roles/aiplatform.user`, `./deploy.sh migrate` for the `photo_tags` indexes), run `docker compose build migrate && ./deploy.sh backfill` (it scans `PREFIX=trips/`). Photos with faces and no `attrs_version` are re-run for emotions (their faces are replaced, same boxes and vectors); every photo without tags is tagged. Photos past `PHOTO_TAGS_PER_DAY` are stored as `skipped`; run the backfill again the next day (IST) to finish them. Same for a `TAGS_VERSION` or `ATTRS_VERSION` bump.
- **Photos whose tags failed.** `db.photo_tags.find({ status: { $ne: 'tagged' } }, { object_name: 1, status: 1, error: 1 })`.
- **Photos that failed.** `db.face_photos.find({ status: 'error' }, { object_name: 1, error: 1 })` in mongosh.
