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
| GET / PATCH | `/api/trips/:id` | Trip detail (members, invite code and URL) / update name, dates, destination, … (see Changing dates) |
| GET | `/api/trips/:id/summary` | Balances, suggested transfers, totals by category |
| GET / POST | `/api/trips/:id/expenses` | List / add an expense |
| GET / POST | `/api/trips/:id/settlements` | List / record a payment you sent or received |
| POST | `/api/trips/:id/uploads` | `{ kind: photo \| receipt, contentType }` → `{ key, upload: { url, method, headers } }` |
| GET / POST | `/api/trips/:id/photos` | List the album (signed read URLs, face index status) / register uploaded keys |
| POST | `/api/trips/:id/photos/find-me` | Selfie search: the album photos that contain the person in the selfies |
| GET / PUT | `/api/trips/:id/itinerary` | Days and stops with RSVPs / replace the whole plan |
| POST | `/api/trips/:id/itinerary/draft` | Suggested plan (`{ day? }` for one day); nothing is saved |
| POST / PATCH / DELETE | `/api/trips/:id/stops[/:stopId]` | Add / edit / remove a stop |
| PUT | `/api/trips/:id/stops/:stopId/rsvp` | `{ rsvp: going \| maybe \| skip }`. A member who hasn't answered counts as going; `answered` on the stop says whether you have |

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

## Changing dates

`PATCH /api/trips/:id` with `{ "startDate": "2026-11-01", "endDate": "2026-11-04" }` (YYYY-MM-DD, real calendar days, end on or after start; send `null` to clear). Only fields present in the body change, and the response is the trip detail plus `movedStops`.

- **Organiser only.** A mate who sends different dates gets `403 FORBIDDEN`; renaming and the other fields stay open to every member, and re-sending the current dates is a no-op.
- **A shorter trip keeps its stops.** If the new length (`tripLength`: the date range, else the flexible length from the create flow, else 3; capped at 14) is below the old one, stops planned for days that no longer exist move to the new last day, keeping their times, and the day titles are cut to the new length. The dates and the moved stops are saved in one transaction, and `movedStops` says how many moved so the app can tell the user.
- **A longer trip or shifted dates** move nothing: new days start empty, and stops stay on their day numbers, so Day 1 simply lands on the new start. Crowd forecasts are computed from the day's date, so they follow the new dates on the next itinerary read.
- Trip status (live, upcoming, past) is not stored. The app derives it from the dates and today's date in India (UTC+5:30), so a trip is live on every day from its start to its end, both included.

## Uploads

Uploads go browser → bucket, never through the backend:

1. `POST /uploads` returns a signed `PUT` URL (15 minutes) and an object key under `trips/<tripId>/photos/` or `/receipts/`.
2. The browser `PUT`s the file to that URL with the returned `Content-Type`.
3. `POST /photos { photos: [{ key, width, height }] }` (or an expense's `receiptKey`) attaches it. The backend checks the object exists and belongs to the trip.

Reads use signed `GET` URLs valid for 12 hours (reused for 6, so browsers can cache them). Profile selfies are uploaded the same way, to `users/<userId>/selfies/` (see [auth.md](auth.md#selfie-and-profile-photo)).

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

`POST /itinerary/draft` sends the destination, dates (or flexible length), budget, chosen tweaks and a squad brief built from every member's personality-quiz scores (`users.preferences.vibe`) to Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) with a JSON response schema. Each day has a title and time slots; each slot lists the suggested stop first and alternatives the app can swap to. Sharing the draft (`PUT /itinerary`) saves the picked stops.

### Group-fair personalisation (`src/trips/vibe.ts`)

Averaging quiz scores flattens a split squad (two thrill-seekers and two chillers average to "medium everything"), so the draft keeps the group's shape instead:

1. **Squad profile.** Each of the six axes gets a class: `love` (mean ≥ 0.65, spread < 0.35), `split` (spread ≥ 0.45), `veto` (someone below 0.2 and nobody at 0.65 or more) or `neutral`.
2. **Spotlights.** Each day gets up to one spotlight slot per member, leaving room for logistics. The member with the fewest spotlights so far picks next, using their top axis; everyone else who loves that axis shares the slot. A `split` axis becomes a **split slot**: option 1 is for the fans and option 2, at the same time and nearby, is for everyone else, so the squad splits up and regroups. The brief also tells Gemini about shared loves and about anyone who dislikes an axis, so it never puts that axis in a whole-group slot.
3. **Fairness post-check.** After Gemini answers (or on the template fallback), `rebalance` swaps a whole-group slot's pick and alternative when that demotes something a member dislikes, or lifts the least-served member's score without costing the group more than 0.05 on average. Each member's score is their mean quiz score over the stops they'd do (spotlights count ×1.5; in a split slot they take whichever option suits them).

Stops add `axis`, `forMembers` (first names) and `split`. The response adds `fairness: { members: [{ name, score, spotlights }], min, mean }` and `squad: { sharedLoves, splits, vetoes }`; both are `null` when nobody has taken the quiz. Sharing a split slot saves both options as stops at the same time, each with a "Split plan for …" note.

## Data

MongoDB collections; indexes are in `src/schema.ts` and created on startup. `_id` is a UUID string except where noted.

```text
trips             _id, name, group_name, destination, start_date, end_date, budget, cover, details, day_titles,
                  invite_code, expense_group_id → groups, created_by → users
trip_members      _id (ObjectId), trip_id, user_id, ledger_member_id → group_members, role (organiser | mate)
trip_photos       _id, trip_id, uploaded_by, object_key, content_type, size_bytes, width, height, caption
trip_stops        _id, trip_id, day_number, time, minutes, title, tag, place, notes, created_by
trip_stop_rsvps   _id (ObjectId), stop_id, user_id, rsvp
expenses          + category, receipt_key, created_by
```

The arrows are references checked in code, not foreign keys. Deleting stops goes through `deleteStopsCascade` (`src/trips/itinerary.ts`), which stands in for the old `ON DELETE` cascades: it removes the stops' RSVPs and impact legs and unlinks (`$unset stop_id`) maker bookings and hospitality reservations, inside the caller's transaction.

## Tests

`npm test` covers date changes (`tests/trips/dates.test.ts`), the stop-delete cascade (`tests/trips/cascade.test.ts`), the app's date maths (`tests/trips/tripDates.test.ts`, which runs `frontend/src/data/tripDates.ts`, a plain file with no imports) and the end-to-end suite (`tests/trips/api.test.ts`). They run against an in-process MongoDB (`tests/mongo.ts`), a fresh database per test file, so no external database is needed. To run just this module:

```bash
npm run test:trips
```

The end-to-end suite runs create → invite → join → expenses → settle → photo/receipt upload (local storage) and the itinerary draft/save/RSVP flow.

## Face matching

A Python service under `cloud/` indexes every photo uploaded under `trips/<tripId>/photos/` into the `face_photos` and `faces` collections (same database; their indexes are created by `cloud/faces/migrate.py`, not by the backend). `face_photos.object_name` equals `trip_photos.object_key`. If those collections are still empty, the album still works and every photo reports `pending`.

`GET /api/trips/:id/photos` adds, per item, `faces: { status: 'pending' | 'indexed' | 'no_faces' | 'error', count }` (no `face_photos` document means `pending`, count 0), and at the top level `faceSummary: { indexed, noFaces, pending, failed, faces }` counted over the whole trip (`faces` is the sum of face counts).

`POST /api/trips/:id/photos/find-me` (members only, no body) searches with the signed-in user's profile selfie (`users.selfie_key`). The selfie is embedded once, when it is uploaded: the face-indexer writes its 512-float vector to `selfie_faces` (keyed by `object_name` = the selfie key), and find-me sends only that vector to `face-search`, which skips detection and embedding and runs just the vector search. If the vector isn't there yet (the upload event is still in flight, or no indexer runs locally), the backend reads the selfie from storage, has `face-search` embed it, and stores the vector with `generation: 0`, which the indexer's own result later replaces.

```json
{ "matches": [ { "photoId": "uuid", "distance": 0.21, "width": 4000, "height": 3000,
                 "faces": [ { "x": 120, "y": 80, "w": 200, "h": 200, "distance": 0.21 } ] } ],
  "threshold": 0.4, "truncated": false }
```

Matches are sorted by distance ascending. Face boxes are in original image pixels. Matches whose photo is not registered in `trip_photos` are dropped.

| Status | Code | When |
| --- | --- | --- |
| 409 | `NO_SELFIE` | The user has no selfie (or its object is gone) |
| 413 | `SELFIE_TOO_LARGE` | Selfie too large for face-search |
| 422 | `NO_FACE`, `INVALID_IMAGE` | No face found in the selfie (as recorded by the indexer) or unreadable image |
| 503 | `FACE_SEARCH_DISABLED` | `FACE_SEARCH_URL` is not set |
| 503 | `FACE_SEARCH_UNAVAILABLE` | Network error, timeout (90 s, covers a cold start) or a 5xx |

`FACE_SEARCH_URL` is the face-search base URL. Local `http://localhost` or `http://127.0.0.1` URLs are called without auth; any other URL gets a Google ID token (audience = the URL) minted from `GCS_CREDENTIALS_BASE64`, whose service account needs `roles/run.invoker` on the service.
