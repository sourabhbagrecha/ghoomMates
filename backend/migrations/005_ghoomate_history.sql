-- GhoomMate chat history (/api/voice/history): what each person and GhoomMate said, per trip. Private to that
-- person; the agent saves turns as it goes and reads the latest back so a new chat remembers the last ones.
CREATE TABLE ghoomate_messages (
  id bigserial PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'agent')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ghoomate_messages_trip_user ON ghoomate_messages (trip_id, user_id, id DESC);
