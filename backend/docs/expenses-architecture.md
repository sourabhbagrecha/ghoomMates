# Backend Architecture & Design Document
**Module:** `expenses`  
**Monorepo Path:** `backend` (module `src/expenses/`, served by the unified backend)  
**Ecosystem:** GhoomMates Travel Companion Platform  
**Runtimes:** Node.js (v22.18+) &bull; **Database:** Google Cloud SQL for PostgreSQL 18

---

## 1. Executive Summary & Core Objectives

The `expenses` module of the unified backend is the component within the **GhoomMates** monorepo responsible for multi-traveler group expense sharing, real-time ledger accounting, debt minimization, and manual settlement verification.

### Key Tenets
1. **Zero Financial Precision Drift**: No floating-point numbers are used for monetary calculations. All amounts are stored and calculated as 64-bit integer **paise** ($1\text{ INR} = 100\text{ paise}$).
2. **ACID Transactional Consistency**: All balance mutations, sequential audit logs, and idempotency states execute within a single Postgres transaction.
3. **Strict Idempotency**: All state-modifying requests require a unique `Idempotency-Key` header hashed via SHA-256 to prevent duplicate charges or double payments.
4. **Platform & Runtime Neutrality**: Runs on standard Node.js, executing the TypeScript sources directly with no build step.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients & Gateways"]
        Web["Web Client\n(Desktop/Mobile)"]
        Gateway["GhoomMates API Gateway\n/ Backend Services"]
    end

    subgraph Service["Expense Service (Port 3000)"]
        HTTP["HTTP Dispatcher\n(Express 5 on Node.js)"]
        Auth["Auth & Security Guard\n(Bearer Token & Constant-Time Check)"]
        Router["REST Router & Parser\n(app.ts)"]
        Domain["Domain Engine\n(Split Math & Debt Graph)"]
        ServiceLayer["ExpenseService\n(Transactional Workflows)"]
    end

    subgraph Storage["Google Cloud Platform (Managed)"]
        CloudSQL["Google Cloud SQL\n(PostgreSQL 18, instance ghoomates)"]
        Tables[("Tables:\ngroups, group_members\nexpenses, expense_shares\nsettlements\nidempotency_keys")]
    end

    Web -->|HTTPS| Gateway
    Gateway -->|Internal HTTP + API_KEY| HTTP
    HTTP --> Auth
    Auth --> Router
    Router --> ServiceLayer
    ServiceLayer <--> Domain
    ServiceLayer -->|Cloud SQL Node.js Connector\nTLS + IAM-authorized| CloudSQL
    CloudSQL --- Tables
```

---

## 3. Data Model & Entity Relationships

The service maintains an append-only transaction history alongside per-member balance aggregates to ensure $O(1)$ balance reads without scanning full historical transactions.

```mermaid
erDiagram
    GROUP ||--|{ MEMBER : "contains"
    GROUP ||--|{ EXPENSE : "records"
    GROUP ||--|{ SETTLEMENT : "tracks"
    EXPENSE ||--|{ EXPENSE_SHARE : "splits into"
    IDEMPOTENCY ||--o| GROUP : "protects writes"

    GROUP {
        string id PK "UUID"
        string name "Trip or Group Title"
        string currency "Strictly 'INR'"
        bigint sequence "Strictly monotonically increasing"
        timestamptz created_at
    }

    MEMBER {
        uuid id PK
        uuid group_id FK
        int position "Display order"
        string name "Display Name (1-100 chars)"
        bigint balance_paise "Net balance; sums to zero per group"
    }

    EXPENSE {
        string id PK "UUID"
        string groupId FK "Group Reference"
        string payerId FK "Member who paid"
        string description "Expense description"
        int amountPaise "Total cost in integer paise"
        string splitType "equal | exact | percentage"
        int sequence "Order marker in group timeline"
        datetime createdAt "ISO-8601"
    }

    EXPENSE_SHARE {
        uuid expense_id PK "Expense Reference"
        int position PK "Participant order"
        uuid member_id FK "Member Reference"
        bigint amount_paise "Share owed in paise"
    }

    SETTLEMENT {
        string id PK "UUID"
        string groupId FK "Group Reference"
        string fromMemberId FK "Debtor"
        string toMemberId FK "Creditor"
        int amountPaise "Amount paid in paise"
        string verification "Strictly 'manual' for MVP"
        string note "Payment reference (UPI/Cash)"
        int sequence "Order marker in group timeline"
        datetime createdAt "ISO-8601"
    }

    IDEMPOTENCY {
        string id PK "SHA-256(scope, key)"
        string scope "Route identifier"
        string request "Canonical input JSON string"
        string response "Cached response JSON"
    }
```

---

## 4. Algorithmic Domain Logic

### 4.1. Lossless Expense Splitting (`splitExpense`)

Splitting currency among $N$ individuals frequently results in non-divisible fractional cents (e.g. splitting ₹100.00 among 3 participants yields $33.3333...$ paise).

To eliminate rounding leaks:
1. Base shares are computed via integer division:
   $$\text{baseShare}_i = \left\lfloor \frac{\text{amount} \times w_i}{\sum w} \right\rfloor$$
2. The remaining undistributed paise:
   $$\text{remainder} = \text{amount} - \sum \text{baseShare}_i$$
3. Fractional remainder paise ($1\text{ paise}$ each) are distributed sequentially to participants sorted by highest fractional modulo, ensuring:
   $$\sum_{i=1}^N \text{shares}_i = \text{totalAmount}$$
   *Guaranteed: Zero paise created or lost.*

### 4.2. Debt Minimization (`suggestTransfers`)

When a trip ends with complex inter-member balances, a naive settlement requires up to $\frac{N(N-1)}{2}$ transactions.

The service implements a **Greedy Bipartite Settlement Algorithm**:
1. Partition members into **Debtors** ($\text{netPaise} < 0$) and **Creditors** ($\text{netPaise} > 0$).
2. Sort creditors descending by largest surplus, and debtors ascending by largest debt.
3. Greedily pair the largest debtor with the largest creditor:
   $$\text{transfer} = \min(|\text{debt}|, \text{credit})$$
4. Adjust remaining balances and repeat until all net balances reach exactly $0$.
5. **Result**: Reduces transactions to at most $N-1$ transfers.

---

## 5. Concurrency Control & Idempotency Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Client as API Client / Gateway
    participant Router as App Router (app.ts)
    participant Service as ExpenseService
    participant DB as Cloud SQL (PostgreSQL)

    Client->>Router: POST /api/groups/{id}/expenses (with Idempotency-Key)
    Router->>Service: mutate(scope, key, payload, action)
    Service->>DB: BEGIN

    rect rgb(240, 248, 255)
        Note over Service,DB: Inside one READ COMMITTED transaction
        Service->>DB: pg_advisory_xact_lock(sha256(scope, key))
        Service->>DB: SELECT idempotency_keys WHERE id = sha256(scope, key)
        alt Key Exists
            DB-->>Service: Return cached record
            Service-->>Client: 201 Cached JSON (Early Return)
        else Key Does Not Exist
            Service->>DB: SELECT groups WHERE id FOR UPDATE
            Service->>DB: SELECT group_members (current balances)
            Service->>Service: Validate payer & participants
            Service->>Service: Recalculate balances & bump sequence (N+1)
            Service->>DB: UPDATE groups.sequence, group_members.balance_paise
            Service->>DB: INSERT expenses (sequence N+1) + expense_shares
            Service->>DB: INSERT idempotency_keys (request, response)
        end
    end

    DB-->>Service: COMMIT
    Service-->>Router: Success Result
    Router-->>Client: 201 Created (JSON Response)
```

---

## 6. Storage & Database Tier

### Google Cloud SQL for PostgreSQL
The service connects to the `ghoomates` Cloud SQL instance (`optimal-comfort-510810-d1:asia-south1:ghoomates`) through the Cloud SQL Node.js Connector, which fetches ephemeral certificates with Application Default Credentials. No authorized networks or Auth Proxy are needed. The auth and expense modules share one `pg` pool. The schema lives in `migrations/` and is applied on startup.

#### Connection Parameters

| Variable | Example | Purpose |
| :--- | :--- | :--- |
| **`CLOUD_SQL_INSTANCE`** | `project:region:instance` | Instance connection name used by the connector. |
| **`CLOUD_SQL_IP_TYPE`** | `PUBLIC` | `PUBLIC`, `PRIVATE`, or `PSC`. |
| **`DB_USER` / `DB_PASSWORD`** | `ghoomates` | Built-in Postgres user. |
| **`DB_NAME`** | `ghoomates` | Database (`ghoomates_test` for API tests). |
| **`DATABASE_URL`** | `postgres://…` | Alternative to the connector for local Postgres or the Auth Proxy. |

#### Keys & Indexes

| Table | Key | Unique | Purpose |
| :--- | :--- | :--- | :--- |
| `groups` | `id` | **Yes** | Primary key; row lock serializes ledger writes per group. |
| `group_members` | `(group_id, id)` | **Yes** | Target of composite foreign keys that keep members within their group. |
| `expenses` | `(group_id, sequence)` | **Yes** | Chronological reverse-pagination feed. |
| `settlements` | `(group_id, sequence)` | **Yes** | Chronological payment history. |
| `idempotency_keys` | `id` | **Yes** | Constant-time duplicate detection. |

---

## 7. Security Architecture

1. **Internal Authentication Barrier**:
   - Access requires a secret bearer token of $\ge 32$ characters.
   - Evaluated via `crypto.timingSafeEqual` to eliminate timing attack vectors.
2. **Payload Protection**:
   - Maximum body size enforced at 64 KiB to prevent memory exhaustion / DoS attacks.
   - Malformed JSON and missing content-type headers fail early with standardized HTTP 400/415.
3. **No PII or Credentials in Storage**:
   - Only trip nicknames and opaque UUIDs are stored.
   - `.env` files are strictly gitignored and excluded from Docker / Cloud builds via `.dockerignore` and `.gcloudignore`.

---

## 8. Deployment & Operational Checklist

```text
Local Dev (Port 3000) ---> Cloud Run (Port 8080)
   ├── Node 22.18+             ├── node:24-slim Container
   ├── Direct TLS connection   ├── Managed VPC & Secret Manager
   └── Automatic .env loader   └── Zero-trust Service Account (cloudsql.client)
```

### Health Probes & Monitoring
- **Liveness & Readiness**: `GET /health` returns `200 {"status":"ok"}` without database locking overhead, suitable for Cloud Run / Kubernetes probes.
- **Graceful Shutdown**: Intercepts `SIGINT` and `SIGTERM` to close HTTP listeners, and drain the Postgres connection pool cleanly without dropping in-flight transactions.

