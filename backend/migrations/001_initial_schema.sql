-- Users signed in through Google OAuth (/auth/*).
CREATE TABLE users (
  id text PRIMARY KEY,
  google_id text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  email_verified boolean NOT NULL,
  name text NOT NULL,
  given_name text,
  family_name text,
  picture text,
  locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);

-- Expense ledger (/api/*). All amounts are integer paise.
CREATE TABLE groups (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  currency text NOT NULL CHECK (currency = 'INR'),
  -- Incremented on every ledger write; orders expense and settlement history.
  sequence bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups (id),
  position integer NOT NULL,
  name text NOT NULL,
  -- Net position: positive is owed to the member, negative is owed by them. Sums to zero per group.
  balance_paise bigint NOT NULL DEFAULT 0,
  UNIQUE (group_id, position),
  UNIQUE (group_id, id)
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups (id),
  sequence bigint NOT NULL,
  payer_id uuid NOT NULL,
  description text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  split_type text NOT NULL CHECK (split_type IN ('equal', 'exact', 'percentage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, sequence),
  FOREIGN KEY (group_id, payer_id) REFERENCES group_members (group_id, id)
);

CREATE TABLE expense_shares (
  expense_id uuid NOT NULL REFERENCES expenses (id),
  position integer NOT NULL,
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  PRIMARY KEY (expense_id, position),
  FOREIGN KEY (group_id, member_id) REFERENCES group_members (group_id, id)
);

CREATE TABLE settlements (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups (id),
  sequence bigint NOT NULL,
  from_member_id uuid NOT NULL,
  to_member_id uuid NOT NULL CHECK (to_member_id <> from_member_id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  note text NOT NULL DEFAULT '',
  verification text NOT NULL CHECK (verification = 'manual'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, sequence),
  FOREIGN KEY (group_id, from_member_id) REFERENCES group_members (group_id, id),
  FOREIGN KEY (group_id, to_member_id) REFERENCES group_members (group_id, id)
);

-- Stored responses for Idempotency-Key retries. id is sha256 of [scope, key].
CREATE TABLE idempotency_keys (
  id text PRIMARY KEY,
  scope text NOT NULL,
  request text NOT NULL,
  response text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
