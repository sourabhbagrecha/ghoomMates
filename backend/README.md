# Ghoomates backend

Single Node.js / Bun + TypeScript server for every Ghoomates backend module. One process, one port, one shared MongoDB (Firestore compatibility) connection.

| Prefix | Module | Source | Docs |
| --- | --- | --- | --- |
| `/health`, `/` | Server health and enabled modules | `src/app.ts` | — |
| `/auth/*` | Google OAuth login, JWT sessions, user profile | `src/auth/` | [docs/auth.md](docs/auth.md) |
| `/api/*` | Expense groups, splits, balances, settlements | `src/expenses/` | [docs/expenses.md](docs/expenses.md), [architecture](docs/expenses-architecture.md) |

## Configuration

Copy `.env.example` to `.env`. All modules read the same file.

- `MONGODB_URI` / `DATABASE_NAME`: shared database. Without `MONGODB_URI`, auth uses an in-memory store and the expense API is disabled.
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
bun run test:expenses    # expense domain + API tests (needs a database)
npm run typecheck
```

## Layout

- `src/index.ts`: startup, environment, shared database connection, graceful shutdown.
- `src/app.ts`: top-level router that dispatches by path prefix.
- `src/env.ts`: `.env` loader.
- `src/auth/`: OAuth module.
- `src/expenses/`: expense module.
- `tests/`, `scripts/`, `config/`, `firebase.json`: tests, operational scripts, and Firestore configuration.

## Deploy

The `Dockerfile` builds the whole backend with Bun and binds to `0.0.0.0:$PORT` (8080 in the image). See [Cloud Run deployment](../cloud-ops/deploy/README.md).
