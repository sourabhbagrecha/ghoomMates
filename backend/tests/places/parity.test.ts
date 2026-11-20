import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDES } from '../../src/places/index.ts';

// The create-trip cards (frontend/src/pages/CreateTrip/createTripData.ts) are one per destination guide, keyed by the
// guide id, with its name and aliases so search and trip covers find the same place the itinerary does. Each needs a
// photo in frontend/src/data/destinationPhotos.ts. The frontend can't import backend code, so read its source.
const frontend = (path: string) => readFileSync(new URL(`../../../frontend/src/${path}`, import.meta.url), 'utf8');

const seeds = [...frontend('pages/CreateTrip/createTripData.ts').matchAll(/\{\s*id: '([^']+)',\s*name: '([^']+)',[\s\S]*?aliases: \[([^\]]*)\],\s*\}/g)]
  .map(([, id, name, aliases]) => ({ id, name, aliases: [...aliases.matchAll(/'([^']+)'/g)].map(m => m[1]) }));

test('every destination guide has a create-trip card with the same id, name and aliases', () => {
  assert.deepEqual(
    [...seeds].sort((a, b) => a.id.localeCompare(b.id)),
    GUIDES.map(g => ({ id: g.id, name: g.name, aliases: g.aliases })).sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test('every card has a cover photo', () => {
  const photos = frontend('data/destinationPhotos.ts');
  for (const { id } of seeds) assert.ok(new RegExp(`^  '?${id}'?: `, 'm').test(photos), `no photo for ${id} in destinationPhotos.ts`);
});
