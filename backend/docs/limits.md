# Abuse protection (`src/limits.ts`)

Google sign-in keeps strangers out of trip data, but anyone can make a Google account, and some routes (event and maker questions, sign-in itself) need no account at all. This layer stops one person from running up the bill or taking the app down for everyone else. It runs before every route (`guards` in `src/app.ts`, wired in `src/index.ts`).

## What it does

1. **Edge lock.** With `EDGE_SECRET` set, only requests that came through the Cloudflare Worker reach the routes. The Worker (`deploy/worker/src/index.js`) adds the secret as `X-Edge-Secret` and the visitor's address (`CF-Connecting-IP`) as `X-Client-IP`, replacing whatever a client sent in either header. A request sent straight to the `run.app` address gets `403`, so nobody can go around Cloudflare. Exempt: `/health` (deploy checks) and loopback (the voice worker inside the server calls the API on `127.0.0.1`).
2. **Rate limits** per caller and per IP, in memory on each instance. The caller is the signed-in user (the session token is verified; a forged one counts against the IP), else the IP. A refused request gets `429 RATE_LIMITED` with `Retry-After`. With 4 instances at most, the real ceiling is up to 4× the per-minute numbers.
3. **Daily budgets** (India time), counted in MongoDB (`usage_counters`, one document per counter per day, removed by a TTL index two days later) so all instances share them. If the database is unreachable the count is skipped and the in-memory limits still apply.
4. **Gemini budget.** Every Gemini request in the app goes through `spendGemini` in `src/gemini.ts` (the shared client, and the itinerary draft's own call). Past `GEMINI_CALLS_PER_DAY` it throws a `GeminiError`, and each feature answers with its hand-written fallback for the rest of the day. That degrades the AI features rather than taking the app down, and it caps the worst-case Gemini bill.
5. **Upload size.** Signed GCS upload URLs carry `x-goog-content-length-range` (15 MiB for trip photos and receipts, 6 MiB for selfies and avatars), so GCS refuses a bigger body with `400 EntityTooLarge`. Before this, the size a client claimed when asking for the URL was the only check, and a signed URL would take an object of any size.

## The limits

| Policy | Routes | Limit | Why |
| --- | --- | --- | --- |
| `ip` | all of `/api`, `/auth` | 1200 a minute per IP | Backstop. Generous because a venue or office puts many people behind one address. |
| `client` | all of `/api`, `/auth` | 300 a minute per caller | A busy app session is well under 100. |
| `signin` | `/auth/google/verify`, `/auth/callback`, `/auth/google/callback`, `/auth/dev/login` | 20 a minute per IP | Each one calls Google or mints a session. |
| `reel` | `POST /api/reels/trips/:id` | 4 a minute, 40 a day per caller | Up to 24 photos to the bigger Gemini model: the most expensive call. |
| `ai` | `POST` itinerary draft, hospitality menu, ops advisory draft, event and maker questions | 12 a minute, 200 a day per caller | One Gemini call each. |
| `upload` | `POST /api/trips/:id/uploads`, `POST /auth/uploads` | 300 per 10 minutes, 2000 a day per caller | Bulk uploads of 100 photos are normal; each upload wakes the face indexer. |
| `voice` | `POST /api/voice/session` | 6 a minute, 2 open at once, 30 a day per caller, 300 a day for everyone | A call holds CPU while it lasts and is billed per minute by LiveKit and Gemini Live. |
| Gemini | every Gemini request | 2000 a day for everyone | Caps the bill; features fall back. |

Every number above can be changed with an environment variable (listed in `backend/.env.example`), except the per-minute numbers of `signin`, `reel`, `ai` and `voice`, which are in `defaultPolicies()`.

**A new route that costs money** (Gemini, Maps, voice, uploads) needs a line in `defaultPolicies()`, and its path in the `defaultPolicies cover the routes that cost money` test in `tests/limits.test.ts`.

## Rolling out

The order matters. Shipping the code before step 1 breaks photo and selfie uploads in browsers, and setting `EDGE_SECRET` on the server before the Worker sends it refuses every request.

1. **Bucket CORS.** Browsers must be allowed to send the new upload header. Add `x-goog-content-length-range` to the bucket's CORS `responseHeader` list:
   ```bash
   gcloud storage buckets describe gs://ghoomates --format='json(cors_config)'    # current config
   # write it to cors.json with "x-goog-content-length-range" added to responseHeader, then:
   gcloud storage buckets update gs://ghoomates --cors-file=cors.json
   ```
2. **Worker.** Generate a secret (`openssl rand -hex 32`), put it on the Worker `ghoommates-proxy` as `EDGE_SECRET` (`cf workers secrets update`), and deploy the Worker code that sends it (`cf deploy` in `deploy/worker`). Then check the secret is still listed (`cf workers secrets list`), because CI redeploys the Worker on every push.
3. **Server.** Put the same value in `backend/.env` as `EDGE_SECRET`, then run `deploy/secrets.sh` and a full `deploy/cloudrun.sh` (a CI `release` never changes secrets). Its final check asks for `/auth/config` through the domain, which fails if the Worker and the server disagree on the secret.

To check: `curl -i https://ghoommates-449943395156.asia-south1.run.app/auth/config` answers `403`, and `https://ghoommates.sourabh.org/auth/config` answers `200`.

Without `EDGE_SECRET` the code still works, but the rate limits see Cloudflare's addresses instead of visitors', and the server logs a warning at startup.

## Outside the code

Spending caps the code cannot set:

- **Cloud Run** `--max-instances` (web 4, face-indexer 10) is the hard ceiling for compute.
- **Gemini API key** (`GEMINI_API_KEY`, billed outside this project's billing account): restrict the key to the Generative Language API, lower its requests-per-day quota, and set a budget alert on the account that pays for it.
- **Billing budget alert** for this project: `gcloud billing budgets create`. It alerts and does not cap.
- **Cloudflare rate limiting rule** on `ghoommates.sourabh.org/api/*` and `/auth/*` per IP. It runs before the Worker, so a flood also doesn't use up the Worker's daily request allowance.
- **LiveKit**: the project's plan caps agent minutes.
