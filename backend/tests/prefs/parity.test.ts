import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The app scores answers live with its own copy of the taste model; the server re-scores with this one. They must
// be the same file byte for byte, or the profile the app shows drifts from what the server stores.
test('backend/src/prefs/taste.ts and frontend/src/data/taste.ts are byte-identical', () => {
  const backend = readFileSync(new URL('../../src/prefs/taste.ts', import.meta.url));
  const frontend = readFileSync(new URL('../../../frontend/src/data/taste.ts', import.meta.url));
  assert.ok(backend.equals(frontend), 'taste.ts differs between backend and frontend: edit one and copy it over');
});
