# Deploying Ghoomates on Google Cloud Run

One image, two Cloud Run services: the **web service** (the Express API and the built React app together, so one URL is the whole product) and an optional **voice worker** (the GhoomMate agent). Everything else (Cloud SQL, the photo bucket, face indexing, Vertex AI, LiveKit) already exists and is only wired in.

Short version, from the repo root, with `gcloud` signed in as a project owner and `backend/.env` filled in:

```bash
deploy/secrets.sh          # backend/.env -> Secret Manager (values are never printed)
deploy/cloudrun.sh all     # build, deploy the web service and the voice worker, print the URL
# then add the printed redirect URI to the Google OAuth client (see "Google sign-in")
```

`DRY_RUN=1 deploy/cloudrun.sh all` prints every change instead of making it.

## What is deployed

```text
 the jury's phone (browser)
   │
   ├─ https ────────────────▶ Cloud Run "ghoomates"  (public)  the React app, /api, /auth, /health
   │                             ├─ Cloud SQL connector ─▶ Cloud SQL "ghoomates"  (Postgres 18 + pgvector)
   │                             ├─ its service account ─▶ Vertex AI, Gemini API
   │                             ├─ ID token ────────────▶ Cloud Run "face-search"  (private) ─▶ Cloud SQL
   │                             └─ signed URLs ─────────▶ handed to the browser (below)
   │
   ├─ PUT / GET, signed URL ─▶ GCS bucket "ghoomates"
   │                             └─ object finalized ─▶ Eventarc ─▶ Cloud Run "face-indexer" (private) ─▶ Cloud SQL
   │
   └─ WebRTC (microphone) ───▶ LiveKit Cloud ◀── wss ── Cloud Run "ghoomates-agent"  (private, always-on CPU)
                                                          └─ https, as the user ─▶ Cloud Run "ghoomates"
```

| Piece | What it is | Notes |
| --- | --- | --- |
| `ghoomates` (Cloud Run) | The `Dockerfile` image: `node backend/src/index.ts` serves `/api`, `/auth`, `/health` and, from `SERVE_FRONTEND_DIR`, the built React app (gzip, immutable caching for hashed assets, SPA fallback). | 1 vCPU, 1 GiB, 1 to 4 instances, public. |
| `ghoomates-agent` (Cloud Run) | The same image run as `node backend/src/voice/agent.ts start`. Dials out to LiveKit, takes sessions, calls the web service's API as the user. | 2 vCPU, 2 GiB, CPU always allocated, 1 to 2 instances, private (no inbound traffic; its health port is 8081). |
| Cloud SQL `ghoomates` | Postgres 18 with pgvector, shared with the team. The web service uses the Cloud SQL Node connector (`CLOUD_SQL_INSTANCE`), so it needs the `roles/cloudsql.client` role, not an IP allow-list. Migrations run at startup. | Same database and data as local dev. |
| GCS `ghoomates` | Photos, receipts, selfies. The browser uploads and downloads with short-lived signed URLs; the signing key is `GCS_CREDENTIALS_BASE64`. | Bucket CORS already allows the app. |
| Eventarc, `face-indexer`, `face-search` | Deployed separately from `cloud/`. An upload fires `face-indexer`; the web service calls `face-search` with an ID token for "find me". | See `cloud/README.md`. |
| Vertex AI, Gemini | Images go to Vertex through the web service's account (`roles/aiplatform.user`). Text and speech use `GEMINI_API_KEY`, or Vertex without it. | Every feature has a hand-written fallback. |
| LiveKit Cloud | Rooms, WebRTC and the realtime model (billed to the LiveKit project). | Browser connects to it directly. |
| Secret Manager | One secret per sensitive setting, mounted as environment variables. | Created by `deploy/secrets.sh`. |
| Artifact Registry `ghoomates`, Cloud Build | Where the image is built (`deploy/cloudbuild.yaml`) and stored. | Registry already exists. |

The older `backend/Dockerfile` (API only) is superseded by the root `Dockerfile`.

## Step by step

**0. Before you start.** `gcloud auth list` shows an owner of project `optimal-comfort-510810-d1` (Secret Manager is not enabled yet; the scripts enable it). `backend/.env` has, at least: `DB_PASSWORD` (the Cloud SQL password of user `ghoomates`), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `GCS_CREDENTIALS_BASE64`; for the rest of the product `GEMINI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Docker is not needed (Cloud Build builds the image).

**1. Secrets.**

```bash
deploy/secrets.sh --check     # which secrets exist (names only) and which settings are set locally
deploy/secrets.sh             # create them; run again whenever a value changes
```

| Secret | From | Used by |
| --- | --- | --- |
| `ghoomates-jwt-secret` | generated, never copied from `.env` | web (required) |
| `ghoomates-db-password` | `DB_PASSWORD` | web (required) |
| `ghoomates-google-client-secret` | `GOOGLE_CLIENT_SECRET` | web (Google sign-in) |
| `ghoomates-gcs-credentials-base64` | `GCS_CREDENTIALS_BASE64` | web (signed URLs, face-search ID token) |
| `ghoomates-gemini-api-key` | `GEMINI_API_KEY` | web |
| `ghoomates-livekit-api-key`, `ghoomates-livekit-api-secret` | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web and voice worker |
| `ghoomates-google-maps-api-key` | `GOOGLE_MAPS_API_KEY` | web (optional) |

The JWT secret is generated because the dev default is public in this repo; anyone could forge a session with it. The ledger `API_KEY` is deliberately not deployed, so `/api/*` (the internal expense ledger) answers 503. Settings other modules add: `EXTRA_SECRET_KEYS="FOO" deploy/secrets.sh` and the same variable for `deploy/cloudrun.sh`; non-secret ones with `EXTRA_ENV_KEYS`.

**2. Look at the plan (optional).** `DRY_RUN=1 deploy/cloudrun.sh all` runs only read-only lookups and prints each change.

**3. Deploy.**

```bash
deploy/cloudrun.sh           # web service only
deploy/cloudrun.sh all       # web service and the voice worker
```

It enables the APIs, creates the service accounts `ghoomates-web` and `ghoomates-agent`, grants `roles/cloudsql.client`, `roles/aiplatform.user`, `roles/storage.objectAdmin` on the bucket and `roles/secretmanager.secretAccessor` per secret, builds the image (a few minutes), deploys with `--set-secrets` and an env-vars file, allows anyone to open the web service, checks `/health` and `/`, and prints the URL. Every run deploys a new revision of the current code; infrastructure steps that already exist are no-ops. `SKIP_SETUP=1` skips the APIs, accounts and roles on re-deploys, `SKIP_BUILD=1` redeploys the `:latest` image. Sizes, names and who may open the service are environment variables (`WEB_MIN_INSTANCES`, `AGENT_CPU`, `PUBLIC_ACCESS`, `PUBLIC_URL`, ...); the header of `deploy/cloudrun.sh` lists them and `deploy/common.sh` has the defaults.

The web service's environment is rewritten on every deploy (`--env-vars-file`), so anything set by hand in the console is dropped. `CLIENT_ORIGIN`, `GOOGLE_REDIRECT_URI`, `CLOUD_SQL_INSTANCE`, `GHOOMATE_AGENT_NAME` and the rest are computed. The URL is known before the first deploy: `https://ghoomates-449943395156.asia-south1.run.app` (service name, project number, region); the script checks that Cloud Run agrees.

**4. Google sign-in** (the one step gcloud cannot do). In the Cloud Console: APIs & Services, Credentials, the OAuth 2.0 client whose ID is your `GOOGLE_CLIENT_ID`:

- **Authorized redirect URIs**, add `https://ghoomates-449943395156.asia-south1.run.app/auth/callback` (keep the `http://localhost:5173/auth/callback` one for local dev).
- **Authorized JavaScript origins**, add `https://ghoomates-449943395156.asia-south1.run.app` (harmless; the app uses the redirect flow).
- **OAuth consent screen**: set the publishing status to *In production*, so any Google account can sign in (the app asks only for `openid`, `email`, `profile`, which should not need Google's review). While it is in *Testing*, only the test users you list (up to 100) can sign in, and everyone else sees "access blocked".

Changes can take a few minutes to apply. If you deploy to a custom domain (`PUBLIC_URL=https://app.example.com deploy/cloudrun.sh`), use that origin instead.

**5. Voice.** `deploy/cloudrun.sh agent` (or `all`). The deployed web service and worker both use the agent name `ghoomate-prod` (`AGENT_NAME=` changes it). The voice doc says the deployed app keeps the shared default `ghoomate`, but any teammate who runs `npm run dev` without their own `GHOOMATE_AGENT_NAME` registers under that name and would steal jury sessions, so the deployment gets its own. The worker should log `registered worker`:

```bash
gcloud run services logs read ghoomates-agent --region=asia-south1 --limit=30
```

**Fallback if voice misbehaves on Cloud Run** (the worker needs outbound WebRTC from a Cloud Run container; test it once): run the worker on a laptop with `GHOOMATE_AGENT_NAME=ghoomate-prod BACKEND_URL=https://ghoomates-449943395156.asia-south1.run.app npm run dev:agent`. The deployed web service dispatches to that name.

**Later.** `deploy/cloudrun.sh status` (URLs, health), `pause` (zero instances) and `resume`. Roll back with `gcloud run services update-traffic ghoomates --to-revisions=<revision>=100 --region=asia-south1` (`gcloud run revisions list --service ghoomates --region=asia-south1`).

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
- **Sessions** are 7-day tokens in `localStorage` with no server-side revocation; `/auth/logout` only clears the client. After Google sign-in the token travels in the URL fragment (`/#/selfie?token=`).
- **No CSP, `frame-ancestors` or HSTS headers.** Only `nosniff` is set.
- **`GCS_CREDENTIALS_BASE64`** is a long-lived service-account key held in Secret Manager. Keyless signing with the Cloud Run account (IAM `signBlob`) would remove it but needs a change in `storage.ts`.
- **Bucket CORS** allows `*` (signed URLs are what protect objects). **Cloud SQL** accepts any IP (password and TLS only), which the directly connected `face-indexer` relies on.
- **One shared database.** The deployed app and every laptop read and write the same data, and a deployed revision applies new migrations to it at startup.
- `/` and `/health` list which modules are enabled. The invite preview `GET /api/trips/invites/:code` is public by design.

## Cost

Rough figures from Google's public price lists (Mumbai is a "Tier 2" Cloud Run region); check the pricing calculator before relying on them.

| Item | Estimate |
| --- | --- |
| Voice worker: 2 vCPU + 2 GiB, CPU always allocated ($0.0000216 per vCPU-s, $0.0000024 per GiB-s) | about $4 a day, $125 a month. `AGENT_CPU=1 AGENT_MEMORY=1Gi` halves it. |
| Web service, 1 warm instance (idle time is billed at a reduced rate, active time at $0.0000336 per vCPU-s and $0.0000035 per GiB-s) | At most about $3 a day even if it were billed as active around the clock; idle is much less. `WEB_MIN_INSTANCES=0` makes idle free but adds a cold start of a few seconds. |
| Cloud Build | a few cents per build |
| Artifact Registry, Secret Manager | cents (about 300 MB per image tag; delete old tags) |
| Gemini, Vertex AI | pay per call; the reason for the budget alert |
| LiveKit | on the LiveKit project's plan |
| **Cloud SQL `ghoomates`** | **db-perf-optimized-N-8 (Enterprise Plus, 8 vCPU) is roughly $0.8 an hour, about $19 a day, plus 100 GB of storage.** It runs whether or not you deploy; it dwarfs everything above. |

When the hackathon is over: `deploy/cloudrun.sh pause`, then stop the database (`gcloud sql instances patch ghoomates --activation-policy=NEVER`; storage is still billed, data stays) or resize it, and delete what you do not need:

```bash
gcloud run services delete ghoomates ghoomates-agent --region=asia-south1
gcloud secrets list --filter='name~ghoomates-' --format='value(name)' | xargs -n1 gcloud secrets delete --quiet
gcloud artifacts docker images list asia-south1-docker.pkg.dev/optimal-comfort-510810-d1/ghoomates/web
```

## Pre-demo checklist

1. `deploy/secrets.sh --check` shows every secret you rely on as present. `deploy/cloudrun.sh all` ended without a warning (exit code 0).
2. The redirect URI is in the OAuth client and the consent screen is *In production* (or the jury are test users). Sign in **from a phone on mobile data**, not just from your laptop: Google, selfie, home.
3. `curl https://ghoomates-449943395156.asia-south1.run.app/health` shows `"trips":"enabled"`. If it says disabled, the database connection failed (logs; `roles/cloudsql.client`, `DB_PASSWORD`).
4. Create a trip with the real sign-in, copy the invite link and open it on a second phone (the link uses `CLIENT_ORIGIN`).
5. Upload a few photos **ahead of time** and wait for indexing: `face-indexer` and `face-search` scale to zero and load models on a cold start, so the first photo or "find me" after a quiet hour can take half a minute. To keep `face-search` warm: `gcloud run services update face-search --min-instances=1 --region=asia-south1` (set it back to 0 afterwards).
6. Itinerary draft returns a Gemini plan, not the template one (the `GEMINI_API_KEY` secret is present).
7. Voice: tap GhoomMate on a phone, allow the microphone, say a sentence. The agent logs show `received job request`. Nobody else is registered as `ghoomate-prod`.
8. Prepare a demo trip, squad and photos in advance; if the test sign-in is on, use the demo accounts for it.
9. Warm the web service a few minutes before (any request), and make a QR code of the URL for the jury.
10. Backup: `npm run dev` plus `npm run share` (ngrok) on a laptop.
11. Afterwards: redeploy without `ALLOW_DEV_LOGIN`, `pause`, stop or resize Cloud SQL.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `Missing required secret(s)` | Run `deploy/secrets.sh`; `DB_PASSWORD` must be in `backend/.env` or exported. |
| Deploy fails, revision not ready | `gcloud run services logs read ghoomates --region=asia-south1 --limit=50`. `JWT_SECRET must be at least 32 characters` means the secret is missing. |
| `/health` shows `trips: disabled` | The database connection failed and the server fell back to in-memory auth. Check `roles/cloudsql.client` on `ghoomates-web`, the password, and that the Cloud SQL Admin API is on. |
| Google `redirect_uri_mismatch` | The URI in the OAuth client must match exactly, `https://…/auth/callback`, with no trailing slash. Wait a few minutes after saving. |
| Google "access blocked" | The consent screen is in *Testing* and the account is not a test user. |
| The service answers 403 | Not public: an organisation policy (domain restricted sharing) may have refused `allUsers`. Ask an admin, or `PUBLIC_ACCESS=no-invoker-check deploy/cloudrun.sh`, which turns off Cloud Run's IAM check instead. |
| Uploads work but photos disappear | `GCS_CREDENTIALS_BASE64` is missing, so the container disk was used. Create the secret and redeploy. |
| Voice never answers | The worker is not registered (agent logs), the names differ (`GHOOMATE_AGENT_NAME`), or the LiveKit secrets are missing. Use the laptop fallback above. |
| Build fails with a permission error | Give the Cloud Build account `roles/artifactregistry.writer` and `roles/logging.logWriter` (the face services build the same way). |

## Try the image locally (optional)

```bash
docker build -t ghoomates-web .
docker run --rm -p 8080:8080 -e JWT_SECRET=$(openssl rand -hex 32) -e ALLOW_DEV_LOGIN=true ghoomates-web
# http://localhost:8080 : the app and the API on one port, in-memory auth, no database
```

A local build is for your CPU (arm64 on an M-series Mac); `deploy/cloudrun.sh` builds in Cloud Build for Cloud Run.

## Files

| File | Role |
| --- | --- |
| `Dockerfile`, `.dockerignore`, `.gcloudignore` | The image, and what stays out of the Docker and Cloud Build uploads (`.env` files, `node_modules`, `.claude/`) |
| `deploy/cloudrun.sh` | Setup, build, deploy, public access, health check, pause and resume |
| `deploy/secrets.sh` | `backend/.env` to Secret Manager |
| `deploy/common.sh`, `deploy/cloudbuild.yaml` | Shared settings and helpers; the Cloud Build config |
| `backend/src/frontend.ts` | The router that serves `frontend/dist` (`SERVE_FRONTEND_DIR`) |
| `backend/src/auth/devLogin.ts` | When the test sign-in works and for whom |
| `backend/tests/deploy/production.test.ts` | Tests for both |

## The VM at ghoomates.sourabh.org

The live demo runs on a plain Compute Engine VM instead of Cloud Run:

- VM `ghoomates` (e2-small, Debian 12, `asia-south1-b`), static IP `ghoomates-ip` (35.244.28.91), network tag `lagaan-web` (opens 80 and 443).
- Cloudflare: `ghoomates.sourabh.org` A record to that IP, DNS only (not proxied), so Caddy gets its own Let's Encrypt certificate.
- Caddy (`/etc/caddy/Caddyfile`) terminates TLS and proxies to Node on `127.0.0.1:8080`.
- systemd unit `ghoomates` runs `node src/index.ts` from `/opt/ghoomates/app/backend` as user `ghoomates`, with `NODE_ENV=production`. Its `backend/.env` is the local one with the production overrides (`CLIENT_ORIGIN`, `GOOGLE_REDIRECT_URI`, a generated `JWT_SECRET`, `SERVE_FRONTEND_DIR`).
- The database is reached through `DATABASE_URL`, the same as local dev.

```bash
deploy/vm.sh          # build the web app, ship the code, npm ci, restart, check /health
deploy/vm.sh --env    # same, and also push backend/.env again (keeps the server's JWT secret)
deploy/vm.sh logs     # last 100 lines of the server log
```

The Google OAuth client needs `https://ghoomates.sourabh.org/auth/callback` as an authorized redirect URI and `https://ghoomates.sourabh.org` as a JavaScript origin. The voice worker is not on the VM; run it with `deploy/cloudrun.sh agent` (with `PUBLIC_URL=https://ghoomates.sourabh.org`) or from a laptop.
