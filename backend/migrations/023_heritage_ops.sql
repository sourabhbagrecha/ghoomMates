-- Heritage Ops (/api/ops/*): advisories a site manager publishes ("City Palace is expected packed 10 AM-12 PM"),
-- shown to every traveller whose plan lands in that site and window. The forecast itself is computed, not stored.
CREATE TABLE IF NOT EXISTS heritage_advisories (
  id uuid PRIMARY KEY,
  city text NOT NULL,
  -- Heritage site id from src/heritage/sites.ts, e.g. 'city-palace'
  site_id text NOT NULL,
  advisory_date date NOT NULL,
  -- Minutes after midnight, like trip_stops.minutes
  start_minutes integer NOT NULL CHECK (start_minutes BETWEEN 0 AND 1439),
  end_minutes integer NOT NULL CHECK (end_minutes BETWEEN 1 AND 1440),
  -- The crowd the manager expects in the window
  level text NOT NULL CHECK (level IN ('busy', 'packed')),
  message_en text NOT NULL CHECK (length(message_en) BETWEEN 1 AND 300),
  message_hi text NOT NULL DEFAULT '' CHECK (length(message_hi) <= 420),
  -- A calmer site to swap to, and/or a calmer time at the same site
  alt_site_id text,
  alt_minutes integer CHECK (alt_minutes IS NULL OR alt_minutes BETWEEN 0 AND 1439),
  -- Squads and people planned into the window when it was published (shown to partners only, never to travellers)
  reach_squads integer,
  reach_people integer,
  -- Who published it (a users.id); kept as plain text so an advisory never blocks on the users table
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  CHECK (end_minutes > start_minutes)
);

CREATE INDEX IF NOT EXISTS heritage_advisories_live_idx ON heritage_advisories (city, advisory_date) WHERE withdrawn_at IS NULL;
