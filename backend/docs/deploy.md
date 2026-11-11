# Deploying GhoomMates on Google Cloud Run

One image, two Cloud Run services, both scaling to zero when nobody is using the app: the **web service** runs the Express API and the built React app, billed only while it handles requests; the **voice agent service** runs the GhoomMate worker, and the web service wakes it when someone opens a chat. Everything else (MongoDB Atlas, the photo bucket, face indexing, Vertex AI, LiveKit) already exists and is only wired in.

Short version, from the repo root, with `gcloud` signed in as a project owner and `backend/.env` filled in:

```bash
deploy/secrets.sh          # backend/.env -> Secret Manager (values are never printed)
deploy/cloudrun.sh all     # build, deploy the voice agent and the web service, print the URL
# then add the printed redirect URI to the Google OAuth client (see "Google sign-in")
```

`DRY_RUN=1 deploy/cloudrun.sh all` prints every change instead of making it.

## What is deployed

```text
 the jury's phone (browser)
   │
   ├─ https ─▶ ghoommates.sourabh.org: Cloudflare Worker  (serves the React app, frontend/dist, from the edge)
   │             └─ /api, /auth, /health ─▶ Cloud Run "ghoommates"  (public)
   │                             ├─ mongodb+srv, TLS ────▶ MongoDB Atlas  (database "ghoomates")
   │                             ├─ its service account ─▶ Vertex AI, Gemini API
   │                             ├─ ID token, GET / ─────▶ Cloud Run "ghoommates-agent"  (private): wake, keepalive
   │                             └─ signed URLs ─────────▶ handed to the browser (below)
   │
   ├─ PUT / GET, signed URL ─▶ GCS bucket "ghoomates"
   │                             └─ object finalized ─▶ Eventarc ─▶ Cloud Run "face-indexer" (private) ─▶ Atlas
   │
   └─ WebRTC (microphone) ───▶ LiveKit Cloud ◀── wss ── voice worker in Cloud Run "ghoommates-agent"
                                                          └─ https, as the user ─▶ ghoommates.sourabh.org /api
```

| Piece | What it is | Notes |
| --- | --- | --- |
| `ghoommates-proxy` (Cloudflare Worker) | `deploy/worker`: serves `ghoommates.sourabh.org`. The built React app is uploaded with it as Workers static assets and served from Cloudflare's edge (hashed `/assets/*` cached for a year, `index.html` always revalidated, other page addresses get `index.html`, scanner probes a 404, and the Worker cuts byte ranges out of `.m4a` narration itself because Cloudflare ignores `Range` on static assets and Safari needs it); only `/api/*`, `/auth/*` and `/health` are forwarded to the `run.app` address (Cloud Run domain mapping is not offered in asia-south1), so page loads from bots, link previews and signed-out visitors never wake Cloud Run. Deploy with `npm install && cf deploy` in that folder; `cf` is the Cloudflare CLI, and the deploy builds `frontend/` first. **A frontend change is live on the domain only after a Worker deploy** (CI does it when `CLOUDFLARE_API_TOKEN` is set, see "Automatic deploys"). | Free plan: 100,000 Worker requests a day; static asset requests are free and do not count. `deploy/cloudrun.sh` defaults `PUBLIC_URL` to the domain; `PUBLIC_URL=` deploys for the `run.app` address instead. |
| `ghoommates` (Cloud Run) | The `Dockerfile` image: `node backend/src/index.ts` serves `/api`, `/auth`, `/health` and, from `SERVE_FRONTEND_DIR`, the built React app (gzip, immutable caching for hashed assets, SPA fallback). The domain takes the app from the Worker instead; the copy in the image is what the `run.app` address and `docker run` serve. | 1 vCPU, 1 GiB, 0 to 4 instances, public. Request-based billing (`--cpu-throttling`): every piece of work happens inside a request, so an instance costs nothing between requests. |
| `ghoommates-agent` (Cloud Run) | The same image running `node backend/src/voice/agent.ts start`: the LiveKit worker dials out to LiveKit, takes sessions and calls the API as the user. Its LiveKit health server (port 8081, `GET /`) answers 200 only once the worker is registered with LiveKit. `POST /api/voice/session` on the web service wakes it with an ID-token GET to that endpoint (`VOICE_AGENT_URL`, `backend/src/voice/wake.ts`) and waits up to 25 s before handing out the token, because LiveKit drops a dispatch that finds no registered worker. During a call the app calls `POST /api/voice/keepalive` every minute, which pings it again, since Cloud Run stops an instance that gets no requests. | 1 vCPU, 1 GiB, 0 to 1 instances, CPU always allocated while up (the LiveKit connection and the call run between requests), gen2. Private: ingress all, but only `ghoommates-web` has `roles/run.invoker` (internal ingress would need a VPC connector on the web service). Scales to zero about 15 minutes after the last chat; the first chat after that waits for a cold start of ~5 to 15 s ("Waking GhoomMate…"). `VOICE_IN_WEB=1 deploy/cloudrun.sh` puts the worker back inside the web service (`VOICE_WORKER=inline`, CPU always allocated there). |
| MongoDB Atlas, database `ghoomates` | Shared with the team and the face services (face embeddings use Atlas Vector Search). The web service connects with `MONGODB_CONNECTION_STRING` (a secret) and `MONGODB_DB`; it creates any missing indexes at startup (`backend/src/schema.ts`). Cloud Run has no fixed outbound IP, so the Atlas IP access list must allow `0.0.0.0/0` (the password and TLS protect it). | Same database and data as local dev. |
| GCS `ghoomates` | Photos, receipts, selfies. The browser uploads and downloads with short-lived signed URLs; the signing key is `GCS_CREDENTIALS_BASE64`. | Bucket CORS already allows the app. |
| Eventarc, `face-indexer` | Deployed separately from `cloud/`. An upload (photo or selfie) fires `face-indexer`, which writes face vectors to Atlas; "find me" is a vector search the web service runs on Atlas itself. | See `cloud/README.md`. |
| Vertex AI, Gemini | Images go to Vertex through the web service's account (`roles/aiplatform.user`). Text and speech use `GEMINI_API_KEY`, or Vertex without it. | Every feature has a hand-written fallback. |
| LiveKit Cloud | Rooms, WebRTC and the realtime model (billed to the LiveKit project). | Browser connects to it directly. |
| Secret Manager | One secret per sensitive setting, mounted as environment variables. | Created by `deploy/secrets.sh`. |
| Artifact Registry `ghoomates`, Cloud Build | Where the image is built (`deploy/cloudbuild.yaml`) and stored. | Registry already exists. |

The older `backend/Dockerfile` (API only) is superseded by the root `Dockerfile`.

## Step by step

**0. Before you start.** `gcloud auth list` shows an owner of project `optimal-comfort-510810-d1` (Secret Manager is not enabled yet; the scripts enable it). `backend/.env` has, at least: `MONGODB_CONNECTION_STRING` (Atlas, Connect, Drivers: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`, password URL-encoded) and `MONGODB_DB` if not `ghoomates`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `GCS_CREDENTIALS_BASE64`; for the rest of the product `GEMINI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Docker is not needed (Cloud Build builds the image).

**1. Secrets.**

```bash
deploy/secrets.sh --check     # which secrets exist (names only) and which settings are set locally
deploy/secrets.sh             # create them; run again whenever a value changes
```

| Secret | From | Used by |
| --- | --- | --- |
| `ghoommates-jwt-secret` | generated, never copied from `.env` | web (required) |
| `ghoommates-mongodb-connection-string` | `MONGODB_CONNECTION_STRING` | web (required) |
| `ghoommates-google-client-secret` | `GOOGLE_CLIENT_SECRET` | web (Google sign-in) |
| `ghoommates-gcs-credentials-base64` | `GCS_CREDENTIALS_BASE64` | web (signed URLs) |
| `ghoommates-gemini-api-key` | `GEMINI_API_KEY` | web |
| `ghoommates-livekit-api-key`, `ghoommates-livekit-api-secret` | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web and voice agent |
| `ghoommates-google-maps-api-key` | `GOOGLE_MAPS_API_KEY` | web (optional) |

The JWT secret is generated because the dev default is public in this repo; anyone could forge a session with it. The ledger `API_KEY` is deliberately not deployed, so `/api/*` (the internal expense ledger) answers 503. Settings other modules add: `EXTRA_SECRET_KEYS="FOO" deploy/secrets.sh` and the same variable for `deploy/cloudrun.sh`; non-secret ones with `EXTRA_ENV_KEYS`.

**2. Look at the plan (optional).** `DRY_RUN=1 deploy/cloudrun.sh all` runs only read-only lookups and prints each change.

**3. Deploy.**

```bash
deploy/cloudrun.sh all       # the voice agent, then the web service
deploy/cloudrun.sh           # web service only
deploy/cloudrun.sh agent     # voice agent only
```

It enables the APIs, creates the service accounts `ghoommates-web` and `ghoommates-agent`, grants `roles/aiplatform.user`, `roles/storage.objectAdmin` on the bucket, `roles/secretmanager.secretAccessor` per secret and `roles/run.invoker` on the agent service to `ghoommates-web`, builds the image (a few minutes), deploys with `--set-secrets` and an env-vars file, allows anyone to open the web service, checks `/health` and `/`, and prints the URL. Every run deploys a new revision of the current code; infrastructure steps that already exist are no-ops. `SKIP_SETUP=1` skips the APIs, accounts and roles on re-deploys, `SKIP_BUILD=1` redeploys the `:latest` image. Sizes, names and who may open the service are environment variables (`WEB_MIN_INSTANCES`, `AGENT_CPU`, `PUBLIC_ACCESS`, `PUBLIC_URL`, ...); the header of `deploy/cloudrun.sh` lists them and `deploy/common.sh` has the defaults.

The web service's environment is rewritten on every deploy (`--env-vars-file`), so anything set by hand in the console is dropped. `CLIENT_ORIGIN`, `GOOGLE_REDIRECT_URI`, `GHOOMATE_AGENT_NAME`, `VOICE_AGENT_URL` and the rest are computed. The URL is known before the first deploy: `https://ghoommates-449943395156.asia-south1.run.app` (service name, project number, region); the script checks that Cloud Run agrees.

**4. Google sign-in** (the one step gcloud cannot do). In the Cloud Console: APIs & Services, Credentials, the OAuth 2.0 client whose ID is your `GOOGLE_CLIENT_ID`:

- **Authorized redirect URIs**, add `https://ghoommates-449943395156.asia-south1.run.app/auth/callback` (keep the `http://localhost:5173/auth/callback` one for local dev).
- **Authorized JavaScript origins**, add `https://ghoommates-449943395156.asia-south1.run.app` (harmless; the app uses the redirect flow).
- **OAuth consent screen**: set the publishing status to *In production*, so any Google account can sign in (the app asks only for `openid`, `email`, `profile`, which should not need Google's review). While it is in *Testing*, only the test users you list (up to 100) can sign in, and everyone else sees "access blocked".

Changes can take a few minutes to apply. If you deploy to a custom domain (`PUBLIC_URL=https://app.example.com deploy/cloudrun.sh`), use that origin instead.

**5. Voice.** `deploy/cloudrun.sh all` deploys the agent service before the web service. Both use the agent name `ghoomate-prod` (`AGENT_NAME=` changes it). The voice doc says the deployed app keeps the shared default `ghoomate`, but any teammate who runs `npm run dev` without their own `GHOOMATE_AGENT_NAME` registers under that name and would steal jury sessions, so the deployment gets its own. Open a chat once: the web service logs `Voice agent ready after … ms` and the worker logs `registered worker`:

```bash
gcloud run services logs read ghoommates-agent --region=asia-south1 --limit=50 | grep -i worker
```

**Moving from the single service** (the web service running the worker with CPU always allocated): run `deploy/cloudrun.sh all` once, by hand. It creates `ghoommates-agent` (min 0, max 1) and lets `ghoommates-web` invoke it, then redeploys the web service with `--cpu-throttling`, `VOICE_AGENT_URL` set and `VOICE_WORKER` gone. CI's `release` only changes images, so it cannot make this switch. Run `deploy/github-ci.sh` once as well, so CI may roll new images out to the agent service (`roles/iam.serviceAccountUser` on `ghoommates-agent`).

**Fallback if voice misbehaves on Cloud Run** (the worker needs outbound WebRTC from a Cloud Run container; test it once): run the worker on a laptop with `GHOOMATE_AGENT_NAME=ghoomate-prod BACKEND_URL=https://ghoommates-449943395156.asia-south1.run.app npm run dev:agent`. The deployed web service dispatches to that name.

**Later.** `deploy/cloudrun.sh status` (URLs, health), `pause` (zero instances) and `resume`. Roll back with `gcloud run services update-traffic ghoommates --to-revisions=<revision>=100 --region=asia-south1` (`gcloud run revisions list --service ghoommates --region=asia-south1`).

## Moving the data from Cloud SQL to Atlas (one-off)

`backend/scripts/pg-to-mongo.ts` copies every Postgres table into Atlas in the shapes of `backend/src/schema.ts`: `id` becomes `_id`, `expense_shares` is embedded in each expense, chat messages and face rows get ObjectIds (in id order, with a `legacy_id`), face vectors become BSON float32 vectors, and `maker_slots` is rebuilt from the confirmed bookings. Every document is upserted, so running it again brings Atlas up to date with Postgres (it replaces each copied document with its Postgres version and adds new ones; nothing is deleted). It runs from a laptop (`pg` is a dev dependency). `--dry-run` reads and maps everything, prints the counts and writes nothing.

```bash
cd backend
export PG_SOURCE_URL='postgres://ghoomates:<password>@8.234.85.49:5432/ghoomates?sslmode=no-verify'
# MONGODB_CONNECTION_STRING and MONGODB_DB come from backend/.env (or export them)
node scripts/pg-to-mongo.ts --dry-run    # counts per table, and checks both connections
```

Cutover, in this order:

1. Atlas: a database user, and `0.0.0.0/0` in Network Access. `MONGODB_CONNECTION_STRING` in `backend/.env` and `cloud/.env`.
2. `cd cloud && ./deploy.sh migrate`: the face indexes and the vector search index (`cloud/README.md`).
3. `node scripts/pg-to-mongo.ts --dry-run`, then `node scripts/pg-to-mongo.ts`: the bulk copy, while the old app keeps running. The table it prints should show as many Mongo documents as Postgres rows (expense shares are inside `expenses`).
4. Deploy the face services on Atlas (`cd cloud && ./deploy.sh build && ./deploy.sh indexer && ./deploy.sh search`), then the web service: `deploy/secrets.sh && deploy/cloudrun.sh`. By hand, not CI: CI's `release` only swaps the image and would keep the old Cloud SQL settings, without the new secret.
5. Straight away, `node scripts/pg-to-mongo.ts` again for the delta: whatever was written to Postgres between step 3 and the new revisions taking traffic. Do it before people use the new revision: a document changed on Atlas in between is overwritten by its Postgres version.
6. Smoke test: `/health` shows `"trips":"enabled"`; sign in, open a trip (itinerary, expenses and balances, photos), upload a photo and use "find me", open a chat. `npm run test:connection` lists the collections and their counts.
7. When it has run fine for a while, delete the Cloud SQL instance (`gcloud sql instances delete ghoomates`) and the old `ghoommates-db-password` secret.

## Automatic deploys

Every push to `main` runs `.github/workflows/deploy.yml`: the GitHub runner builds the image from the pushed commit (Docker Buildx, layers cached in the GitHub Actions cache) and pushes it to Artifact Registry under the tag `deploy/cloudrun.sh image` prints, then `SKIP_BUILD=1 deploy/cloudrun.sh release` rolls that image out as a new revision of `ghoommates` and fails the job if `https://ghoommates.sourabh.org/health` or the web app does not answer, then rolls the same image out to `ghoommates-agent` (skipped while it does not exist; a new revision starts one instance briefly to check it). Cloud Build is not used, so CI costs nothing on Google's side; the repository is public, so GitHub's runner minutes are free too. No tests run.

`release` changes only the image. Environment variables, secrets and the service account stay as the last full `deploy/cloudrun.sh` left them, so after changing `backend/.env` or a secret, run `deploy/secrets.sh` and `deploy/cloudrun.sh` by hand.

GitHub signs in to Google with Workload Identity Federation as `ghoommates-deployer`; no key is stored in GitHub. Only pushes to `main` of this repository are accepted. The account can push images to the `ghoomates` registry and roll out, and cannot read secrets, the database or the bucket. `deploy/github-ci.sh` sets this up once (re-runnable, `DRY_RUN=1` to preview) and lists each permission. To turn CI off, delete the workload identity pool `github`.

Then the same job deploys the Cloudflare Worker in `deploy/worker` (`npm ci` and `npx cf deploy`, which builds `frontend/` and uploads it with the Worker), because the domain serves the web app from the Worker, not from the image. It runs only when the repository secret `CLOUDFLARE_API_TOKEN` exists; without it the job warns and the domain keeps serving the previous web app until someone runs `npm install && cf deploy` in `deploy/worker`. **One-time setup (TODO):** in the Cloudflare dashboard, create an API token from the "Edit Cloudflare Workers" template, limited to the account and the `sourabh.org` zone (the Worker is attached to `ghoommates.sourabh.org` as a custom domain), and add it with `gh secret set CLOUDFLARE_API_TOKEN`. If the token reaches more than one account, also `gh variable set CLOUDFLARE_ACCOUNT_ID`.

The release check (`/health` and `/` on the domain) sees the Worker's copy of the app, which CI deploys after it; `curl https://ghoommates-449943395156.asia-south1.run.app/` checks the image's copy.

## Sign-in for the jury

| Option | How | Trade-off |
| --- | --- | --- |
| Google (default) | Step 4 above | Real accounts; needs the consent screen published. |
| Test sign-in | `ALLOW_DEV_LOGIN=true deploy/cloudrun.sh` | The sign-in page shows the two quick test accounts (Aditi Sharma, Kabir Mehta); no Google needed. On a production server it signs in **only those two accounts** (`DEV_LOGIN_EMAILS=a@x.com,b@y.com` replaces them), never a real user. They are real rows in the shared database, so whatever they can see, anyone with the link can see. Redeploy without the flag afterwards. |

Without Google credentials and without `ALLOW_DEV_LOGIN=true`, nobody can sign in, so `deploy/cloudrun.sh` refuses to deploy.

## Public URL: what was checked

Fixed in code (`backend/tests/deploy/production.test.ts` covers each):

- **Mock sign-in.** `POST /auth/dev/login` signs in as whatever email it gets; against the shared database that is a takeover of a real user. It is now off when `NODE_ENV=production` (the image sets it), unless `ALLOW_DEV_LOGIN=true`, and then it only signs in the demo accounts. Local dev is unchanged (on, any email). `/auth/config` reports the real state, so the sign-in page hides the test accounts.
- **JWT secret.** The fallback secret is in this repo, so a production server now refuses to start without `JWT_SECRET`.
- **CORS.** Any `http://localhost:*` origin was allowed; a production server answers only `CLIENT_ORIGIN`. The app is served from the same origin, so it needs no CORS anyway.
- **Cookies.** None exist (sessions are bearer tokens), so there are no cookie flags to set. Cloud Run only serves HTTPS.
- **`/api/media` signing.** The local-disk fallback signs upload and read URLs with HMAC over method, key and expiry (15 minutes to upload, 12 hours to read), keyed by `JWT_SECRET`, so the fix above covers it. It is inert when GCS is configured. Without `GCS_CREDENTIALS_BASE64` uploads would go to the container's temporary disk and vanish, so `deploy/cloudrun.sh` warns.
- **Built output.** Hidden files and unknown API paths never fall back to `index.html`; the static handler cannot leave the app directory.

Not fixed (decide after the demo):

- **No rate limits** on any route, including the Gemini and Vertex backed ones (itinerary drafts, images, speech). Every one needs a signed-in user, but with the consent screen public anyone can sign in. The caps that exist are `--max-instances` (web 4) and your quotas: lower the Vertex AI "generate content requests per minute" quota, restrict and cap the Gemini API key, and add a budget alert (`gcloud billing budgets create`). The proper fix is a per-user token bucket on those routes.
- **Google sign-in `state` is not checked**, so a login CSRF is possible (a victim could be signed in as the attacker). Google still enforces the registered redirect URIs.
- **Sessions** are 7-day tokens in `localStorage` with no server-side revocation; `/auth/logout` only clears the client. After Google sign-in the token travels in the URL fragment (`/#/auth/callback?token=`).
- **No CSP, `frame-ancestors` or HSTS headers.** Only `nosniff` is set.
- **`GCS_CREDENTIALS_BASE64`** is a long-lived service-account key held in Secret Manager. Keyless signing with the Cloud Run account (IAM `signBlob`) would remove it but needs a change in `storage.ts`.
- **Bucket CORS** allows `*` (signed URLs are what protect objects). **Atlas** accepts any IP (`0.0.0.0/0`; password and TLS only), because Cloud Run has no fixed egress IP.
- **One shared database.** The deployed app and every laptop read and write the same data, and a deployed revision creates any new indexes in it at startup.
- `/` and `/health` list which modules are enabled. The invite preview `GET /api/trips/invites/:code` is public by design.

## Cost

Rough figures from Google's public price lists (Mumbai is a "Tier 2" Cloud Run region); check the pricing calculator before relying on them.

| Item | Estimate |
| --- | --- |
| Web service: 1 vCPU + 1 GiB, request-based billing | Only while requests are in flight (rounded up to 100 ms), at a higher per-second rate than instance-based billing, plus a per-request fee. An idle instance between requests, and the ~15 minutes Cloud Run keeps it around afterwards, cost nothing, and Cloud Run's monthly free tier covers a hackathon's traffic. The first visit after idle waits for a cold start of a few seconds; `WEB_MIN_INSTANCES=1` removes it for a demo (an idle minimum instance is billed at a lower rate). |
| Voice agent: 1 vCPU + 1 GiB, CPU allocated while an instance is up ($0.0000216 per vCPU-s, $0.0000024 per GiB-s) | about $0.09 an hour while it is up: each chat's length plus up to 15 idle minutes after the last one, so a few cents for a short chat, and nothing when nobody talks to GhoomMate. Before the split the web service billed this way after every stray request (about 6 instance-hours a day). `AGENT_MIN_INSTANCES=1` keeps it connected for a demo, at about $2 a day. |
| Cloud Build | nothing for CI (it builds on the GitHub runner). A laptop `deploy/cloudrun.sh` still builds in Cloud Build, on the default machine, inside its free build minutes. |
| Artifact Registry, Secret Manager | cents (about 300 MB per image tag; delete old tags) |
| Gemini, Vertex AI | pay per call; the reason for the budget alert |
| LiveKit | on the LiveKit project's plan |
| MongoDB Atlas | on the Atlas project's plan (billed by MongoDB, not Google). |
| Cloud SQL `ghoomates` (old) | Only until it is deleted after the move to Atlas: roughly $0.8 an hour while it runs. |

When the hackathon is over: `deploy/cloudrun.sh pause`, pause the Atlas cluster if it is a dedicated tier, and delete what you do not need:

```bash
gcloud run services delete ghoommates ghoommates-agent --region=asia-south1
gcloud secrets list --filter='name~ghoommates-' --format='value(name)' | xargs -n1 gcloud secrets delete --quiet
gcloud artifacts docker images list asia-south1-docker.pkg.dev/optimal-comfort-510810-d1/ghoomates/web
```

## Pre-demo checklist

1. `deploy/secrets.sh --check` shows every secret you rely on as present. `deploy/cloudrun.sh all` ended without a warning (exit code 0).
2. The redirect URI is in the OAuth client and the consent screen is *In production* (or the jury are test users). Sign in **from a phone on mobile data**, not just from your laptop: Google, selfie, home.
3. `curl https://ghoommates-449943395156.asia-south1.run.app/health` shows `"trips":"enabled"`. If it says disabled, the database connection failed (logs; the Atlas IP access list, `MONGODB_CONNECTION_STRING`).
4. Create a trip with the real sign-in, copy the invite link and open it on a second phone (the link uses `CLIENT_ORIGIN`).
5. Upload a few photos **ahead of time** and wait for indexing: `face-indexer` scales to zero and loads its models on a cold start, so the first photo or selfie after a quiet hour takes half a minute to index. "Find me" itself is a vector query in the web service and has no cold start.
6. Itinerary draft returns a Gemini plan, not the template one (the `GEMINI_API_KEY` secret is present).
7. Voice: tap GhoomMate on a phone, allow the microphone, say a sentence. The agent logs show `received job request`. Nobody else is registered as `ghoomate-prod`.
8. Prepare a demo trip, squad and photos in advance; if the test sign-in is on, use the demo accounts for it.
9. Warm the web service a few minutes before (any request) and open one GhoomMate chat to wake the agent. It stays up ~15 minutes; for the whole demo, `gcloud run services update ghoommates-agent --min-instances=1 --region=asia-south1` (back to 0 afterwards). Make a QR code of the URL for the jury.
10. Backup: `npm run dev` plus `npm run share` (ngrok) on a laptop.
11. Afterwards: redeploy without `ALLOW_DEV_LOGIN`, `pause`.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `Missing required secret(s)` | Run `deploy/secrets.sh`; `MONGODB_CONNECTION_STRING` must be in `backend/.env` or exported. |
| Deploy fails, revision not ready | `gcloud run services logs read ghoommates --region=asia-south1 --limit=50`. `JWT_SECRET must be at least 32 characters` means the secret is missing. |
| `/health` shows `trips: disabled` | The database connection failed and the server fell back to in-memory auth. `Server selection timed out` in the logs: the Atlas IP access list does not allow `0.0.0.0/0`. `bad auth`: the user or (URL-encoded) password in the secret is wrong. |
| Google `redirect_uri_mismatch` | The URI in the OAuth client must match exactly, `https://…/auth/callback`, with no trailing slash. Wait a few minutes after saving. |
| Google "access blocked" | The consent screen is in *Testing* and the account is not a test user. |
| The service answers 403 | Not public: an organisation policy (domain restricted sharing) may have refused `allUsers`. Ask an admin, or `PUBLIC_ACCESS=no-invoker-check deploy/cloudrun.sh`, which turns off Cloud Run's IAM check instead. |
| Uploads work but photos disappear | `GCS_CREDENTIALS_BASE64` is missing, so the container disk was used. Create the secret and redeploy. |
| Voice never answers | The worker is not registered (agent logs), the names differ (`GHOOMATE_AGENT_NAME`), or the LiveKit secrets are missing. Use the laptop fallback above. |
| "GhoomMate is napping" after a long "Waking GhoomMate…" | `POST /api/voice/session` gave up after 25 s (`VOICE_AGENT_WAKING`); the web logs say `Voice agent not ready` with the last answer. `401`/`403`: `ghoommates-web` lacks `roles/run.invoker` on `ghoommates-agent` (`deploy/cloudrun.sh agent` grants it). `503 not connected to livekit`: the worker cannot reach LiveKit (agent logs). A slow cold start: try again, it is warm now. |
| Build fails with a permission error | Give the Cloud Build account `roles/artifactregistry.writer` and `roles/logging.logWriter` (the face services build the same way). |

## Try the image locally (optional)

```bash
docker build -t ghoommates-web .
docker run --rm -p 8080:8080 -e JWT_SECRET=$(openssl rand -hex 32) -e ALLOW_DEV_LOGIN=true ghoommates-web
# http://localhost:8080 : the app and the API on one port, in-memory auth, no database
```

A local build is for your CPU (arm64 on an M-series Mac); `deploy/cloudrun.sh` builds in Cloud Build for Cloud Run.

## Files

| File | Role |
| --- | --- |
| `Dockerfile`, `.dockerignore`, `.gcloudignore` | The image, and what stays out of the Docker and Cloud Build uploads (`.env` files, `node_modules`, `.claude/`) |
| `deploy/cloudrun.sh` | Setup, build, deploy both services, public access, health check, pause and resume |
| `backend/src/voice/wake.ts` | Wakes the agent service and waits for its worker to register; the keepalive ping |
| `deploy/secrets.sh` | `backend/.env` to Secret Manager |
| `deploy/common.sh`, `deploy/cloudbuild.yaml` | Shared settings and helpers; the Cloud Build config |
| `backend/scripts/pg-to-mongo.ts` | The one-off Cloud SQL to Atlas copy (above) |
| `.github/workflows/deploy.yml`, `deploy/github-ci.sh` | Deploy on every push to `main`; its one-time Google Cloud setup |
| `deploy/worker/` | The Cloudflare Worker that serves `ghoommates.sourabh.org`: `cloudflare.config.ts` (domain, static assets, which paths run the Worker), `vite.config.ts` (builds `frontend/`, uses `frontend/dist` as the assets, writes their cache rules), `src/index.js` (forwards the backend's paths, SPA fallback, scanner 404s) |
| `backend/src/frontend.ts` | The router that serves `frontend/dist` (`SERVE_FRONTEND_DIR`) |
| `backend/src/auth/devLogin.ts` | When the test sign-in works and for whom |
| `backend/tests/deploy/production.test.ts` | Tests for both |

## Google sign-in on the domain

The Google OAuth client lists `https://ghoommates.sourabh.org/auth/callback` as an authorized redirect URI and `https://ghoommates.sourabh.org` as a JavaScript origin. Keep the `run.app` entries too, for signing in directly on Cloud Run while debugging.

The app used to run on a Compute Engine VM (`deploy/vm.sh`); it was deleted on 9 Nov 2026 after the move to Cloud Run.
