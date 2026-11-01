-- Find-me speed-up: the Facenet512 embedding of a user's selfie, computed by face-search on the first search and reused
-- afterwards so later searches send a vector instead of re-detecting and re-embedding the image. Keyed by a hash of the
-- selfie, so changing the profile selfie simply misses the cache (the old row is deleted on the next search).
CREATE TABLE IF NOT EXISTS user_face_embeddings (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  selfie_hash text NOT NULL,
  embedding real[] NOT NULL CHECK (array_length(embedding, 1) = 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, selfie_hash)
);
