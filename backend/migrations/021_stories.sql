-- Kaavad Tales (/api/stories/*): heritage stories told panel by panel at Udaipur's sites, their narration and the Heritage
-- Passport. Retold stories and narration recordings are cached so a repeat open is instant.

-- Gemini retellings, one per site, language, audience and squad vibe mix ('' when the story isn't tuned to a squad).
CREATE TABLE IF NOT EXISTS story_cache (
  site_id text NOT NULL,
  lang text NOT NULL CHECK (lang IN ('en', 'hi')),
  audience text NOT NULL CHECK (audience IN ('classic', 'family', 'friends', 'couple', 'history')),
  vibe_bucket text NOT NULL DEFAULT '',
  story jsonb NOT NULL CHECK (jsonb_typeof(story) = 'object'),
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, lang, audience, vibe_bucket)
);

-- Narration recordings kept in the media bucket. text_hash ties a recording to the exact words and voice it was made
-- from; marks holds the second each panel starts, so the Kaavad can unfold in step with the voice.
CREATE TABLE IF NOT EXISTS story_narrations (
  site_id text NOT NULL,
  lang text NOT NULL CHECK (lang IN ('en', 'hi')),
  audience text NOT NULL,
  vibe_bucket text NOT NULL DEFAULT '',
  text_hash text NOT NULL,
  audio_key text NOT NULL,
  duration_sec real NOT NULL CHECK (duration_sec > 0),
  marks jsonb NOT NULL CHECK (jsonb_typeof(marks) = 'array'),
  voice text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, lang, audience, vibe_bucket, text_hash)
);

-- The Heritage Passport: one stamp per person per site, keeping their best quiz score. site_id is a heritage site id
-- from src/heritage/sites.ts. trip_id records the trip they were on when they first earned it; the squad view reads
-- trip membership, not this column.
CREATE TABLE IF NOT EXISTS heritage_stamps (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  site_id text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  total integer NOT NULL CHECK (total > 0),
  lang text NOT NULL DEFAULT 'en',
  trip_id uuid REFERENCES trips (id) ON DELETE SET NULL,
  stamped_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, site_id),
  CHECK (score <= total)
);

CREATE INDEX IF NOT EXISTS heritage_stamps_site_idx ON heritage_stamps (site_id);
