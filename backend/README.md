# GhoomMates backend

Single Node.js + TypeScript server for every GhoomMates backend module. One process, one port, one shared MongoDB Atlas client.

| Prefix | Module | Source | Docs |
| --- | --- | --- | --- |
| `/health`, `/` | Server health and enabled modules | `src/app.ts` | — |
| `/auth/*` | Google OAuth login, JWT sessions, user profile | `src/auth/` | [docs/auth.md](docs/auth.md) |
| `/api/trips/*` | Trips for signed-in users: create, invite/join, expenses, settle up, photo uploads, itinerary | `src/trips/` | [docs/trips.md](docs/trips.md) |
| `/api/*` | Internal expense ledger (service token): groups, splits, balances, settlements | `src/expenses/` | [docs/expenses.md](docs/expenses.md), [architecture](docs/expenses-architecture.md) |

## Configuration

Copy `.env.example` to `.env`. All modules read the same file.

- `MONGODB_CONNECTION_STRING`, `MONGODB_DB` (default `ghoomates`): shared MongoDB Atlas database, also used by the face services in `cloud/`. Atlas Network Access must allow your IP (Cloud Run needs `0.0.0.0/0`). `DB_POOL_SIZE` caps the driver pool (default 10). Without a connection string, auth uses an in-memory store and the expense API is disabled.
- `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`: auth.
- `API_KEY`: required to enable the expense API (at least 32 characters). Without it, `/api/*` returns 503.

`GET /health` reports which modules are enabled.

## Running locally

The database is MongoDB Atlas, configured in the ignored `backend/.env` with `MONGODB_CONNECTION_STRING`
and `MONGODB_DB`. Check the connection, or open a shell on the app database (needs `mongosh` installed):

```bash
npm --prefix backend run test:connection
npm --prefix backend run mongosh
```

There are no migrations: `src/schema.ts` lists every collection and its indexes, and startup creates
whatever is missing.

Requires Node.js 22.18+ (runs the TypeScript sources directly, no build step).

```bash
# From repository root: installs everything, then runs backend + frontend together
npm install
npm run dev

# Backend only
npm run dev:backend   # or, from backend/: npm run dev
```

Default address: `http://127.0.0.1:3000` (`PORT` in `.env` overrides it). The frontend Vite dev server proxies `/auth` and `/api` here.

## Tests

```bash
npm test                 # every module's tests (node:test)
npm run test:unit        # expense domain tests only
npm run test:expenses    # expense domain + API tests
npm run typecheck
npm run test:connection  # connect, create indexes, list collection document counts
```

Tests that need a database start an in-process MongoDB (`tests/mongo.ts`, a single-node replica set so transactions work) and give each test file its own empty database, so `npm test` needs no external database. `TEST_MONGODB_CONNECTION_STRING` points them at an existing server instead.

## Layout

- `src/index.ts`: startup, environment, shared database client, graceful shutdown.
- `src/db.ts`: MongoDB client, transaction helper, duplicate-key check.
- `src/schema.ts`: collections and indexes (created on startup) and the document contract that replaced the SQL tables.
- `src/app.ts`: top-level router that dispatches by path prefix.
- `src/env.ts`: `.env` loader.
- `src/auth/`: OAuth module.
- `src/expenses/`: expense module.
- `tests/`, `scripts/`: tests and operational scripts.

## Deploy

The `Dockerfile` at the repository root builds the API and the web app into one image for Cloud Run, and `deploy/cloudrun.sh` builds and deploys it (`deploy/secrets.sh` moves `.env` into Secret Manager first). Setup, the Google sign-in step, costs and the pre-demo checklist are in [docs/deploy.md](docs/deploy.md). The `Dockerfile` in this folder is the older API-only image.

`SERVE_FRONTEND_DIR` makes the server also serve the built web app; `ALLOW_DEV_LOGIN` controls the mock sign-in, which is off when `NODE_ENV=production`.
