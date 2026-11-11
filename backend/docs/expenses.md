# GhoomMates expense service

Expense-splitting module of the unified GhoomMates backend, mounted at `/api/*`. See [../README.md](../README.md) for running the server.

Node.js + TypeScript HTTP API backed by MongoDB Atlas, shared with the auth module and every other module. Money remains integer paise; the HTTP API is unchanged.

> 📖 **Architecture & Design Document**: For data models, entity relationships, splitting algorithms, and transaction lifecycles, see [expenses-architecture.md](expenses-architecture.md).

## Connecting to MongoDB

The server connects to MongoDB Atlas with the official Node.js driver. Atlas Network Access must allow the caller's IP (Cloud Run needs `0.0.0.0/0`). Configure `backend/.env`:

```env
HOST=127.0.0.1
PORT=3000
API_KEY=your-32-char-random-secret
MONGODB_CONNECTION_STRING=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DB=ghoomates
```

There are no migrations: on startup, `src/schema.ts` creates any missing collection and index. Transactions need a replica set, which every Atlas cluster is.

### Verification & Run Commands

```bash
# Connect, create indexes, and list collection document counts:
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
npm run test:expenses
```

API tests run against an in-process MongoDB replica set (`tests/mongo.ts`), each file in its own throwaway database, so they need no external database and never touch `ghoomates`. They cover duplicate retries, concurrent expenses, simultaneous settlement attempts, a new database connection, and history pagination. The suite allows 30 seconds per test.

## Current scope

- INR trip groups with up to 100 members, each with a generated stable ID.
- One payer per expense; any subset of the group's members can participate.
- Equal, exact, and percentage splits with deterministic rounding.
- Immutable expenses, paginated expense history, and member net balances.
- Suggested transfers based on net balances, including partial settlements.
- Manually confirmed payment records and settlement history.
- MongoDB multi-document transactions and persistent idempotency keys on every POST.

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

List limits are 1–100. Offset pagination preserves the existing API, but MongoDB still walks skipped documents; use small offsets in this MVP and move to cursor pagination for large histories. Mutations return HTTP 201; replaying the same key and request returns the original body with 201. Reusing the key with different content returns 409. Keys are scoped to the group/resource (group creation has its own scope) and currently retained indefinitely. A failed validation does not consume the key.

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

Collections and indexes: [`src/schema.ts`](../src/schema.ts). `_id` is the UUID string.

```text
groups            _id, name, currency, sequence, created_at
group_members     _id, group_id, position, name, balance_paise          unique (group_id, position)
expenses          _id, group_id, sequence, payer_id, description, amount_paise, split_type, created_at,
                  category, receipt_key, created_by,
                  shares: [{ position, member_id, amount_paise }]      unique (group_id, sequence)
settlements       _id, group_id, sequence, from_member_id, to_member_id, amount_paise, note, verification, created_at
                                                                        unique (group_id, sequence)
idempotency_keys  _id = sha256(scope, key), scope, request, response, created_at
```

Each member document holds that member's net balance. Each expense or settlement runs in **one transaction**: it first bumps the group's `sequence` with `$inc`, rereads balances, applies the balance changes as `$inc` deltas, inserts an immutable history document with its shares embedded, and stores its idempotency response. Because every write to a group updates the same group document, concurrent writes to a group write-conflict and the driver re-runs the losers on a fresh snapshot, so each sees current balances; no external payment calls happen inside the transaction. Requests sharing an idempotency key also bump that sequence, so a retry re-runs and replays the stored response; one whose snapshot predates the winner's commit hits a duplicate key on the `idempotency_keys` insert and is run once more to replay it. The per-group sequence orders history even when timestamps match.

There are no foreign keys: the service checks that payers, participants and settlement parties belong to the group before writing. Group writes serialize through one document, which suits trip-sized groups rather than a high-throughput shared ledger. All writes must go through this service to keep balances equal to the ledger; direct edits in `mongosh` can break that invariant.

## Layout

- `src/index.ts`: unified server startup, environment configuration, graceful shutdown.
- `src/expenses/app.ts`: async HTTP routing, service authentication, validation, errors.
- `src/expenses/domain.ts`: integer money allocation and transfer suggestions.
- `src/expenses/service.ts`: MongoDB ledger operations and atomic idempotency.
- `src/db.ts`: shared MongoDB client, transaction helper, duplicate-key check.
- `src/schema.ts`: collections and indexes.
- `tests/expenses/`: domain and database-backed API tests.

## Deploy and test remotely

See [Cloud Run deployment](../../cloud-ops/deploy/README.md). The service Dockerfile builds only production dependencies and binds to `0.0.0.0:$PORT`. Environment files and local credentials are excluded from both image and source uploads.

After deployment, set `BASE_URL` to the returned HTTPS URL and `API_KEY` to the service token, then run:

```bash
# From this service directory:
node scripts/test-api.ts
```

This creates a sample group, adds a ₹1,200 expense split three ways, fetches balances and suggested transfers, and records one sample manual settlement. It leaves labeled test data in the database and does not move real money.
