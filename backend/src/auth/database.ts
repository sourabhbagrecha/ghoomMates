import { MongoClient, type Db } from 'mongodb';
import { randomBytes } from 'node:crypto';
import type { User } from './types.ts';

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
  updateUserProfile(id: string, patch: Partial<User>): Promise<User | null>;
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
        name: profile.name || existing.name,
        givenName: profile.givenName || existing.givenName,
        familyName: profile.familyName || existing.familyName,
        picture: existing.picture, // Retain selfie picture, never overwrite with Google
        locale: profile.locale || existing.locale,
        updatedAt: now,
        lastLoginAt: now,
      };
      this.users.set(updated.id, updated);
      return { user: updated, isNew: false };
    }

    const newUser: User = {
      id: `usr_${randomBytes(8).toString('hex')}`,
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
    return { user: newUser, isNew: true };
  }

  async updateUserProfile(id: string, patch: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...patch, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    return updated;
  }

  async terminate(): Promise<void> {
    this.users.clear();
  }
}

class MongoOAuthDatabase implements OAuthDatabase {
  readonly isConnected = true;
  private client: MongoClient;
  private db: Db;

  constructor(client: MongoClient, db: Db) {
    this.client = client;
    this.db = db;
  }

  private get collection() {
    return this.db.collection<User>('users');
  }

  async findUserById(id: string): Promise<User | null> {
    return (await this.collection.findOne({ id } as any)) as User | null;
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    return (await this.collection.findOne({ googleId } as any)) as User | null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return (await this.collection.findOne({ email: email.toLowerCase().trim() } as any)) as User | null;
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
        name: profile.name || existing.name,
        givenName: profile.givenName || existing.givenName,
        familyName: profile.familyName || existing.familyName,
        picture: existing.picture, // Retain selfie picture, never overwrite with Google
        locale: profile.locale || existing.locale,
        updatedAt: now,
        lastLoginAt: now,
      };

      await this.collection.updateOne(
        { id: existing.id } as any,
        {
          $set: {
            googleId: updated.googleId,
            email: updated.email,
            emailVerified: updated.emailVerified,
            name: updated.name,
            givenName: updated.givenName,
            familyName: updated.familyName,
            locale: updated.locale,
            updatedAt: updated.updatedAt,
            lastLoginAt: updated.lastLoginAt,
          },
        }
      );

      return { user: updated, isNew: false };
    }

    const newUser: User = {
      id: `usr_${randomBytes(8).toString('hex')}`,
      googleId: profile.googleId,
      email: profile.email.toLowerCase().trim(),
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

    await this.collection.insertOne(newUser as any);
    return { user: newUser, isNew: true };
  }

  async updateUserProfile(id: string, patch: Partial<User>): Promise<User | null> {
    const now = new Date().toISOString();
    await this.collection.updateOne(
      { id } as any,
      { $set: { ...patch, updatedAt: now } }
    );
    return this.findUserById(id);
  }

  async terminate(): Promise<void> {
    await this.client.close();
  }
}

export function createInMemoryOAuthDatabase(): OAuthDatabase {
  return new InMemoryOAuthDatabase();
}

// Wrap an already-connected client, ensuring the indexes the users collection relies on.
export async function attachOAuthDatabase(client: MongoClient, db: Db): Promise<OAuthDatabase> {
  try {
    await Promise.all([
      db.collection('users').createIndex({ id: 1 }, { unique: true }),
      db.collection('users').createIndex({ googleId: 1 }, { unique: true, sparse: true }),
      db.collection('users').createIndex({ email: 1 }, { unique: true }),
    ]);
  } catch (idxErr) {
    console.warn('Notice: index creation:', idxErr instanceof Error ? idxErr.message : idxErr);
  }
  return new MongoOAuthDatabase(client, db);
}

export async function openOAuthDatabase(
  uri = process.env.MONGODB_URI,
  dbName = process.env.DATABASE_NAME || 'splitwise'
): Promise<OAuthDatabase> {
  if (!uri) {
    console.log('No MONGODB_URI configured. Running OAuth service with in-memory store.');
    return new InMemoryOAuthDatabase();
  }

  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = await attachOAuthDatabase(client, client.db(dbName));
    console.log('OAuth database connected to MongoDB/Firestore successfully.');
    return db;
  } catch (err) {
    console.warn('Could not connect to MongoDB. Falling back to in-memory store for OAuth:', err instanceof Error ? err.message : err);
    return new InMemoryOAuthDatabase();
  }
}
