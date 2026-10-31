-- Trip itinerary (/api/trips/:id/itinerary, /stops): stops per day plus each member's RSVP.
ALTER TABLE trips ADD COLUMN day_titles jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(day_titles) = 'array');

CREATE TABLE trip_stops (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  -- 12-hour clock as shown in the app, e.g. "05:30 PM"; minutes after midnight orders the day.
  time text NOT NULL DEFAULT '',
  minutes integer NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 1439),
  title text NOT NULL,
  tag text NOT NULL DEFAULT '',
  place text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by text REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_stops_trip_idx ON trip_stops (trip_id, day_number, minutes);

CREATE TABLE trip_stop_rsvps (
  stop_id uuid NOT NULL REFERENCES trip_stops (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id),
  rsvp text NOT NULL CHECK (rsvp IN ('going', 'maybe', 'skip')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stop_id, user_id)
);
