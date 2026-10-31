# Ghoomates backend

Single Node.js + TypeScript server for every Ghoomates backend module. One process, one port, one shared PostgreSQL connection pool (local or Google Cloud SQL).

| Prefix | Module | Source | Docs |
| --- | --- | --- | --- |
| `/health`, `/` | Server health and enabled modules | `src/app.ts` | — |
| `/auth/*` | Google OAuth login, JWT sessions, user profile | `src/auth/` | [docs/auth.md](docs/auth.md) |
| `/api/trips/*` | Trips for signed-in users: create, invite/join, expenses, settle up, photo uploads, itinerary | `src/trips/` | [docs/trips.md](docs/trips.md) |
| `/api/*` | Internal expense ledger (service token): groups, splits, balances, settlements | `src/expenses/` | [docs/expenses.md](docs/expenses.md), [architecture](docs/expenses-architecture.md) |

## Configuration

Copy `.env.example` to `.env`. All modules read the same file.

- `CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: shared Cloud SQL database, reached through the [Cloud SQL Node.js Connector](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector) with Application Default Credentials (`gcloud auth application-default login` locally, `roles/cloudsql.client` on the Cloud Run service account). `DATABASE_URL` can replace them with any Postgres connection string, including a direct encrypted connection to the instance's public IP that needs no Google credentials (see `.env.example`). Without either, auth uses an in-memory store and the expense API is disabled.
- `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`: auth.
- `API_KEY`: required to enable the expense API (at least 32 characters). Without it, `/api/*` returns 503.

`GET /health` reports which modules are enabled.

## Running locally

Local PostgreSQL is configured in the ignored `backend/.env` using `DATABASE_URL`.
The development database is `ghoomates`, owned by the `ghoomates_local` role, on `127.0.0.1:5432`.
The password is kept in `.env`. Start the installed service with:

```bash
brew services start postgresql@14
npm --prefix backend run test:connection
```

Migrations apply automatically on startup. To switch to Cloud SQL later, comment out
`DATABASE_URL` and enable `CLOUD_SQL_INSTANCE` with its `DB_USER`, `DB_PASSWORD`, and
`DB_NAME` settings. Cloud SQL takes priority when both connection settings are enabled.
Switching connections does not copy local data into the cloud database.

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
npm test                 # routing, auth, and expense domain tests (node:test)
npm run test:unit        # expense domain tests only
DB_NAME=ghoomates_test npm run test:expenses    # expense domain + API tests (needs a database)
npm run typecheck
npm run test:connection  # connect, apply migrations, list table row counts
```

The API tests write groups to the configured database; point them at the `ghoomates_test` database, not `ghoomates`.

## Layout

- `src/index.ts`: startup, environment, shared database pool, graceful shutdown.
- `src/db.ts`: Cloud SQL / Postgres pool, migration runner, transaction helper.
- `migrations/`: SQL schema migrations, applied in filename order on startup and tracked in `schema_migrations`.
- `src/app.ts`: top-level router that dispatches by path prefix.
- `src/env.ts`: `.env` loader.
- `src/auth/`: OAuth module.
- `src/expenses/`: expense module.
- `tests/`, `scripts/`: tests and operational scripts.

## Deploy

The `Dockerfile` builds the whole backend on Node.js 24 and binds to `0.0.0.0:$PORT` (8080 in the image). See [Cloud Run deployment](../cloud-ops/deploy/README.md).
