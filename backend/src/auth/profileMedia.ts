import { randomUUID } from 'node:crypto';
import { ApiError } from '../http.ts';
import { PROFILE_KEY, type MediaStorage } from '../storage.ts';

// Selfies and profile photos go browser → bucket like trip photos: the backend only hands out a signed upload URL
// and later records the object key. Selfies under users/<id>/selfies/ are embedded by the face-indexer on upload.

// face-search reads selfies up to 6 MiB (MAX_SELFIE_BYTES); the app sends ~640 px JPEGs, far below that.
export const MAX_PROFILE_UPLOAD_BYTES = 6 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FOLDERS = { selfie: 'selfies', avatar: 'avatars' } as const;

export function requireStorage(storage: MediaStorage | undefined): MediaStorage {
  if (!storage) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Picture uploads are not configured on this server');
  return storage;
}

export async function createProfileUpload(storage: MediaStorage | undefined, userId: string, input: unknown) {
  const body = (input ?? {}) as Record<string, unknown>;
  if (body.kind !== 'selfie' && body.kind !== 'avatar') throw new ApiError(400, 'VALIDATION_ERROR', 'kind must be selfie or avatar');
  const contentType = typeof body.contentType === 'string' ? body.contentType.toLowerCase() : '';
  const ext = TYPES[contentType];
  if (!ext) throw new ApiError(400, 'VALIDATION_ERROR', `contentType must be one of ${Object.keys(TYPES).join(', ')}`);
  if (body.size !== undefined && !(Number.isInteger(body.size) && (body.size as number) >= 1 && (body.size as number) <= MAX_PROFILE_UPLOAD_BYTES)) {
    throw new ApiError(413, 'PICTURE_TOO_LARGE', 'Pictures can be at most 6 MiB');
  }
  const key = `users/${userId}/${FOLDERS[body.kind]}/${randomUUID()}.${ext}`;
  return { key, upload: await requireStorage(storage).createUpload(key, contentType) };
}

// A key from createProfileUpload for this user, in one of the allowed folders, whose upload has finished.
export async function uploadedKey(storage: MediaStorage | undefined, userId: string, value: unknown, field: string, folders: string[]) {
  const match = typeof value === 'string' ? PROFILE_KEY.exec(value) : null;
  if (!match || match[1] !== userId || !folders.includes(match[2])) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be the key of a picture you uploaded`);
  }
  if (await requireStorage(storage).size(match[0]) === null) {
    throw new ApiError(400, 'UPLOAD_NOT_FOUND', 'The picture upload was not found; upload it again');
  }
  return match[0];
}
