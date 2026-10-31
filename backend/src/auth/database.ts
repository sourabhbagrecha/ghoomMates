import { randomBytes } from 'node:crypto';
import type { User } from './types.ts';
import type { Database, Pool } from '../db.ts';

export type ProfilePatch = { picture?: string; name?: string };

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

  async updateUserProfile(id: string, patch: ProfilePatch): Promise<User | null> {
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

const USER_COLUMNS = 'id, google_id, email, email_verified, name, given_name, family_name, picture, locale, created_at, updated_at, last_login_at';

function toUser(row: Record<string, any>): User {
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    givenName: row.given_name ?? undefined,
    familyName: row.family_name ?? undefined,
    picture: row.picture ?? undefined,
    locale: row.locale ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastLoginAt: row.last_login_at.toISOString(),
  };
}

class PostgresOAuthDatabase implements OAuthDatabase {
  readonly isConnected = true;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async findOne(where: string, value: string): Promise<User | null> {
    const { rows: [row] } = await this.pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE ${where} = $1`, [value]);
    return row ? toUser(row) : null;
  }

  findUserById(id: string) {
    return this.findOne('id', id);
  }

  findUserByGoogleId(googleId: string) {
    return this.findOne('google_id', googleId);
  }

  findUserByEmail(email: string) {
    return this.findOne('email', email.toLowerCase().trim());
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

    if (existing) {
      // The picture is the user's selfie and is never overwritten with Google's.
      const { rows: [row] } = await this.pool.query(
        `UPDATE users SET
           google_id = $2,
           email = $3,
           email_verified = COALESCE($4, email_verified),
           name = COALESCE(NULLIF($5, ''), name),
           given_name = COALESCE(NULLIF($6, ''), given_name),
           family_name = COALESCE(NULLIF($7, ''), family_name),
           locale = COALESCE(NULLIF($8, ''), locale),
           updated_at = now(),
           last_login_at = now()
         WHERE id = $1
         RETURNING ${USER_COLUMNS}`,
        [existing.id, profile.googleId, email, profile.emailVerified ?? null, profile.name, profile.givenName ?? null, profile.familyName ?? null, profile.locale ?? null]
      );
      return { user: toUser(row), isNew: false };
    }

    const { rows: [row] } = await this.pool.query(
      `INSERT INTO users (id, google_id, email, email_verified, name, given_name, family_name, locale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${USER_COLUMNS}`,
      [`usr_${randomBytes(8).toString('hex')}`, profile.googleId, email, profile.emailVerified ?? true, profile.name, profile.givenName ?? null, profile.familyName ?? null, profile.locale ?? null]
    );
    return { user: toUser(row), isNew: true };
  }

  async updateUserProfile(id: string, patch: ProfilePatch): Promise<User | null> {
    const { rows: [row] } = await this.pool.query(
      `UPDATE users SET
         picture = CASE WHEN $2 THEN $3 ELSE picture END,
         name = COALESCE($4, name),
         updated_at = now()
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [id, patch.picture !== undefined, patch.picture ?? null, patch.name ?? null]
    );
    return row ? toUser(row) : null;
  }

  // The pool is shared with other modules and closed by its owner.
  async terminate(): Promise<void> {}
}

export function createInMemoryOAuthDatabase(): OAuthDatabase {
  return new InMemoryOAuthDatabase();
}

export function createPostgresOAuthDatabase(database: Database): OAuthDatabase {
  return new PostgresOAuthDatabase(database.pool);
}
