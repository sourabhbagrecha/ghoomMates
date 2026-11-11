// Moves profile pictures stored inline as data URLs (users.picture = 'data:image/jpeg;base64,...') into media storage.
// Each one is written to users/<id>/selfies/<uuid>.<ext>, then users.selfie_key and users.picture point at it. With
// GCS, every write fires the face-indexer, which embeds the selfie, so find-me is fast from the first tap.
// Safe to rerun: users whose picture is no longer a data URL are skipped.
//
// Usage: node scripts/migrate-selfies.ts            (add --dry-run to only list the users)
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/env.ts';
loadEnv();
import { openDatabase } from '../src/db.ts';
import { createMediaStorage, mediaUrl } from '../src/storage.ts';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,(.+)$/;
const EXT: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const dryRun = process.argv.includes('--dry-run');

const storage = createMediaStorage(process.env.JWT_SECRET || 'x'.repeat(32));
const database = await openDatabase();
console.log(`Storage: ${storage.description}${dryRun ? ' (dry run)' : ''}`);
let moved = 0;
try {
  const users = database.db.collection('users');
  for await (const user of users.find({ picture: { $regex: '^data:' } }, { projection: { picture: 1, email: 1 } })) {
    const match = DATA_URL.exec(user.picture as string);
    if (!match) {
      console.log(`skip ${user._id} (${user.email}): not a JPEG, PNG or WebP data URL`);
      continue;
    }
    const key = `users/${user._id}/selfies/${randomUUID()}.${EXT[match[1]]}`;
    console.log(`${dryRun ? 'would move' : 'move'} ${user._id} (${user.email}) -> ${key}`);
    if (dryRun) continue;
    await storage.put(key, Buffer.from(match[2], 'base64'), `image/${match[1]}`);
    await users.updateOne({ _id: user._id }, { $set: { selfie_key: key, picture: mediaUrl(key), updated_at: new Date() } });
    moved += 1;
  }
} finally {
  await database.close();
}
console.log(`done: ${moved} picture(s) moved`);
