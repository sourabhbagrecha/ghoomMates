# GhoomMates expense service

Expense-splitting module of the unified GhoomMates backend, mounted at `/api/*`. See [../README.md](../README.md) for running the server.

Node.js + TypeScript HTTP API backed by Google Cloud SQL for PostgreSQL, shared with the auth module. Money remains integer paise; the HTTP API is unchanged.

> 📖 **Architecture & Design Document**: For data models, entity relationships, splitting algorithms, and transaction lifecycles, see [expenses-architecture.md](expenses-architecture.md).

## Connecting to Cloud SQL

The server connects to the `ghoomates` Cloud SQL instance through the [Cloud SQL Node.js Connector](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector), which authorizes with [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc) and encrypts the connection without authorized networks or the Auth Proxy. Locally, run `gcloud auth application-default login`; on Cloud Run, grant the service account `roles/cloudsql.client`. Configure `backend/.env`:

```env
HOST=127.0.0.1
PORT=3000
API_KEY=your-32-char-random-secret
CLOUD_SQL_INSTANCE=optimal-comfort-510810-d1:asia-south1:ghoomates
DB_USER=ghoomates
DB_PASSWORD=...
DB_NAME=ghoomates
```

`DATABASE_URL=postgres://user:password@host:5432/db` can replace the Cloud SQL variables, for example with a local Postgres or the Cloud SQL Auth Proxy. Pending files in `migrations/` are applied on startup, in filename order, under an advisory lock.

### Verification & Run Commands

```bash
# Connect, apply migrations, and list table row counts:
npm run test:connection

# Run end-to-end trip verification (group, expense, split, settlement); writes sample data:
node scripts/verify-e2e.ts

# Start the service:
npm start
```

### Tests

```bash
npm run test:unit
npm run typecheck
DB_NAME=ghoomates_test npm run test:expenses
```

API tests create groups in the configured database and never delete them, so run them against the `ghoomates_test` database rather than `ghoomates`. They cover duplicate retries, concurrent expenses, simultaneous settlement attempts, new connection pools, and history pagination. Requests from a laptop cross the network to `asia-south1`, so the suite allows 30 seconds per test.

## Current scope

- INR trip groups with up to 100 members, each with a generated stable ID.
- One payer per expense; any subset of the group's members can participate.
- Equal, exact, and percentage splits with deterministic rounding.
- Immutable expenses, paginated expense history, and member net balances.
- Suggested transfers based on net balances, including partial settlements.
- Manually confirmed payment records and settlement history.
- Postgres transactions and persistent idempotency keys on every POST.

This is an **internal API MVP**, not a public multi-user service. The service bearer token grants access to every group; names represent ledger participants, not authenticated users. Do not embed this key in frontend code. User login, per-member authorization, invitations, expense corrections/voids, multiple payers, and rate limiting are future work. The server binds to localhost by default.

There is no UPI integration yet. A settlement records a payment confirmed by a trusted operator, with `verification: "manual"`; it does not initiate a transfer or verify a bank transaction. Payment initiation, provider callbacks, reconciliation, and user permissions must be designed before exposing a one-click UPI flow.

## API

All routes except `GET /health` require `Authorization: Bearer <API_KEY>`. All POST requests require `Content-Type: application/json` and an `Idempotency-Key` header (1–128 letters, digits, `_`, `.`, `:`, or `-`). Bodies are limited to 64 KiB.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| POST | `/api/groups` | Create a trip group and initial members |
| GET | `/api/groups/:id` | Fetch group and members |
| POST | `/api/groups/:id/members` | Add a member |
| POST | `/api/groups/:id/expenses` | Record an expense |
| GET | `/api/groups/:id/expenses?limit=50&offset=0` | List expenses, newest first |
| GET | `/api/groups/:id/balances` | Fetch net member balances |
| GET | `/api/groups/:id/settlement-suggestions` | Suggest transfers |
| POST | `/api/groups/:id/settlements` | Record a manually confirmed payment |
| GET | `/api/groups/:id/settlements?limit=50&offset=0` | List payments, newest first |

List limits are 1–100. Offset pagination preserves the existing API, but Postgres still scans skipped rows; use small offsets in this MVP and move to cursor pagination for large histories. Mutations return HTTP 201; replaying the same key and request returns the original body with 201. Reusing the key with different content returns 409. Keys are scoped to the group/resource (group creation has its own scope) and currently retained indefinitely. A failed validation does not consume the key.

### Create a group

Set `API_KEY` in your shell to the same value as the backend `.env` file:

```bash
curl http://127.0.0.1:3000/api/groups \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: goa-trip-1' \
  -d '{"name":"Goa trip","members":["Asha","Ben","Chen"]}'
```

The response contains the group `id` and generated `members[].id`. Use those IDs in subsequent calls. To add a member, POST `{"name":"Deepa"}` to the members route; previous expense shares remain unchanged.

### Add an expense

POST this body to `/api/groups/<group-id>/expenses`, replacing the IDs:

```json
{
  "description": "Dinner",
  "payerId": "asha-member-id",
  "amountPaise": 10000,
  "split": {
    "type": "equal",
    "participants": [
      { "memberId": "asha-member-id" },
      { "memberId": "ben-member-id" },
      { "memberId": "chen-member-id" }
    ]
  }
}
```

This divides ₹100 into 3334, 3333, and 3333 paise. The payer is credited 10000 and owes their own 3334 share, leaving a net credit of 6666 paise.

For `exact` splits, each participant supplies `value` in paise; values must total `amountPaise`. For `percentage` splits, `value` is integer basis points (5000 = 50%, 10000 = 100%); values must total 10000. For example:

```json
{
  "type": "percentage",
  "participants": [
    { "memberId": "asha-member-id", "value": 5000 },
    { "memberId": "ben-member-id", "value": 2500 },
    { "memberId": "chen-member-id", "value": 2500 }
  ]
}
```

Amounts are positive integer paise, at most 1,000,000,000 per expense or settlement. Shares may be zero. Largest-remainder allocation preserves the total; ties follow participant request order. No floating-point currency calculations are used.

### Balances and settlements

Positive `netPaise` means a member should receive money; negative means they owe money. Suggestions redistribute net debts within the group and may propose paying a different person from the original expense payer. The greedy algorithm clears balances with at most debtors + creditors − 1 transfers, but does not guarantee the globally smallest number of transfers.

After independently confirming a payment, POST to `/api/groups/<group-id>/settlements`:

```json
{
  "fromMemberId": "ben-member-id",
  "toMemberId": "asha-member-id",
  "amountPaise": 1000,
  "confirmed": true,
  "note": "Payment confirmed manually"
}
```

This reduces Ben's debt and Asha's credit by 1000 paise. Partial payments are allowed. Payments must be between different members of the same group and cannot exceed either the debtor's outstanding debt or the creditor's outstanding credit. Balances are rechecked inside the write transaction; refresh suggestions after new expenses or settlements.

Errors use `{"error":{"code":"VALIDATION_ERROR","message":"..."}}` with appropriate 400, 401, 404, 405, 409, 413, 415, or 500 status codes. Unexpected internal details are not exposed.

## Data model

Schema: [`migrations/001_initial_schema.sql`](../migrations/001_initial_schema.sql).

```text
groups            id, name, currency, sequence, created_at
group_members     id, group_id, position, name, balance_paise
expenses          id, group_id, sequence, payer_id, description, amount_paise, split_type, created_at
expense_shares    expense_id, position, group_id, member_id, amount_paise
settlements       id, group_id, sequence, from_member_id, to_member_id, amount_paise, note, verification, created_at
idempotency_keys  id = sha256(scope, key), scope, request, response, created_at
```

Each member row holds that member's net balance. Each expense or settlement locks its group row (`SELECT … FOR UPDATE`), rereads balances, updates them and the group sequence, inserts an immutable history row, and stores its idempotency response in **one transaction**. Concurrent writes to a group therefore queue on the lock and see current balances; no external payment calls happen inside the transaction. Requests sharing an idempotency key also serialize on a transaction-scoped advisory lock, so simultaneous retries replay the first response. The per-group sequence orders history even when timestamps match.

Composite foreign keys on `(group_id, member_id)` make the database reject payers, participants, or settlement parties from another group. Group writes serialize through one row, which suits trip-sized groups rather than a high-throughput shared ledger. All writes must go through this service to keep balances equal to the ledger; direct SQL edits can break that invariant.

## Layout

- `src/index.ts`: unified server startup, environment configuration, graceful shutdown.
- `src/expenses/app.ts`: async HTTP routing, service authentication, validation, errors.
- `src/expenses/domain.ts`: integer money allocation and transfer suggestions.
- `src/expenses/service.ts`: SQL ledger operations and atomic idempotency.
- `src/db.ts`: shared Cloud SQL pool, migration runner, transaction helper.
- `migrations/`: SQL schema.
- `tests/expenses/`: domain and database-backed API tests.

## Deploy and test remotely

See [Cloud Run deployment](../../cloud-ops/deploy/README.md). The service Dockerfile builds only production dependencies and binds to `0.0.0.0:$PORT`. Environment files and local credentials are excluded from both image and source uploads.

After deployment, set `BASE_URL` to the returned HTTPS URL and `API_KEY` to the service token, then run:

```bash
# From this service directory:
node scripts/test-api.ts
```

This creates a sample group, adds a ₹1,200 expense split three ways, fetches balances and suggested transfers, and records one sample manual settlement. It leaves labeled test data in the database and does not move real money.
