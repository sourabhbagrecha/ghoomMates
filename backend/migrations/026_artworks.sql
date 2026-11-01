-- Squad Miniature (/api/artworks): trip photos painted as Mewar miniatures and other Udaipur painting traditions.
-- The painting itself lives in the media bucket under trips/<trip id>/artworks/; this row ties it to the trip, the
-- photo it was painted from and the person who asked for it. The per-trip daily limit counts these rows.
CREATE TABLE IF NOT EXISTS trip_artworks (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  -- Kept (as NULL) when the source photo is deleted, so the squad keeps its painting.
  photo_id uuid REFERENCES trip_photos (id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Style id from backend/src/artworks/styles.ts, validated by the service so new styles need no migration.
  style text NOT NULL,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL DEFAULT 'image/png',
  size_bytes bigint,
  -- The image model that painted it, e.g. gemini-2.5-flash-image
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_artworks_trip_idx ON trip_artworks (trip_id, created_at DESC);
