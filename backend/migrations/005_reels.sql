-- Reels cut from the trip album (/api/trips/:id/reels). The render itself is stubbed: status is derived
-- from created_at, so a reel "renders" in a few seconds without a worker. See backend/docs/trips.md.
CREATE TABLE trip_reels (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  created_by text NOT NULL REFERENCES users (id),
  title text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  vibe text NOT NULL,
  duration_sec integer NOT NULL CHECK (duration_sec BETWEEN 10 AND 90),
  -- Picked trip_photos in playback order
  photo_ids uuid[] NOT NULL,
  -- Ledger member ids the reel is about (empty = the whole squad)
  featuring uuid[] NOT NULL DEFAULT '{}',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_reels_trip_idx ON trip_reels (trip_id, created_at DESC);
CREATE UNIQUE INDEX trip_reels_idempotency_idx ON trip_reels (trip_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
