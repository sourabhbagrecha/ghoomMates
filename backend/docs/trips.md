# Trips module

User-facing trip groups, mounted at `/api/trips/*` (`src/trips/`). Members are signed-in users. Each trip owns one expense ledger group (`src/expenses/`), and every trip member is a ledger member, so splitting, balances and settlements reuse the ledger's integer-paise maths, transactions and idempotency.

Needs only the database. Photos and receipts need media storage (GCS, or local disk as a fallback). Itinerary drafts use Gemini when `GEMINI_API_KEY` is set and fall back to a template plan otherwise.

## Auth

Every route except the invite preview needs `Authorization: Bearer <session token>`, the JWT from `/auth/*`. Non-members get `404` for a trip, so trip ids don't leak.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/trips` | Your trips, with members, your balance, photo count and total spent |
| POST | `/api/trips` | Create a trip. You become its organiser. |
| GET | `/api/trips/invites/:code` | Public invite preview (works signed out) |
| POST | `/api/trips/join` | `{ code }`: join a trip. Joining twice is a no-op. |
| GET / PATCH | `/api/trips/:id` | Trip detail (members, invite code and URL) / update name, dates, destination, … |
| GET | `/api/trips/:id/summary` | Balances, suggested transfers, totals by category |
| GET / POST | `/api/trips/:id/expenses` | List / add an expense |
| GET / POST | `/api/trips/:id/settlements` | List / record a payment you sent or received |
| POST | `/api/trips/:id/uploads` | `{ kind: photo \| receipt, contentType }` → `{ key, upload: { url, method, headers } }` |
| GET / POST | `/api/trips/:id/photos` | List the album (signed read URLs, face index status) / register uploaded keys |
| POST | `/api/trips/:id/photos/find-me` | Selfie search: the album photos that contain the person in the selfies |
| GET / PUT | `/api/trips/:id/itinerary` | Days and stops with RSVPs / replace the whole plan |
| POST | `/api/trips/:id/itinerary/draft` | Suggested plan (`{ day? }` for one day); nothing is saved |
| POST / PATCH / DELETE | `/api/trips/:id/stops[/:stopId]` | Add / edit / remove a stop |
| PUT | `/api/trips/:id/stops/:stopId/rsvp` | `{ rsvp: going \| maybe \| skip }` |

Errors use the shared `{ "error": { "code", "message" } }` envelope.

### Expenses

```json
{
  "description": "Beach-shack dinner",
  "amountPaise": 90000,
  "payerMemberId": "<memberId>",
  "category": "food",
  "split": { "type": "equal", "participants": [{ "memberId": "<a>" }, { "memberId": "<b>" }] },
  "receiptKey": "trips/<tripId>/receipts/<uuid>.jpg"
}
```

`memberId`s are the ledger member ids from the trip's `members`. Splits are `equal` or `exact` (each `value` in paise, summing to `amountPaise`); categories are `food`, `stays`, `travel`, `fun`, `other`. Send an `Idempotency-Key` header so a retried save is recorded once. Settlements are recorded as manually confirmed (`verification: manual`); there is no UPI provider integration.

## Uploads

Uploads go browser → bucket, never through the backend:

1. `POST /uploads` returns a signed `PUT` URL (15 minutes) and an object key under `trips/<tripId>/photos/` or `/receipts/`.
2. The browser `PUT`s the file to that URL with the returned `Content-Type`.
3. `POST /photos { photos: [{ key, width, height }] }` (or an expense's `receiptKey`) attaches it. The backend checks the object exists and belongs to the trip.

Reads use signed `GET` URLs valid for 12 hours (reused for 6, so browsers can cache them). Selfies saved through `/auth/profile` are also copied to `users/<userId>/selfie.<ext>` for the face pipeline. The future face-detection function can trigger on `trips/*/photos/*` uploads.

Storage (`src/storage.ts`):

- **GCS** when `GCS_BUCKET` and `GCS_CREDENTIALS_BASE64` (a base64 service account JSON key) are set. URLs are signed locally with the key; no gcloud or ADC at runtime.
- **Local disk** otherwise: files in `backend/uploads/`, served by `/api/media/*` with HMAC-signed, expiring URLs. Same client flow.

Check the configured storage end to end with `npm run test:media` (writes one object under `healthcheck/`).

### GCP setup (done once, with gcloud)

```bash
gcloud iam service-accounts create ghoomates-storage
gcloud storage buckets add-iam-policy-binding gs://ghoomates \
  --member=serviceAccount:ghoomates-storage@<project>.iam.gserviceaccount.com --role=roles/storage.objectAdmin
gcloud storage buckets update gs://ghoomates --cors-file=cors.json   # GET/PUT/HEAD from the app origin
gcloud iam service-accounts keys create key.json --iam-account=ghoomates-storage@<project>.iam.gserviceaccount.com
base64 < key.json | tr -d '\n'   # → GCS_CREDENTIALS_BASE64 in backend/.env; then delete key.json
```

## Itinerary drafts

`POST /itinerary/draft` sends the destination, dates (or flexible length), budget, chosen tweaks and every member's personality-quiz scores (`users.preferences.vibe`) to Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) with a JSON response schema. Each day has a title and time slots; each slot lists the suggested stop first and alternatives the app can swap to. Sharing the draft (`PUT /itinerary`) saves the picked stops.

## Data

Migrations `003_trips.sql` and `004_itinerary.sql`:

```text
trips             id, name, group_name, destination, start_date, end_date, budget, cover, details, day_titles,
                  invite_code, expense_group_id → groups, created_by → users
trip_members      trip_id, user_id, ledger_member_id → group_members, role (organiser | mate)
trip_photos       id, trip_id, uploaded_by, object_key, content_type, size_bytes, width, height, caption
trip_stops        id, trip_id, day_number, time, minutes, title, tag, place, notes, created_by
trip_stop_rsvps   stop_id, user_id, rsvp
expenses          + category, receipt_key, created_by
```

## Tests

```bash
DATABASE_URL=<…/ghoomates_test> npm run test:trips
```

Runs create → invite → join → expenses → settle → photo/receipt upload (local storage) and the itinerary draft/save/RSVP flow against a real database. It leaves test rows behind, so point it at `ghoomates_test`.

## Face matching

A Python service under `cloud/` indexes every photo uploaded under `trips/<tripId>/photos/` into `face_photos` and `faces` (same database, created by the cloud migration, not by the backend). `face_photos.object_name` equals `trip_photos.object_key`. If those tables do not exist yet, the album still works and every photo reports `pending`.

`GET /api/trips/:id/photos` adds, per item, `faces: { status: 'pending' | 'indexed' | 'no_faces' | 'error', count }` (no `face_photos` row means `pending`, count 0), and at the top level `faceSummary: { indexed, noFaces, pending, failed, faces }` counted over the whole trip (`faces` is the sum of face counts).

`POST /api/trips/:id/photos/find-me` (members only) takes `{ "selfies": [dataUrlOrBase64, ...] }` with 1 to 3 JPEG, PNG or WebP images. It has its own 25 MiB JSON limit and still requires `Content-Type: application/json`. Selfies are forwarded to `face-search` in memory and never logged or stored.

```json
{ "matches": [ { "photoId": "uuid", "distance": 0.21, "width": 4000, "height": 3000,
                 "faces": [ { "x": 120, "y": 80, "w": 200, "h": 200, "distance": 0.21 } ] } ],
  "threshold": 0.4, "truncated": false }
```

Matches are sorted by distance ascending. Face boxes are in original image pixels. Matches whose photo is not registered in `trip_photos` are dropped.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Not 1 to 3 image strings (or the code face-search returns for 400) |
| 413 | `SELFIE_TOO_LARGE` | Selfie too large for face-search |
| 422 | `NO_FACE`, `INVALID_IMAGE` | No face found or unreadable image, with face-search's message |
| 503 | `FACE_SEARCH_DISABLED` | `FACE_SEARCH_URL` is not set |
| 503 | `FACE_SEARCH_UNAVAILABLE` | Network error, timeout (90 s, covers a cold start) or a 5xx |

`FACE_SEARCH_URL` is the face-search base URL. Local `http://localhost` or `http://127.0.0.1` URLs are called without auth; any other URL gets a Google ID token (audience = the URL) minted from `GCS_CREDENTIALS_BASE64`, whose service account needs `roles/run.invoker` on the service.
