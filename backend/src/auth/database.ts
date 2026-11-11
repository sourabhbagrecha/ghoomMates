import { randomBytes } from 'node:crypto';
import { ApiError } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from './types.ts';
import type { Collection } from 'mongodb';
import { isDuplicateKey, type Database } from '../db.ts';

export type ProfilePatch = { picture?: string; name?: string; username?: string; preferences?: Record<string, unknown> };

export interface OAuthDatabase {
  findUserById(id: string): Promise<User | null>;
  findUserByGoogleId(googleId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  upsertGoogleUser(profile: {
    googleId: string;
    email: string;
    emailVerified?: boolean;
    name: string;
    givenName?: string;
    familyName?: string;
    locale?: string;
  }): Promise<{ user: User; isNew: boolean }>;
  updateUserProfile(id: string, patch: ProfilePatch): Promise<User | null>;
  terminate(): Promise<void>;
  readonly isConnected: boolean;
}

class InMemoryOAuthDatabase implements OAuthDatabase {
  private users = new Map<string, User>(); // id -> User
  readonly isConnected = true;

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.googleId === googleId) return u;
    }
    return null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase().trim() === normalized) return u;
    }
    return null;
  }

  async upsertGoogleUser(profile: {
    googleId: string;
    email: string;
    emailVerified?: boolean;
    name: string;
    givenName?: string;
    familyName?: string;
    locale?: string;
  }): Promise<{ user: User; isNew: boolean }> {
    const existing = (await this.findUserByGoogleId(profile.googleId)) || (await this.findUserByEmail(profile.email));
    const now = new Date().toISOString();

    if (existing) {
      const updated: User = {
        ...existing,
        googleId: profile.googleId,
        email: profile.email,
        emailVerified: profile.emailVerified ?? existing.emailVerified,
        name: existing.name,
        givenName: profile.givenName || existing.givenName,
        familyName: profile.familyName || existing.familyName,
        picture: existing.picture, // Retain selfie picture, never overwrite with Google
        locale: profile.locale || existing.locale,
        updatedAt: now,
        lastLoginAt: now,
      };
      this.users.set(updated.id, updated);
      logger.info('DB:Memory', `Updated existing user in-memory: ${updated.email} (${updated.id})`);
      return { user: updated, isNew: false };
    }

    const newUser: User = {
      id: `usr_${randomBytes(8).toString('hex')}`,
      username: `user_${randomBytes(8).toString('hex')}`,
      preferences: {},
      googleId: profile.googleId,
      email: profile.email,
      emailVerified: profile.emailVerified ?? true,
      name: profile.name,
      givenName: profile.givenName,
      familyName: profile.familyName,
      picture: undefined, // No profile photo from Google
      locale: profile.locale,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    this.users.set(newUser.id, newUser);
    logger.info('DB:Memory', `Created new user in-memory: ${newUser.email} (${newUser.id})`);
    return { user: newUser, isNew: true };
  }

  async updateUserProfile(id: string, patch: ProfilePatch): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    if (patch.username && [...this.users.values()].some(u => u.id !== id && u.username === patch.username)) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'This username is already taken');
    }
    const updated = { ...user, ...patch, preferences: { ...user.preferences, ...patch.preferences }, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    logger.info('DB:Memory', `Updated profile in-memory for user ${id}`);
    return updated;
  }

  async terminate(): Promise<void> {
    this.users.clear();
  }
}

type UserDoc = {
  _id: string; username: string; preferences: Record<string, unknown>; google_id: string; email: string; email_verified: boolean;
  name: string; given_name: string | null; family_name: string | null; picture: string | null; locale: string | null;
  created_at: Date; updated_at: Date; last_login_at: Date;
};

function toUser(doc: UserDoc): User {
  return {
    id: doc._id,
    username: doc.username,
    preferences: doc.preferences ?? {},
    googleId: doc.google_id,
    email: doc.email,
    emailVerified: doc.email_verified,
    name: doc.name,
    givenName: doc.given_name ?? undefined,
    familyName: doc.family_name ?? undefined,
    picture: doc.picture ?? undefined,
    locale: doc.locale ?? undefined,
    createdAt: doc.created_at.toISOString(),
    updatedAt: doc.updated_at.toISOString(),
    lastLoginAt: doc.last_login_at.toISOString(),
  };
}

class MongoOAuthDatabase implements OAuthDatabase {
  readonly isConnected = true;
  private users: Collection<UserDoc>;

  constructor(database: Database) {
    this.users = database.db.collection<UserDoc>('users');
  }

  private async findOne(filter: Partial<UserDoc>): Promise<User | null> {
    const doc = await this.users.findOne(filter);
    return doc ? toUser(doc) : null;
  }

  findUserById(id: string) {
    return this.findOne({ _id: id });
  }

  findUserByGoogleId(googleId: string) {
    return this.findOne({ google_id: googleId });
  }

  findUserByEmail(email: string) {
    return this.findOne({ email: email.toLowerCase().trim() });
  }

  async upsertGoogleUser(profile: {
    googleId: string;
    email: string;
    emailVerified?: boolean;
    name: string;
    givenName?: string;
    familyName?: string;
    locale?: string;
  }): Promise<{ user: User; isNew: boolean }> {
    const email = profile.email.toLowerCase().trim();
    const existing = (await this.findUserByGoogleId(profile.googleId)) || (await this.findUserByEmail(email));
    const now = new Date();

    if (existing) {
      // The picture is the user's selfie and is never overwritten with Google's; a custom name is kept too.
      const set: Partial<UserDoc> = { google_id: profile.googleId, email, updated_at: now, last_login_at: now };
      if (profile.emailVerified !== undefined) set.email_verified = profile.emailVerified;
      if (!existing.name) set.name = profile.name;
      if (profile.givenName) set.given_name = profile.givenName;
      if (profile.familyName) set.family_name = profile.familyName;
      if (profile.locale) set.locale = profile.locale;
      const doc = await this.users.findOneAndUpdate({ _id: existing.id }, { $set: set }, { returnDocument: 'after' });
      const user = toUser(doc!);
      logger.info('DB:Mongo', `Updated existing user in MongoDB: ${user.email} (${user.id})`);
      return { user, isNew: false };
    }

    const id = `usr_${randomBytes(8).toString('hex')}`;
    const doc: UserDoc = {
      _id: id, username: id, preferences: {}, google_id: profile.googleId, email, email_verified: profile.emailVerified ?? true,
      name: profile.name, given_name: profile.givenName ?? null, family_name: profile.familyName ?? null, picture: null,
      locale: profile.locale ?? null, created_at: now, updated_at: now, last_login_at: now,
    };
    await this.users.insertOne(doc);
    const user = toUser(doc);
    logger.info('DB:Mongo', `Inserted new user in MongoDB: ${user.email} (${user.id})`);
    return { user, isNew: true };
  }

  async updateUserProfile(id: string, patch: ProfilePatch): Promise<User | null> {
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (patch.picture !== undefined) set.picture = patch.picture;
    if (patch.name != null) set.name = patch.name;
    if (patch.username != null) set.username = patch.username;
    // Shallow merge, one dotted path per key. Keys Mongo can't address as a path ('a.b', '$x') are dropped.
    for (const [key, value] of Object.entries(patch.preferences ?? {})) {
      if (key && !key.includes('.') && !key.startsWith('$')) set[`preferences.${key}`] = value;
    }
    const doc = await this.users.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).catch((error) => {
      if (isDuplicateKey(error)) throw new ApiError(409, 'USERNAME_TAKEN', 'This username is already taken');
      throw error;
    });
    if (doc) {
      logger.info('DB:Mongo', `Updated user profile in MongoDB: ${id}`);
    }
    return doc ? toUser(doc) : null;
  }

  // The client is shared with other modules and closed by its owner.
  async terminate(): Promise<void> {}
}

export function createInMemoryOAuthDatabase(): OAuthDatabase {
  return new InMemoryOAuthDatabase();
}

export function createMongoOAuthDatabase(database: Database): OAuthDatabase {
  return new MongoOAuthDatabase(database);
}
