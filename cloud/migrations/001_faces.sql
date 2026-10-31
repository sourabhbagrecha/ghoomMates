-- Face index for trip photos, written by face-indexer and read by face-search (cloud/faces).
-- Linked to the backend's trip_photos by object name (face_photos.object_name = trip_photos.object_key), not by
-- foreign key: the upload event usually arrives before the backend registers the photo.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE face_photos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  object_name text NOT NULL,
  -- GCS object generation; an overwrite gets a new one. Events for older generations are ignored.
  generation bigint NOT NULL,
  -- Search scope, parsed from trips/<trip_id>/photos/<file>.
  trip_id uuid NOT NULL,
  -- Original image size after EXIF orientation (face boxes use these coordinates).
  width integer,
  height integer,
  face_count integer NOT NULL DEFAULT 0 CHECK (face_count >= 0),
  status text NOT NULL CHECK (status IN ('indexed', 'no_faces', 'error')),
  error text,
  -- Also kept per photo so photos indexed with no faces are re-indexed after a model change too.
  model_name text NOT NULL,
  detector text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_name)
);
CREATE INDEX face_photos_trip_idx ON face_photos (trip_id);

CREATE TABLE faces (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id bigint NOT NULL REFERENCES face_photos (id) ON DELETE CASCADE,
  -- Copy of face_photos.trip_id, so the scope filter is applied during the HNSW scan of this table.
  trip_id uuid NOT NULL,
  -- Face box in original image pixels.
  x integer NOT NULL CHECK (x >= 0),
  y integer NOT NULL CHECK (y >= 0),
  w integer NOT NULL CHECK (w > 0),
  h integer NOT NULL CHECK (h > 0),
  det_confidence real NOT NULL,
  -- L2-normalized Facenet512 embedding.
  embedding vector(512) NOT NULL,
  model_name text NOT NULL,
  detector text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faces_photo_idx ON faces (photo_id);
CREATE INDEX faces_trip_idx ON faces (trip_id);
CREATE INDEX faces_embedding_hnsw_idx ON faces USING hnsw (embedding vector_cosine_ops);
