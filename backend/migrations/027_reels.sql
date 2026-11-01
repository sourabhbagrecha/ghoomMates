-- Reel studio (/api/reels): reels cut from a trip's photos. Only the plan is kept (which photos, in what order, with
-- what captions, moves and transitions); the app plays it with Remotion and renders the MP4 on the device.
CREATE TABLE IF NOT EXISTS trip_reels (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- What the person asked for, e.g. "30s of our beach day with a chill vibe"
  prompt text NOT NULL,
  -- { title, tagline, style, scenes: [{ photoId, caption, seconds, motion, transition }] } (backend/src/reels/plan.ts)
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  -- 'gemini', 'claude' when Gemini failed, or 'template' when both did
  source text NOT NULL DEFAULT 'gemini',
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_reels_trip_idx ON trip_reels (trip_id, created_at DESC);
