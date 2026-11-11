import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMongoOAuthDatabase } from '../../src/auth/database.ts';
import { testDatabase } from '../mongo.ts';

test('Mongo users: create, return on login, merge preferences, reject taken usernames', async () => {
  const database = await testDatabase();
  const db = createMongoOAuthDatabase(database);
  try {
    const profile = { googleId: 'g-1', email: ' First@Example.com ', name: 'Google Name', givenName: 'Google' };
    const created = await db.upsertGoogleUser(profile);
    assert.equal(created.isNew, true);
    assert.match(created.user.id, /^usr_[0-9a-f]{16}$/);
    assert.equal(created.user.username, created.user.id);
    assert.equal(created.user.email, 'first@example.com');
    assert.deepEqual(created.user.preferences, {});
    assert.equal(created.user.picture, undefined);

    await db.updateUserProfile(created.user.id, { username: 'traveler', name: 'Custom', picture: 'data:image/jpeg;base64,x', preferences: { language: 'hi', theme: 'dark' } });
    const merged = await db.updateUserProfile(created.user.id, { preferences: { theme: 'light' } });
    assert.deepEqual(merged?.preferences, { language: 'hi', theme: 'light' });

    const returning = await db.upsertGoogleUser({ ...profile, name: 'Other Name', familyName: 'Family' });
    assert.equal(returning.isNew, false);
    assert.equal(returning.user.id, created.user.id);
    assert.equal(returning.user.name, 'Custom');
    assert.equal(returning.user.familyName, 'Family');
    assert.equal(returning.user.picture, 'data:image/jpeg;base64,x');
    assert.equal((await db.findUserByEmail('FIRST@example.com'))?.id, created.user.id);
    assert.equal((await db.findUserByGoogleId('g-1'))?.username, 'traveler');

    const second = await db.upsertGoogleUser({ googleId: 'g-2', email: 'second@example.com', name: 'Second' });
    await assert.rejects(db.updateUserProfile(second.user.id, { username: 'traveler' }), { code: 'USERNAME_TAKEN' });
    assert.equal(await db.updateUserProfile('usr_missing', { name: 'x' }), null);
  } finally { await database.close(); }
});
