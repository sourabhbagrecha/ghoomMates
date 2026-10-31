# Ghoomates expense service

Independently runnable expense-splitting microservice in the Ghoomates monorepo.

Node.js / Bun + TypeScript HTTP API backed by Google Cloud Firestore (via MongoDB compatibility protocol or native SDK). Money remains integer paise; the HTTP API is unchanged.

## Connecting to Google Cloud Firestore (MongoDB compatibility)

Google Cloud Firestore supports the MongoDB wire protocol on port 443. Configure your connection string in `backend/expense-service/.env`:

```env
HOST=127.0.0.1
PORT=3001
API_KEY=your-32-char-random-secret
MONGODB_URI=mongodb://gaurav:PASSWORD@48095cea-e799-4751-b4b9-ae96af9322b9.asia-south1.firestore.goog:443/splitwise?loadBalanced=true&tls=true&authMechanism=SCRAM-SHA-256&retryWrites=false
DATABASE_NAME=splitwise
```

### Verification & Run Commands

```bash
# Verify connection to the Firestore cluster:
npm run test:connection

# Run end-to-end trip verification (group, expense, split, settlement):
node scripts/verify-e2e.ts

# Start the service (with Node or Bun):
npm start
# or:
bun start
```

## Run locally with the Firestore emulator

Install [Bun](https://bun.com/docs/installation), Node.js 22+ (for Firebase CLI), and Java 21+ (for the emulator). From the repository root:

```bash
cd backend/expense-service
bun install --frozen-lockfile
cp .env.example .env
openssl rand -hex 32
# Set API_KEY in .env to the generated value.
bunx firebase-tools@15.34.2 emulators:start --only firestore --project demo-ghoomates
```

In another terminal, from `backend/expense-service/`:

```bash
bun run dev
```

Default API address: `http://127.0.0.1:3001`. The example environment points to the local emulator at `127.0.0.1:8080` with project `demo-ghoomates`; no cloud credentials or real project are needed. Demo project IDs are rejected unless an emulator host is set. Emulator data is temporary unless explicitly exported/imported using Firebase CLI.

### Tests

```bash
bun run test:unit
bun run typecheck
# Starts a local emulator, runs all tests, and stops the emulator:
bunx firebase-tools@15.34.2 emulators:exec --only firestore --project demo-ghoomates 'bun run test'
```

If an emulator is already running:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 bun run test
```

Integration tests require a localhost emulator and use randomly named `demo-` projects. They do not read or erase production data. Missing emulator configuration fails explicitly rather than silently skipping integration tests. Tests cover duplicate retries, concurrent expenses, simultaneous settlement attempts, client reconnects, and history pagination. Validated with Bun 1.4.4 and the official Firestore emulator.

## Connect to Google Cloud Firestore

1. Create or select a Firebase/Google Cloud project with a Firestore **Native mode** `(default)` database. Choose the database location for your application.
2. Set `GOOGLE_CLOUD_PROJECT` in `backend/expense-service/.env` to the real project ID and remove `FIRESTORE_EMULATOR_HOST` from both `.env` and your shell.
3. Configure [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc). For local development with the Google Cloud CLI, run `gcloud auth application-default login`. In a Google Cloud deployment, use an attached service account with the required Firestore IAM permissions (typically `roles/datastore.user`). If a credential file is necessary, keep it outside this repo and point `GOOGLE_APPLICATION_CREDENTIALS` to it.
4. Review and deploy the checked-in rules/index configuration to your chosen project:

```bash
bunx firebase-tools@15.34.2 deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
bun start
```

These commands are setup instructions; no cloud project has been created or deployed by this change. The server SDK uses IAM and bypasses Firestore client Security Rules. The supplied rules deny direct web/mobile access, because this MVP routes all access through the backend. Firebase CLI login and backend ADC are separate authentication mechanisms. See [Firestore access rules](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Current scope

- INR trip groups with up to 100 members, each with a generated stable ID.
- One payer per expense; any subset of the group's members can participate.
- Equal, exact, and percentage splits with deterministic rounding.
- Immutable expenses, paginated expense history, and member net balances.
- Suggested transfers based on net balances, including partial settlements.
- Manually confirmed payment records and settlement history.
- Firestore transactions and persistent idempotency keys on every POST.

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

List limits are 1–100. Offset pagination preserves the existing API, but skipped documents still incur Firestore reads; use small offsets in this MVP and move to cursor pagination for large histories. Mutations return HTTP 201; replaying the same key and request returns the original body with 201. Reusing the key with different content returns 409. Keys are scoped to the group/resource (group creation has its own scope) and currently retained indefinitely. A failed validation does not consume the key.

### Create a group

Set `API_KEY` in your shell to the same value as the backend `.env` file:

```bash
curl http://127.0.0.1:3001/api/groups \
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

## Firestore data model

```text
groups/{groupId}
  id, name, currency, createdAt, members[], balances{memberId: netPaise}, sequence
  expenses/{expenseId}
    id, groupId, payerId, description, amountPaise, splitType, shares[], createdAt, sequence
  settlements/{settlementId}
    id, groupId, fromMemberId, toMemberId, amountPaise, note, verification, createdAt, sequence
idempotency/{sha256(scope, key)}
  scope, request, response
```

The group document holds at most 100 members and their aggregate balances. Each expense or settlement updates this document, creates an immutable history document, and saves its idempotency response in **one transaction**. Reading the group inside the transaction ensures concurrent writes retry against current balances; no external payment calls happen in retryable callbacks. History lives in subcollections so it does not grow the group document indefinitely. A transaction-controlled sequence orders history even when timestamps match.

Group writes serialize through one document, which is appropriate for trip-sized groups rather than a high-throughput shared ledger. All writes must go through this service to preserve aggregate balances; direct console edits can violate its invariants. `config/firestore.indexes.json` exempts unqueried member/balance/share payloads and idempotency bodies from indexing. History queries use Firestore's default single-field `sequence` index.

The former SQL schema has been removed. No SQLite data is automatically imported or deleted; if an earlier local database contains meaningful data, migrate it explicitly before switching environments. Collections are created on first write; there is no SQL migration runner.

## Layout

- `src/index.ts`: startup, environment configuration, graceful shutdown.
- `src/app.ts`: async HTTP routing, service authentication, validation, errors.
- `src/domain.ts`: integer money allocation and transfer suggestions.
- `src/service.ts`: Firestore ledger operations and atomic idempotency.
- `src/database.ts`: Firestore client configuration and emulator guard.
- `config/firestore.rules`: deny direct client access; server access uses IAM.
- `config/firestore.indexes.json`: index exemptions.
- `firebase.json`: local emulator and deployment configuration.
- `tests/`: domain and emulator-backed API tests.

References: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).

## Deploy and test remotely

See [Cloud Run deployment](../../cloud-ops/deploy/README.md). The service Dockerfile builds only production dependencies and binds to `0.0.0.0:$PORT`. Environment files and local credentials are excluded from both image and source uploads.

After deployment, set `BASE_URL` to the returned HTTPS URL and `API_KEY` to the service token, then run:

```bash
# From this service directory:
bun scripts/test-api.ts
```

This creates a sample group, adds a ₹1,200 expense split three ways, fetches balances and suggested transfers, and records one sample manual settlement. It leaves labeled test data in Firestore and does not move real money.
