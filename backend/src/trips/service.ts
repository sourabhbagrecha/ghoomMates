import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import { ExpenseService } from '../expenses/service.ts';
import { transaction, type Database, type Pool, type Tx } from '../db.ts';
import { IMAGE_TYPES, type MediaStorage } from '../storage.ts';

export const EXPENSE_CATEGORIES = ['food', 'stays', 'travel', 'fun', 'other'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No 0/O/1/I/L, so codes survive being read out loud
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export type TripRow = {
  id: string; name: string; group_name: string; destination: string; start_date: string | null; end_date: string | null;
  budget: string; cover: string; details: Record<string, unknown>; invite_code: string; expense_group_id: string;
  created_by: string; created_at: Date;
};

export type TripAccess = { trip: TripRow; memberId: string; role: string };

function inviteCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  requireThat(typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value)), `${field} must be a YYYY-MM-DD date`);
  return value;
}

function optionalText(value: unknown, field: string, max = 200): string {
  if (value === undefined || value === null || value === '') return '';
  requireThat(typeof value === 'string' && value.length <= max, `${field} must be a string of at most ${max} characters`);
  return value.trim();
}

export class TripService {
  private pool: Pool;
  private ledger: ExpenseService;
  private storage: MediaStorage;
  private clientOrigin: string;

  constructor(database: Database, storage: MediaStorage, clientOrigin: string) {
    this.pool = database.pool;
    this.ledger = new ExpenseService(database);
    this.storage = storage;
    this.clientOrigin = clientOrigin.replace(/\/$/, '');
  }

  inviteUrl(code: string) {
    return `${this.clientOrigin}/#/join/${code}`;
  }

  private async publicTrip(trip: TripRow) {
    return {
      id: trip.id,
      name: trip.name,
      groupName: trip.group_name,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      budget: trip.budget,
      cover: trip.cover,
      details: trip.details,
      createdBy: trip.created_by,
      createdAt: trip.created_at.toISOString(),
    };
  }

  // Resolves the caller's membership; non-members get 404 so trip ids don't leak.
  async access(tripId: string, userId: string): Promise<TripAccess> {
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rows: [row] } = await this.pool.query(
      `SELECT t.*, m.ledger_member_id, m.role FROM trips t
       JOIN trip_members m ON m.trip_id = t.id AND m.user_id = $2
       WHERE t.id = $1`,
      [tripId, userId],
    );
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { ledger_member_id, role, ...trip } = row;
    return { trip: trip as TripRow, memberId: ledger_member_id, role };
  }

  private async members(tripId: string) {
    const { rows } = await this.pool.query(
      `SELECT m.ledger_member_id, m.user_id, m.role, m.joined_at, u.name, u.username, u.picture, u.preferences, g.balance_paise
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       JOIN group_members g ON g.id = m.ledger_member_id
       WHERE m.trip_id = $1
       ORDER BY g.position`,
      [tripId],
    );
    return rows.map(r => ({
      memberId: r.ledger_member_id,
      userId: r.user_id,
      name: r.name,
      username: r.username,
      picture: r.picture ?? null,
      colour: typeof r.preferences?.colour === 'string' ? r.preferences.colour : null,
      persona: typeof r.preferences?.persona === 'string' ? r.preferences.persona : null,
      // Personality-quiz scores (0–1 per axis), blended into the squad's vibe
      vibe: r.preferences?.vibe && typeof r.preferences.vibe === 'object' ? r.preferences.vibe as Record<string, number> : null,
      role: r.role,
      joinedAt: r.joined_at.toISOString(),
      balancePaise: r.balance_paise as number,
    }));
  }

  async list(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT t.*, m.ledger_member_id, m.role, g.balance_paise AS my_balance,
         (SELECT count(*) FROM trip_members x WHERE x.trip_id = t.id) AS member_count,
         (SELECT count(*) FROM trip_photos p WHERE p.trip_id = t.id) AS photo_count,
         (SELECT coalesce(sum(e.amount_paise), 0) FROM expenses e WHERE e.group_id = t.expense_group_id) AS total_spent
       FROM trips t
       JOIN trip_members m ON m.trip_id = t.id AND m.user_id = $1
       JOIN group_members g ON g.id = m.ledger_member_id
       ORDER BY coalesce(t.start_date, t.created_at::date) DESC, t.created_at DESC`,
      [userId],
    );
    return Promise.all(rows.map(async r => ({
      ...await this.publicTrip(r),
      role: r.role,
      memberId: r.ledger_member_id,
      memberCount: Number(r.member_count),
      photoCount: Number(r.photo_count),
      totalSpentPaise: Number(r.total_spent),
      myBalancePaise: r.my_balance,
      members: (await this.members(r.id)).map(({ memberId, userId, name, picture, colour }) => ({ memberId, userId, name, picture, colour })),
    })));
  }

  async detail(access: TripAccess) {
    return {
      ...await this.publicTrip(access.trip),
      role: access.role,
      memberId: access.memberId,
      inviteCode: access.trip.invite_code,
      inviteUrl: this.inviteUrl(access.trip.invite_code),
      members: await this.members(access.trip.id),
    };
  }

  async create(user: { id: string; name: string }, input: unknown) {
    const body = object(input);
    const name = text(body.name, 'name', 100);
    const groupName = body.groupName === undefined || body.groupName === '' ? name : text(body.groupName, 'groupName', 100);
    const startDate = optionalDate(body.startDate, 'startDate');
    const endDate = optionalDate(body.endDate, 'endDate');
    requireThat(!startDate || !endDate || endDate >= startDate, 'endDate must be on or after startDate');
    const details = body.details === undefined ? {} : object(body.details);
    requireThat(JSON.stringify(details).length <= 8_000, 'details is too large');

    const tripId = await transaction(this.pool, async (tx) => {
      const group = await this.ledger.createGroup({ name, members: [user.name.slice(0, 100) || 'Organiser'] }, tx) as { id: string; members: { id: string }[] };
      const id = randomUUID();
      await tx.query(
        `INSERT INTO trips (id, name, group_name, destination, start_date, end_date, budget, cover, details, invite_code, expense_group_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, name, groupName, optionalText(body.destination, 'destination'), startDate, endDate,
          optionalText(body.budget, 'budget', 50), optionalText(body.cover, 'cover', 300), JSON.stringify(details), inviteCode(), group.id, user.id],
      );
      await tx.query(
        `INSERT INTO trip_members (trip_id, user_id, ledger_member_id, role) VALUES ($1, $2, $3, 'organiser')`,
        [id, user.id, group.members[0].id],
      );
      return id;
    });
    return this.detail(await this.access(tripId, user.id));
  }

  // Partial update; only fields present in the body change.
  async update(access: TripAccess, input: unknown) {
    const body = object(input);
    const has = (key: string) => key in body;
    const trip = access.trip;
    const next = {
      name: has('name') ? text(body.name, 'name', 100) : trip.name,
      group_name: has('groupName') ? text(body.groupName, 'groupName', 100) : trip.group_name,
      destination: has('destination') ? optionalText(body.destination, 'destination') : trip.destination,
      start_date: has('startDate') ? optionalDate(body.startDate, 'startDate') : trip.start_date,
      end_date: has('endDate') ? optionalDate(body.endDate, 'endDate') : trip.end_date,
      budget: has('budget') ? optionalText(body.budget, 'budget', 50) : trip.budget,
      cover: has('cover') ? optionalText(body.cover, 'cover', 300) : trip.cover,
      details: has('details') ? object(body.details) : trip.details,
    };
    requireThat(!next.start_date || !next.end_date || next.end_date >= next.start_date, 'endDate must be on or after startDate');
    requireThat(JSON.stringify(next.details).length <= 8_000, 'details is too large');
    await this.pool.query(
      `UPDATE trips SET name = $2, group_name = $3, destination = $4, start_date = $5, end_date = $6, budget = $7, cover = $8, details = $9
       WHERE id = $1`,
      [trip.id, next.name, next.group_name, next.destination, next.start_date, next.end_date, next.budget, next.cover, JSON.stringify(next.details)],
    );
    return this.detail({ ...access, trip: { ...trip, ...next } });
  }

  private async tripByCode(code: string, db: Pool | Tx = this.pool, forUpdate = false) {
    requireThat(typeof code === 'string' && /^[a-z0-9]{4,32}$/i.test(code), 'Invalid invite code');
    const { rows: [trip] } = await db.query<TripRow>(`SELECT * FROM trips WHERE invite_code = $1${forUpdate ? ' FOR UPDATE' : ''}`, [code.toLowerCase()]);
    if (!trip) throw new ApiError(404, 'INVITE_NOT_FOUND', 'This invite link is not valid');
    return trip;
  }

  // Public preview behind an invite link: enough to decide whether to join.
  async invitePreview(code: string, userId?: string) {
    const trip = await this.tripByCode(code);
    const members = await this.members(trip.id);
    const organiser = members.find(m => m.role === 'organiser') ?? members[0];
    return {
      ...await this.publicTrip(trip),
      code: trip.invite_code,
      invitedBy: organiser ? { name: organiser.name, picture: organiser.picture } : null,
      members: members.map(({ memberId, name, picture, colour }) => ({ memberId, name, picture, colour })),
      alreadyMember: Boolean(userId && members.some(m => m.userId === userId)),
    };
  }

  async join(user: { id: string; name: string }, code: string) {
    const tripId = await transaction(this.pool, async (tx) => {
      // The trip row lock serializes joins, so a double tap can't add the same user twice.
      const trip = await this.tripByCode(code, tx, true);
      const { rows: [existing] } = await tx.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [trip.id, user.id]);
      if (existing) return trip.id;
      const member = await this.ledger.addMember(trip.expense_group_id, { name: user.name.slice(0, 100) || 'Mate' }, tx) as { id: string };
      await tx.query(`INSERT INTO trip_members (trip_id, user_id, ledger_member_id, role) VALUES ($1, $2, $3, 'mate')`, [trip.id, user.id, member.id]);
      return trip.id;
    });
    return this.detail(await this.access(tripId, user.id));
  }

  /* Expenses */

  private async receiptKey(access: TripAccess, value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    requireThat(typeof value === 'string' && value.startsWith(`trips/${access.trip.id}/receipts/`), 'receiptKey must come from an upload for this trip');
    requireThat(await this.storage.size(value) !== null, 'Receipt upload was not found; upload it again');
    return value;
  }

  async addExpense(access: TripAccess, userId: string, idempotencyKey: string, input: unknown) {
    const body = object(input);
    const category = body.category ?? 'other';
    requireThat(EXPENSE_CATEGORIES.includes(category as never), `category must be one of ${EXPENSE_CATEGORIES.join(', ')}`);
    const receiptKey = await this.receiptKey(access, body.receiptKey);
    const groupId = access.trip.expense_group_id;
    const ledgerInput = { description: body.description, payerId: body.payerMemberId, amountPaise: body.amountPaise, split: body.split };
    const result = await this.ledger.mutate(`${groupId}/expenses`, idempotencyKey || randomUUID(), { ...ledgerInput, category, receiptKey }, async (tx) => {
      const expense = await this.ledger.addExpense(groupId, ledgerInput, tx) as { id: string };
      await tx.query('UPDATE expenses SET category = $2, receipt_key = $3, created_by = $4 WHERE id = $1', [expense.id, category, receiptKey, userId]);
      return { ...expense, category, receiptKey, createdBy: userId };
    }) as { id: string };
    return (await this.expenses(access, 1, 0, result.id))[0];
  }

  async expenses(access: TripAccess, limit: number, offset: number, onlyId?: string) {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.payer_id, e.description, e.amount_paise, e.split_type, e.category, e.receipt_key, e.created_by, e.created_at,
         (SELECT json_agg(json_build_object('memberId', s.member_id, 'amountPaise', s.amount_paise) ORDER BY s.position)
          FROM expense_shares s WHERE s.expense_id = e.id) AS shares
       FROM expenses e
       WHERE e.group_id = $1 AND ($4::uuid IS NULL OR e.id = $4)
       ORDER BY e.sequence DESC LIMIT $2 OFFSET $3`,
      [access.trip.expense_group_id, limit, offset, onlyId ?? null],
    );
    return Promise.all(rows.map(async r => ({
      id: r.id,
      description: r.description,
      amountPaise: r.amount_paise,
      payerMemberId: r.payer_id,
      splitType: r.split_type,
      category: r.category,
      shares: (r.shares ?? []).map((s: { memberId: string; amountPaise: number | string }) => ({ memberId: s.memberId, amountPaise: Number(s.amountPaise) })),
      receiptUrl: r.receipt_key ? await this.storage.readUrl(r.receipt_key).catch(() => null) : null,
      createdBy: r.created_by,
      createdAt: r.created_at.toISOString(),
    })));
  }

  // Balances, suggested transfers, totals and category split in one call for the Expenses tab.
  async summary(access: TripAccess) {
    const groupId = access.trip.expense_group_id;
    const [balances, transfers, totals] = await Promise.all([
      this.ledger.balances(groupId),
      this.ledger.suggestions(groupId),
      this.pool.query(`SELECT category, sum(amount_paise) AS amount, count(*) AS n FROM expenses WHERE group_id = $1 GROUP BY category`, [groupId]),
    ]);
    const categories = totals.rows.map(r => ({ category: r.category, amountPaise: Number(r.amount), count: Number(r.n) }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
    // What a naive "everyone pays back each payer" approach would take, for the "saved N transfers" stat
    const { rows: [pairs] } = await this.pool.query(
      `SELECT count(DISTINCT (s.member_id, e.payer_id)) AS n FROM expense_shares s JOIN expenses e ON e.id = s.expense_id
       WHERE e.group_id = $1 AND s.member_id <> e.payer_id AND s.amount_paise > 0`,
      [groupId],
    );
    return {
      currency: 'INR',
      memberId: access.memberId,
      totalSpentPaise: categories.reduce((sum, c) => sum + c.amountPaise, 0),
      expenseCount: categories.reduce((sum, c) => sum + c.count, 0),
      balances,
      transfers,
      naiveTransferCount: Number(pairs.n),
      categories,
    };
  }

  // Records a payment the caller sent or received. Settlements are manually confirmed (no UPI callback yet).
  async addSettlement(access: TripAccess, idempotencyKey: string, input: unknown) {
    const body = object(input);
    requireThat(body.fromMemberId === access.memberId || body.toMemberId === access.memberId, 'You can only record payments you sent or received');
    const groupId = access.trip.expense_group_id;
    const ledgerInput = { fromMemberId: body.fromMemberId, toMemberId: body.toMemberId, amountPaise: body.amountPaise, confirmed: true, note: body.note || 'Settled in Ghoomates' };
    return this.ledger.mutate(`${groupId}/settlements`, idempotencyKey || randomUUID(), ledgerInput, (tx) => this.ledger.addSettlement(groupId, ledgerInput, tx));
  }

  async settlements(access: TripAccess, limit: number, offset: number) {
    return this.ledger.settlements(access.trip.expense_group_id, limit, offset);
  }

  /* Media */

  async createUpload(access: TripAccess, input: unknown) {
    const body = object(input);
    requireThat(body.kind === 'photo' || body.kind === 'receipt', 'kind must be photo or receipt');
    const contentType = typeof body.contentType === 'string' ? body.contentType.toLowerCase() : '';
    const ext = IMAGE_TYPES[contentType];
    requireThat(ext, `contentType must be one of ${Object.keys(IMAGE_TYPES).join(', ')}`);
    if (body.size !== undefined) integer(body.size, 'size', 1, 15 * 1024 * 1024);
    const key = `trips/${access.trip.id}/${body.kind}s/${randomUUID()}.${ext}`;
    return { key, upload: await this.storage.createUpload(key, contentType) };
  }

  async addPhotos(access: TripAccess, userId: string, input: unknown) {
    const body = object(input);
    requireThat(Array.isArray(body.photos) && body.photos.length >= 1 && body.photos.length <= 100, 'Provide between 1 and 100 photos');
    const prefix = `trips/${access.trip.id}/photos/`;
    const photos = await Promise.all(body.photos.map(async (value) => {
      const p = object(value);
      requireThat(typeof p.key === 'string' && p.key.startsWith(prefix), 'Photo key must come from an upload for this trip');
      const size = await this.storage.size(p.key);
      requireThat(size !== null, 'Photo upload was not found; upload it again');
      const ext = p.key.split('.').pop()!;
      return {
        id: randomUUID(), key: p.key, size,
        contentType: Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? 'image/jpeg',
        width: p.width === undefined ? null : integer(p.width, 'width', 1, 100_000),
        height: p.height === undefined ? null : integer(p.height, 'height', 1, 100_000),
        caption: optionalText(p.caption, 'caption', 300),
      };
    }));
    await this.pool.query(
      `INSERT INTO trip_photos (id, trip_id, uploaded_by, object_key, content_type, size_bytes, width, height, caption)
       SELECT p.id, $1, $2, p.key, p.type, p.size, p.width, p.height, p.caption
       FROM unnest($3::uuid[], $4::text[], $5::text[], $6::bigint[], $7::int[], $8::int[], $9::text[]) AS p (id, key, type, size, width, height, caption)
       ON CONFLICT (object_key) DO NOTHING`,
      [access.trip.id, userId, photos.map(p => p.id), photos.map(p => p.key), photos.map(p => p.contentType), photos.map(p => p.size),
        photos.map(p => p.width), photos.map(p => p.height), photos.map(p => p.caption)],
    );
    return { added: photos.length };
  }

  async photos(access: TripAccess, limit: number, offset: number) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.object_key, p.width, p.height, p.caption, p.created_at, p.uploaded_by, u.name AS uploader
       FROM trip_photos p JOIN users u ON u.id = p.uploaded_by
       WHERE p.trip_id = $1 ORDER BY p.created_at DESC, p.id LIMIT $2 OFFSET $3`,
      [access.trip.id, limit, offset],
    );
    const { rows: [count] } = await this.pool.query('SELECT count(*) AS n FROM trip_photos WHERE trip_id = $1', [access.trip.id]);
    return {
      total: Number(count.n),
      items: await Promise.all(rows.map(async r => ({
        id: r.id,
        url: await this.storage.readUrl(r.object_key),
        width: r.width,
        height: r.height,
        caption: r.caption,
        uploadedBy: { userId: r.uploaded_by, name: r.uploader },
        createdAt: r.created_at.toISOString(),
      }))),
    };
  }
}
