-- Green Trip (/api/impact/*): the ride the squad picked for each leg, each member's pledges, and a cache of answers
-- that never change. Footprint, crowd-hours and local spend are computed from the itinerary and expenses on demand.

-- The mode picked for the ride between two consecutive stops. Deleting or replacing a stop takes its picks with it.
CREATE TABLE IF NOT EXISTS impact_legs (
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  from_stop_id uuid NOT NULL REFERENCES trip_stops (id) ON DELETE CASCADE,
  to_stop_id uuid NOT NULL REFERENCES trip_stops (id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('walk', 'erickshaw', 'auto', 'cab', 'boat')),
  chosen_by text REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, from_stop_id, to_stop_id)
);
CREATE INDEX IF NOT EXISTS impact_legs_from_idx ON impact_legs (from_stop_id);
CREATE INDEX IF NOT EXISTS impact_legs_to_idx ON impact_legs (to_stop_id);

-- Each member ticks their own pledges (ids come from src/impact/pledges.ts).
CREATE TABLE IF NOT EXISTS impact_pledges (
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pledge_id text NOT NULL CHECK (length(pledge_id) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id, pledge_id)
);

-- Answers that don't change: Gemini's sorting of an expense description, a swap's wording, a Routes API distance.
CREATE TABLE IF NOT EXISTS impact_cache (
  key text PRIMARY KEY CHECK (length(key) <= 200),
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
