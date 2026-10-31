ALTER TABLE users ADD COLUMN username text;
UPDATE users SET username = id;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._]{3,64}$');
ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(preferences) = 'object');
