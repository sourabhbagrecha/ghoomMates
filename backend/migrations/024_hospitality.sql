-- Farm-to-table hosting (/api/hospitality/*). Hosts, farms, dishes and the produce calendar are curated in code
-- (src/hospitality), so the database only holds what users create: the tables squads reserve, and the leftovers
-- a host logs. Host ids are text slugs from that curated data.
CREATE TABLE IF NOT EXISTS hospitality_reservations (
  id uuid PRIMARY KEY,
  host_id text NOT NULL,
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  -- The squad's name when it booked, so the host sees "Goa Gang" rather than an id.
  group_name text NOT NULL DEFAULT '',
  user_id text NOT NULL REFERENCES users (id),
  meal_date date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('lunch', 'dinner')),
  -- 12-hour clock as shown in the app, e.g. "08:00 PM".
  meal_time text NOT NULL DEFAULT '',
  headcount integer NOT NULL CHECK (headcount BETWEEN 1 AND 60),
  -- { veg, jain, vegan } counts; they add up to headcount.
  dietary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dietary) = 'object'),
  note text NOT NULL DEFAULT '',
  -- The Food stop added to the squad's itinerary. If the stop is deleted the table stays booked.
  stop_id uuid REFERENCES trip_stops (id) ON DELETE SET NULL,
  day_number integer CHECK (day_number BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Reserving the same host, day and meal again updates the booking instead of doubling it.
  UNIQUE (trip_id, host_id, meal_date, meal)
);
CREATE INDEX IF NOT EXISTS hospitality_reservations_host_idx ON hospitality_reservations (host_id, meal_date);

CREATE TABLE IF NOT EXISTS hospitality_waste_logs (
  host_id text NOT NULL,
  log_date date NOT NULL,
  leftover_kg numeric(7, 2) NOT NULL CHECK (leftover_kg >= 0 AND leftover_kg <= 500),
  covers integer NOT NULL DEFAULT 0 CHECK (covers >= 0),
  note text NOT NULL DEFAULT '',
  logged_by text REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (host_id, log_date)
);
