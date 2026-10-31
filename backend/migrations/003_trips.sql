-- Trips (/api/trips/*): a trip group of signed-in users. Each trip owns one expense ledger group, and every
-- trip member is a ledger member, so the expense tables keep balances while trips hold who the members are.
CREATE TABLE trips (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  group_name text NOT NULL,
  destination text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  budget text NOT NULL DEFAULT '',
  -- Frontend cover key (a destination id) or a media object key.
  cover text NOT NULL DEFAULT '',
  -- Free-form planning details from the create flow (vibe tweaks, flexible length, ...).
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  invite_code text NOT NULL UNIQUE,
  expense_group_id uuid NOT NULL UNIQUE REFERENCES groups (id),
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE trip_members (
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id text NOT NULL REFERENCES users (id),
  ledger_member_id uuid NOT NULL UNIQUE REFERENCES group_members (id),
  role text NOT NULL DEFAULT 'mate' CHECK (role IN ('organiser', 'mate')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX trip_members_user_idx ON trip_members (user_id);

-- Trip-facing expense details; the ledger columns are unchanged.
ALTER TABLE expenses ADD COLUMN category text NOT NULL DEFAULT 'other';
ALTER TABLE expenses ADD COLUMN receipt_key text;
ALTER TABLE expenses ADD COLUMN created_by text REFERENCES users (id);

-- Photos uploaded straight from the browser to GCS. Face detection fills in later tables.
CREATE TABLE trip_photos (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  uploaded_by text NOT NULL REFERENCES users (id),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes bigint,
  width integer,
  height integer,
  caption text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_photos_trip_idx ON trip_photos (trip_id, created_at DESC);
