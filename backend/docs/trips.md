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
| GET | `/api/trips/:id/photos/find-me/status` | How far the face-indexer has got with your selfie: `none`, `processing`, `ready`, `no_face` or `error` |
| POST | `/api/trips/:id/photos/find-me` | Selfie search: the album photos that contain the person in the selfies |
| POST | `/api/trips/:id/photos/find` | Photo search by filter: `{ userIds, match, expression?, scene? }` (chips, GhoomMate) |
| POST | `/api/trips/:id/photos/search` | Photo search by sentence: `{ query }`, e.g. "show me all photos where I was smiling" |
| GET | `/api/trips/:id/squad` | Squad insights from the Vibe Swipe answers (see Squad insights). Free: no Gemini |
| GET / PUT | `/api/trips/:id/itinerary` | Days and stops with RSVPs, plus `stale` and `pending` / replace the whole plan |
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
gcloud storage buckets update gs://ghoomates --cors-file=cors.json   # GET/PUT/HEAD from the app origin; responseHeader must include x-goog-content-length-range (limits.md)
gcloud iam service-accounts keys create key.json --iam-account=ghoomates-storage@<project>.iam.gserviceaccount.com
base64 < key.json | tr -d '\n'   # → GCS_CREDENTIALS_BASE64 in backend/.env; then delete key.json
```

## Squad data (`src/trips/squad.ts`)

The squad route and the itinerary read the same data through `loadSquad`: every trip member (in joining order) with their first name (made unique with a last initial or a number), colour, picture and taste, and the trip's `pref_answers` (`scope` = the trip id). The shapes are the Vibe Swipe contract in `src/prefs/contract.ts`; the trips module reads only `pref_answers` and `users.preferences`.

- **Taste.** `users.preferences.taste` when it is a valid `StoredTaste` with at least one answer. Otherwise a complete legacy `preferences.vibe` (six numbers from the old quiz), read as about four cards' worth of evidence (confidence 0.5). Otherwise the member has no data: they are left out of the maths and listed in `pending`. Generating never waits for everyone.
- **Deal-breakers and diet** count for every member, with or without quiz data, because they are safety constraints. A GhoomMate note with `noEarlyStarts: true` counts as the `early-starts` deal-breaker; the diet falls back to `preferences.diet`.

**Privacy rule.** Names appear only on likes and loves. Who said no (a nope swipe or a deal-breaker) is never attributed in any response or why-line: card tallies keep nopes as a count only, deal-breakers come out as one anonymous list, and the group-rule labels never name the member who set them. A Gemini `why` that names a member next to a negative word ("hates", "said no", …) is dropped.

### Group rules

Only members whose `styleConfidence` on a dimension is at least 0.2 vote on it; with no votes the value is 0.5 and the label says it is a default.

| Dimension | Rule | Effect |
| --- | --- | --- |
| `mornings` | least misery (min) | Group start = 10:30 AM − 4 h × value, on the half hour (0 → 10:30, 0.5 → 8:30, 1 → 6:30); never before 8:30 AM with an `early-starts` deal-breaker |
| `budget`, `walking`, `crowds` | least misery (min) | Wording in the prompt |
| `pace` | median | Slots per day = 3 + round(2 × value); also the spotlights per day |
| `together` | mean | SPLIT or free slots allowed a day: 1 (≥ 0.67), 2 (≥ 0.34) or 3 |
| `eco` | most pleasure (max) | At 0.6 or more: walking, e-rickshaws and local family-run places |

The diet is the strictest in the squad (`non-veg` < `eggetarian` < `veg` < `vegan` < `jain`), and every meal stop must suit it.

### Trip cards

Per trip card (style cards and non-swipe replies are left out; a member's latest answer counts): likes L, loves V, nopes N, non-skip answers A, members with data M, and predicted likes P (members with data who didn't answer and whose vibe fits the card at 0.65 or more, fit = Σ weight × vibe / Σ weight). `score = (L + 2V + 0.5P − 2N) / M`.

- **Must-dos:** someone loved it (fans = the lovers). They become spotlights.
- **Consensus:** nobody said no, at least half of those who answered liked or loved it, and at least one answer. Sorted by score; whole-group picks.
- **Contested:** fans and at least one no. Split-slot material for its fans only.

### Squad insights

`GET /api/trips/:id/squad` (members only, else `404`) returns `SquadInsights` from `src/prefs/contract.ts`: `members` (with `vibe`, `confidence`, `coreDone` = has swiped the core deck, `tripAnswered` = non-skip answers to this trip's cards, `isMe`), `pending`, per-axis `axes` (mean, min, max, class), `sharedLoves`, `splits`, `vetoes`, `style` (value, rule and label per dimension), `diet`, `dealbreakers`, `mustDos`, `consensus`, `contested`, `twin` (the mate closest to you: 1 − mean absolute difference, as a percentage) and `squadPersona` ("The Hungry Explorers").

Deleting a trip or removing a member should also delete their `pref_answers`: `deleteTripAnswers(db, tripId, userId?, session?)` does it inside the caller's transaction. The trips module has no trip-delete or leave route yet.

## Itinerary drafts

`POST /itinerary/draft` sends the destination, dates (or flexible length), budget, chosen tweaks and a squad brief built from the members' Vibe Swipe tastes to Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) with a JSON response schema. It is still exactly one Gemini call per draft (through `spendGemini`). Each day has a title and time slots; each slot lists the suggested stop first and alternatives the app can swap to. Sharing the draft (`PUT /itinerary`) saves the picked stops.

The prompt adds two blocks to the squad brief:

- **Group constraints:** the start time, slots per day, budget, walking and crowd wording, how many SPLIT or free slots `together` allows, the eco ask, the diet, and each deal-breaker as a whole-group rule (`water`: no swimming, snorkelling or kayaking; `heights`: no paragliding, ziplines or steep climbs; `early-starts`: nothing before 8:30 AM; `late-nights`: wrap by 10 PM; `long-drives`: no leg over 90 minutes; `crowds`: quiet windows only; `spicy`: point out mild options). Only dimensions someone swiped on are stated.
- **Squad shortlist:** the top 8 consensus cards with their ids and "N of A liked", each member's must-dos ("for Riya: …") and contested cards as split-slot material for their fans. Gemini uses them first, at their area and start time, and sets `card` to the shortlist id.

Gemini also writes a `why` (at most 100 characters) per option. After it answers, `card` is kept only if it is a shortlist id, and each stop's `why` is settled by `explainDraft`:

1. A shortlisted card: "Riya’s must-do" / "Riya and Kabir’s must-do" / "Riya, Kabir +2’s must-do"; "Everyone’s in · 4 of 4 liked" when every member with data answered and liked it; else "Liked by Riya and Kabir".
2. Otherwise Gemini's why, trimmed to 120 characters (dropped if it blames someone).
3. Otherwise one derived from `forMembers` and the axis: "Picked for Riya · food".

**Fallbacks:** Gemini → `shortlistDraft` (Udaipur and Goa, when at least three shortlisted cards have a start time) → `udaipurDraft` / `templateDraft`. `shortlistDraft` places must-dos and consensus cards across the days at their own start times, with a second option where another pick starts within 90 minutes. Day 1 starts with check-in and the last day ends with heading home; lunch and dinner at local family-run places suit the squad's diet; it honours the group start time, slots per day, `late-nights`, `water`, `heights` and `long-drives`. `source` is `gemini`, `shortlist` or `template`. `withFairness` and `rebalance` run on all of them.

The draft response adds `basis: { answered, total, pending }`: members with data, all members, and the first names still to swipe.

### Stop why-fields

Draft stops, `PUT /itinerary`, `POST /stops` and `PATCH /stops/:stopId` take these optional fields:

| Field | Validation | Stored as |
| --- | --- | --- |
| `axis` | one of the six axes, `group` or `null` | `axis` |
| `forMembers` | up to 10 strings of at most 40 characters | `for_members` |
| `split` | boolean | `split` |
| `why` | at most 120 characters | `why` |
| `cardId` | at most 80 characters | `card_id` |

`GET /itinerary` returns them on every stop as `axis`, `forMembers`, `split`, `why`, `cardId` (defaults `null`, `[]`, `false`, `null`, `null`). A `PATCH` that leaves a field out keeps the stored value, so the app's edit form doesn't wipe them.

`GET /itinerary` is `{ days, stale, pending }`. `PUT /itinerary` sets `trips.itinerary_generated_at`. `stale` is true when there are stops and either a member's `preferences.taste.updatedAt` is later than `itinerary_generated_at`, or the plan was never shared from a draft and someone has swiped. The app uses it for a "swipes changed, regenerate?" nudge. `pending` lists the first names of members without quiz data.

### Group-fair personalisation (`src/trips/vibe.ts`)

Averaging quiz scores flattens a split squad (two thrill-seekers and two chillers average to "medium everything"), so the draft keeps the group's shape instead:

1. **Squad profile.** Each of the six axes gets a class: `love` (mean ≥ 0.65, spread < 0.35), `split` (spread ≥ 0.45), `veto` (someone below 0.2 and nobody at 0.65 or more) or `neutral`. Members are weighted by how sure we are of each axis (the swipe quiz's confidence, at least 0.15) in the mean, and only members with confidence of 0.25 or more set the min, max and spread (everyone does if nobody is that sure). Without confidence every member counts fully.
2. **Spotlights.** Each day gets up to one spotlight slot per member, leaving room for logistics (slots per day come from the group's pace). The member with the fewest spotlights so far picks next, using their top axis; everyone else who loves that axis shares the slot. A `split` axis becomes a **split slot**: option 1 is for the fans and option 2, at the same time and nearby, is for everyone else, so the squad splits up and regroups. The brief also tells Gemini about shared loves and about anyone who dislikes an axis, so it never puts that axis in a whole-group slot.
3. **Fairness post-check.** After Gemini answers (or on the template fallback), `rebalance` swaps a whole-group slot's pick and alternative when that demotes something a member dislikes, or lifts the least-served member's score without costing the group more than 0.05 on average. Each member's score is their mean quiz score over the stops they'd do (spotlights count ×1.5; in a split slot they take whichever option suits them).

Stops add `axis`, `forMembers` (first names), `split`, `why` and `cardId`. The response adds `fairness: { members: [{ name, score, spotlights }], min, mean }` and `squad: { sharedLoves, splits, vetoes }`; both are `null` when nobody has taken the quiz. Sharing a split slot saves both options as stops at the same time, each with a "Split plan for …" note.

## Data

MongoDB collections; indexes are in `src/schema.ts` and created on startup. `_id` is a UUID string except where noted.

```text
trips             _id, name, group_name, destination, start_date, end_date, budget, cover, details, day_titles,
                  itinerary_generated_at, invite_code, expense_group_id → groups, created_by → users
trip_members      _id (ObjectId), trip_id, user_id, ledger_member_id → group_members, role (organiser | mate)
trip_photos       _id, trip_id, uploaded_by, object_key, content_type, size_bytes, width, height, caption
                  (face_photos, faces, selfie_faces and photo_tags are written by cloud/faces, keyed by object_name)
trip_stops        _id, trip_id, day_number, time, minutes, title, tag, place, notes, axis, for_members, split, why,
                  card_id, created_by
pref_answers      written by the prefs module; read here by scope = trip id (see Squad data)
trip_stop_rsvps   _id (ObjectId), stop_id, user_id, rsvp
expenses          + category, receipt_key, created_by
```

The arrows are references checked in code, not foreign keys. Deleting stops goes through `deleteStopsCascade` (`src/trips/itinerary.ts`), which stands in for the old `ON DELETE` cascades: it removes the stops' RSVPs and impact legs and unlinks (`$unset stop_id`) maker bookings and hospitality reservations, inside the caller's transaction.

## Tests

`npm test` covers date changes (`tests/trips/dates.test.ts`), the stop-delete cascade (`tests/trips/cascade.test.ts`), group-fair maths (`tests/trips/vibe.test.ts`), squad rules, consensus, privacy, why-lines and the shortlist plan (`tests/trips/squad.test.ts`), the app's date maths (`tests/trips/tripDates.test.ts`, which runs `frontend/src/data/tripDates.ts`, a plain file with no imports) and the end-to-end suite (`tests/trips/api.test.ts`). They run against an in-process MongoDB (`tests/mongo.ts`), a fresh database per test file, so no external database is needed. To run just this module:

```bash
npm run test:trips
```

The end-to-end suite runs create → invite → join → expenses → settle → photo/receipt upload (local storage), the itinerary draft/save/RSVP flow, squad insights, a shortlist draft from a partial squad, the why-fields round trip, `stale`, and the `pref_answers` cascade. It unsets `GEMINI_API_KEY`, so no draft calls the network.

## Face matching

A Python service under `cloud/` indexes every photo uploaded under `trips/<tripId>/photos/` into the `face_photos` and `faces` collections (same database; their indexes are created by `cloud/faces/migrate.py`, not by the backend). `face_photos.object_name` equals `trip_photos.object_key`. If those collections are still empty, the album still works and every photo reports `pending`.

`GET /api/trips/:id/photos` adds, per item, `faces: { status: 'pending' | 'indexed' | 'no_faces' | 'error', count }` (no `face_photos` document means `pending`, count 0), and at the top level `faceSummary: { indexed, noFaces, pending, failed, faces }` counted over the whole trip (`faces` is the sum of face counts).

`POST /api/trips/:id/photos/find-me` (members only, no body) searches with the signed-in user's profile selfie (`users.selfie_key`). The selfie is embedded once, when it is uploaded: the face-indexer writes its 512-float vector to `selfie_faces` (keyed by `object_name` = the selfie key), and find-me runs an Atlas Vector Search (`$vectorSearch` on the `faces_embedding` index of `faces`) with that vector, in `backend/src/trips/faces.ts`. No face detection or embedding runs in the backend. The search is filtered to the trip and to the selfie's own `model_name` and `detector`, takes the k nearest faces (k starts at 500 and doubles while every one of them is a match, up to Atlas's cap of 10000, which sets `truncated`), keeps those under the match threshold and groups them by photo. `cloud/faces/store.py` has the same search, tested against Atlas local; keep the two in step. If the vector isn't there yet (the upload event is still in flight), find-me answers `409 SELFIE_PROCESSING`. The app avoids that: it polls `GET /api/trips/:id/photos/find-me/status` every couple of seconds, shows a progress ring around the selfie while the status is `processing` (a cold indexer takes ~40 s to load its models; a warm one ~4 s), and enables Find me once it is `ready`.

```json
{ "matches": [ { "photoId": "uuid", "distance": 0.21, "width": 4000, "height": 3000,
                 "faces": [ { "x": 120, "y": 80, "w": 200, "h": 200, "distance": 0.21 } ] } ],
  "threshold": 0.4, "truncated": false }
```

Matches are sorted by distance ascending. Face boxes are in original image pixels. Matches whose photo is not registered in `trip_photos` are dropped.

| Status | Code | When |
| --- | --- | --- |
| 409 | `NO_SELFIE` | The user has no selfie |
| 409 | `SELFIE_PROCESSING` | The face-indexer hasn't embedded the selfie yet; retry in a few seconds |
| 422 | `NO_FACE`, `INVALID_IMAGE` | The indexer found no face in the selfie, or couldn't read it |
| 503 | `FACE_SEARCH_UNAVAILABLE` | The vector search failed: Atlas unreachable, or no `faces_embedding` index (a plain local MongoDB, or `cloud/faces/migrate.py` not run) |

`FACE_MATCH_THRESHOLD` (default `0.40`) is the cosine distance under which a face counts as a match. Keep it equal to `MATCH_THRESHOLD` in `cloud/`.

## Photo search

Search the album by who is in a photo, their expression and the scene. Code: `src/trips/photoSearch.ts` (pure parsing and combining) and `findPhotos` / `searchPhotos` in `src/trips/service.ts`.

```ts
type PhotoFilter = { userIds: string[]; match: 'any' | 'all'; expression?: 'happy' | 'neutral' | 'surprise' | 'sad' | 'angry' | 'fear' | 'disgust'; scene?: string }
```

- **People.** Any trip member can be searched for, not only you, as long as their profile selfie has been read (`selfie_faces`). Each person runs the same vector search as find-me with their own selfie vector. `any` keeps photos with at least one of them, sorted by how many are in it; `all` keeps photos with every one of them. Up to 12 people. A user id that isn't a member is `400 NOT_A_MEMBER`.
- **Expressions.** The face-indexer stores `emotion` (DeepFace's dominant emotion) and `smile` (its happy score, 0–1) on every `faces` document. With people, the expression must be on that person's own face. Without people, any face counts. `happy` also matches `smile >= 0.5`.
- **Scenes.** The face-indexer asks Gemini flash-lite for a caption and 5–12 lowercase tags per photo (activity, place, occasion, time of day) and stores them in `photo_tags` (`{ object_name, trip_id, status: 'tagged' | 'error' | 'skipped', caption, tags }`). A scene first matches the trip's own tags by word stems ("hike" finds `hiking`, "haldi event" finds `haldi`). Only when no tag matches does one Gemini lite call pick related tags from the trip's tags ("climbing" finds `trek`). It also matches the tagger's caption and the uploader's caption when every scene word is in them. A scene is intersected with the people and expression results.
- **Missing selfies.** People without a searchable selfie are listed in `skipped: [{ userId, name, status }]` and the rest are still searched. Only when nobody asked for can be searched is it an error: `409 SELFIE_PROCESSING` (one person, still being read) or `409 NO_SELFIE`.

`/photos/search` turns the sentence into a filter with one Gemini lite call that knows the members and the trip's tags. When Gemini is off, over budget or fails, a keyword parser takes over: names (full, first or username, possessive `'s` dropped), "me / my / I", "with / together / both" for `all`, smiling, laughing, serious, surprised, and the leftover words as the scene. A sentence with nothing usable is `404 NOT_IN_TRIP`.

```json
{ "filter": { "userIds": ["usr_…"], "match": "any", "expression": "happy", "scene": "hiking" },
  "label": "You · smiling · hiking",
  "photoIds": ["uuid"], "matches": [ … same shape as find-me … ],
  "sceneTags": ["hiking", "trek"], "skipped": [], "truncated": false,
  "query": "…", "unmatched": ["Rahul"] }
```

`query` and `unmatched` (names in the sentence that are not trip members) only come back from `/photos/search`. In `label` the caller is "You" and others go by first name.

`GET /api/trips/:id` gives each member `selfie: 'ready' | 'processing' | 'none'`, so the app can grey out people who can't be found yet. `GET /api/trips/:id/photos` gives each item `tags` and `sceneCaption` (from `photo_tags`) for the scene chips and the photo viewer.

Photos indexed before emotions and tags existed get them from a backfill: `PREFIX=trips/ python cloud/faces/backfill.py` re-runs only the missing part for each photo.

