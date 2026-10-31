# Ghoomates backend

Single Node.js / Bun + TypeScript server for every Ghoomates backend module. One process, one port, one shared Google Cloud SQL (Postgres) connection pool.

| Prefix | Module | Source | Docs |
| --- | --- | --- | --- |
| `/health`, `/` | Server health and enabled modules | `src/app.ts` | — |
| `/auth/*` | Google OAuth login, JWT sessions, user profile | `src/auth/` | [docs/auth.md](docs/auth.md) |
| `/api/*` | Expense groups, splits, balances, settlements | `src/expenses/` | [docs/expenses.md](docs/expenses.md), [architecture](docs/expenses-architecture.md) |

## Configuration

Copy `.env.example` to `.env`. All modules read the same file.

- `CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: shared Cloud SQL database, reached through the [Cloud SQL Node.js Connector](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector) with Application Default Credentials (`gcloud auth application-default login` locally, `roles/cloudsql.client` on the Cloud Run service account). `DATABASE_URL` can replace them with any Postgres connection string. Without either, auth uses an in-memory store and the expense API is disabled.
- `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`: auth.
- `API_KEY`: required to enable the expense API (at least 32 characters). Without it, `/api/*` returns 503.

`GET /health` reports which modules are enabled.

## Running locally

```bash
# From repository root
npm run dev:backend

# Or from backend/
npm install
npm run dev        # Node
bun run dev:bun    # Bun
```

Default address: `http://127.0.0.1:3000`. The frontend Vite dev server proxies `/auth` here.

## Tests

```bash
npm test                 # routing + auth tests (node:test)
bun run test:unit        # expense domain tests
DB_NAME=ghoomates_test bun run test:expenses    # expense domain + API tests (needs a database)
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

The `Dockerfile` builds the whole backend with Bun and binds to `0.0.0.0:$PORT` (8080 in the image). See [Cloud Run deployment](../cloud-ops/deploy/README.md).
