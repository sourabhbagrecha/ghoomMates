-- Makers of Udaipur (/api/makers/*): workshops a squad books with a craft maker. The crafts and makers themselves are
-- curated in code (src/makers/), so only bookings live in the database. Prices are whole rupees.
CREATE TABLE IF NOT EXISTS maker_bookings (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  -- Id of a curated maker, e.g. mahendra-chitera
  maker_id text NOT NULL,
  booked_by text NOT NULL REFERENCES users (id),
  -- The itinerary stop added for this booking; kept as NULL if the squad later deletes the stop
  stop_id uuid REFERENCES trip_stops (id) ON DELETE SET NULL,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  workshop_date date NOT NULL,
  -- 12-hour clock as in the itinerary, e.g. "10:30 AM"
  slot text NOT NULL,
  people integer NOT NULL CHECK (people BETWEEN 1 AND 100),
  price_per_person_inr integer NOT NULL CHECK (price_per_person_inr >= 0),
  total_inr integer NOT NULL CHECK (total_inr >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maker_bookings_trip_idx ON maker_bookings (trip_id, workshop_date);
-- Counting who is already booked into a slot
CREATE INDEX IF NOT EXISTS maker_bookings_slot_idx ON maker_bookings (maker_id, workshop_date, slot) WHERE status = 'confirmed';
