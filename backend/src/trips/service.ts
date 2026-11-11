import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import { ExpenseService } from '../expenses/service.ts';
import { transaction, type ClientSession, type Database, type Db } from '../db.ts';
import { IMAGE_TYPES, type MediaStorage } from '../storage.ts';
import { mapMatches, parseSelfies, selfieHash, type FaceSearch, type FaceSearchResult } from './faces.ts';
import { fitStopsToLength, tripLength } from './itinerary.ts';

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

// Mongo doc → TripRow: _id is the trip id
function tripRow({ _id, ...doc }: Record<string, any>): TripRow {
  return { id: _id, ...doc } as TripRow;
}

export type TripAccess = { trip: TripRow; memberId: string; role: string };

function inviteCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// A real calendar day: Date.parse rolls 2026-02-31 over into March
function isCalendarDate(value: string) {
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(value);
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  requireThat(typeof value === 'string' && DATE.test(value) && isCalendarDate(value), `${field} must be a YYYY-MM-DD date`);
  return value;
}

function optionalText(value: unknown, field: string, max = 200): string {
  if (value === undefined || value === null || value === '') return '';
  requireThat(typeof value === 'string' && value.length <= max, `${field} must be a string of at most ${max} characters`);
  return value.trim();
}

export class TripService {
  private database: Database;
  private db: Db;
  private ledger: ExpenseService;
  private storage: MediaStorage;
  private clientOrigin: string;

  constructor(database: Database, storage: MediaStorage, clientOrigin: string) {
    this.database = database;
    this.db = database.db;
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
    const [trip, member] = await Promise.all([
      this.db.collection('trips').findOne({ _id: tripId as any }),
      this.db.collection('trip_members').findOne({ trip_id: tripId, user_id: userId }),
    ]);
    if (!trip || !member) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return { trip: tripRow(trip), memberId: member.ledger_member_id, role: member.role };
  }

  private async members(tripId: string) {
    const members = await this.db.collection('trip_members').find({ trip_id: tripId }).toArray();
    const [users, ledger] = await Promise.all([
      this.db.collection('users').find({ _id: { $in: members.map(m => m.user_id) } as any }).toArray(),
      this.db.collection('group_members').find({ _id: { $in: members.map(m => m.ledger_member_id) } as any }).toArray(),
    ]);
    const userById = new Map(users.map(u => [u._id as unknown as string, u]));
    const ledgerById = new Map(ledger.map(g => [g._id as unknown as string, g]));
    const rows = members.flatMap(m => {
      const u = userById.get(m.user_id);
      const g = ledgerById.get(m.ledger_member_id);
      return u && g ? [{ ledger_member_id: m.ledger_member_id, user_id: m.user_id, role: m.role, joined_at: m.joined_at as Date, name: u.name, username: u.username, picture: u.picture, preferences: u.preferences, balance_paise: g.balance_paise, position: g.position as number }] : [];
    }).sort((a, b) => a.position - b.position);
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
    const mine = await this.db.collection('trip_members').find({ user_id: userId }).toArray();
    const tripIds = mine.map(m => m.trip_id);
    const trips = (await this.db.collection('trips').find({ _id: { $in: tripIds } as any }).toArray()).map(tripRow);
    // Per-trip counts and totals, keyed by trip id (or ledger group id for spend)
    const countBy = async (name: string, match: object, key: string, sum: number | string = 1) => new Map(
      (await this.db.collection(name).aggregate([{ $match: match }, { $group: { _id: `$${key}`, n: { $sum: sum } } }]).toArray())
        .map(r => [r._id as string, Number(r.n)]),
    );
    const [memberCounts, photoCounts, spent, balances] = await Promise.all([
      countBy('trip_members', { trip_id: { $in: tripIds } }, 'trip_id'),
      countBy('trip_photos', { trip_id: { $in: tripIds } }, 'trip_id'),
      countBy('expenses', { group_id: { $in: trips.map(t => t.expense_group_id) } }, 'group_id', '$amount_paise'),
      this.db.collection('group_members').find({ _id: { $in: mine.map(m => m.ledger_member_id) } as any }).toArray(),
    ]);
    const memberOf = new Map(mine.map(m => [m.trip_id as string, m]));
    const balanceOf = new Map(balances.map(g => [g._id as unknown as string, g.balance_paise as number]));
    // Newest first by start date, or by the day it was created for trips without dates
    const sortKey = (t: TripRow) => t.start_date ?? t.created_at.toISOString().slice(0, 10);
    trips.sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.created_at.getTime() - a.created_at.getTime());
    return Promise.all(trips.map(async r => ({
      ...await this.publicTrip(r),
      role: memberOf.get(r.id)!.role,
      memberId: memberOf.get(r.id)!.ledger_member_id,
      memberCount: memberCounts.get(r.id) ?? 0,
      photoCount: photoCounts.get(r.id) ?? 0,
      totalSpentPaise: spent.get(r.expense_group_id) ?? 0,
      myBalancePaise: balanceOf.get(memberOf.get(r.id)!.ledger_member_id),
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

    const destination = optionalText(body.destination, 'destination');
    const budget = optionalText(body.budget, 'budget', 50);
    const cover = optionalText(body.cover, 'cover', 300);
    const tripId = await transaction(this.database, async (session) => {
      const group = await this.ledger.createGroup({ name, members: [user.name.slice(0, 100) || 'Organiser'] }, session) as { id: string; members: { id: string }[] };
      const id = randomUUID();
      const now = new Date();
      await this.db.collection('trips').insertOne({
        _id: id as any, name, group_name: groupName, destination, start_date: startDate, end_date: endDate, budget, cover, details,
        invite_code: inviteCode(), expense_group_id: group.id, created_by: user.id, created_at: now, day_titles: [],
      }, { session });
      await this.db.collection('trip_members').insertOne(
        { trip_id: id, user_id: user.id, ledger_member_id: group.members[0].id, role: 'organiser', joined_at: now },
        { session },
      );
      return id;
    });
    return this.detail(await this.access(tripId, user.id));
  }

  // Partial update; only fields present in the body change. Only the organiser can move the dates. If that makes the
  // trip shorter, stops planned for days that no longer exist move to the new last day, and `movedStops` says how many.
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
    if (next.start_date !== trip.start_date || next.end_date !== trip.end_date) {
      if (access.role !== 'organiser') throw new ApiError(403, 'FORBIDDEN', 'Only the organiser can change the dates');
    }
    const updated = { ...trip, ...next };
    const movedStops = await transaction(this.database, async (session) => {
      await this.db.collection('trips').updateOne({ _id: trip.id as any }, { $set: next }, { session });
      const length = tripLength(updated);
      return length < tripLength(trip) ? fitStopsToLength(this.db, trip.id, length, session) : 0;
    });
    return { ...await this.detail({ ...access, trip: updated }), movedStops };
  }

  // With a session, bumping version write-locks the trip doc until the transaction ends (the old FOR UPDATE).
  private async tripByCode(code: string, session?: ClientSession) {
    requireThat(typeof code === 'string' && /^[a-z0-9]{4,32}$/i.test(code), 'Invalid invite code');
    const trips = this.db.collection('trips');
    const filter = { invite_code: code.toLowerCase() };
    const trip = session
      ? await trips.findOneAndUpdate(filter, { $inc: { version: 1 } }, { session, returnDocument: 'after' })
      : await trips.findOne(filter);
    if (!trip) throw new ApiError(404, 'INVITE_NOT_FOUND', 'This invite link is not valid');
    return tripRow(trip);
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
    const tripId = await transaction(this.database, async (session) => {
      // Locking the trip doc serializes joins, so a double tap can't add the same user twice.
      const trip = await this.tripByCode(code, session);
      const members = this.db.collection('trip_members');
      if (await members.findOne({ trip_id: trip.id, user_id: user.id }, { session })) return trip.id;
      const member = await this.ledger.addMember(trip.expense_group_id, { name: user.name.slice(0, 100) || 'Mate' }, session) as { id: string };
      await members.insertOne({ trip_id: trip.id, user_id: user.id, ledger_member_id: member.id, role: 'mate', joined_at: new Date() }, { session });
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
    const result = await this.ledger.mutate(`${groupId}/expenses`, idempotencyKey || randomUUID(), { ...ledgerInput, category, receiptKey }, async (session) => {
      const expense = await this.ledger.addExpense(groupId, ledgerInput, session) as { id: string };
      await this.db.collection('expenses').updateOne({ _id: expense.id as any }, { $set: { category, receipt_key: receiptKey, created_by: userId } }, { session });
      return { ...expense, category, receiptKey, createdBy: userId };
    }) as { id: string };
    return (await this.expenses(access, 1, 0, result.id))[0];
  }

  async expenses(access: TripAccess, limit: number, offset: number, onlyId?: string) {
    const rows = await this.db.collection('expenses')
      .find({ group_id: access.trip.expense_group_id, ...(onlyId ? { _id: onlyId as any } : {}) })
      .sort({ sequence: -1 }).skip(offset).limit(limit).toArray();
    return Promise.all(rows.map(async r => ({
      id: r._id as unknown as string,
      description: r.description,
      amountPaise: r.amount_paise,
      payerMemberId: r.payer_id,
      splitType: r.split_type,
      category: r.category,
      shares: [...(r.shares ?? [])].sort((a, b) => a.position - b.position)
        .map((s: { member_id: string; amount_paise: number }) => ({ memberId: s.member_id, amountPaise: Number(s.amount_paise) })),
      receiptUrl: r.receipt_key ? await this.storage.readUrl(r.receipt_key).catch(() => null) : null,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    })));
  }

  // Balances, suggested transfers, totals and category split in one call for the Expenses tab.
  async summary(access: TripAccess) {
    const groupId = access.trip.expense_group_id;
    const [balances, transfers, expenses] = await Promise.all([
      this.ledger.balances(groupId),
      this.ledger.suggestions(groupId),
      this.db.collection('expenses').find({ group_id: groupId }, { projection: { category: 1, amount_paise: 1, payer_id: 1, shares: 1 } }).toArray(),
    ]);
    const totals = new Map<string, { category: string; amountPaise: number; count: number }>();
    // What a naive "everyone pays back each payer" approach would take, for the "saved N transfers" stat
    const pairs = new Set<string>();
    for (const e of expenses) {
      const total = totals.get(e.category) ?? { category: e.category, amountPaise: 0, count: 0 };
      total.amountPaise += Number(e.amount_paise);
      total.count += 1;
      totals.set(e.category, total);
      for (const s of e.shares ?? []) if (s.member_id !== e.payer_id && s.amount_paise > 0) pairs.add(`${s.member_id}:${e.payer_id}`);
    }
    const categories = [...totals.values()].sort((a, b) => b.amountPaise - a.amountPaise);
    return {
      currency: 'INR',
      memberId: access.memberId,
      totalSpentPaise: categories.reduce((sum, c) => sum + c.amountPaise, 0),
      expenseCount: categories.reduce((sum, c) => sum + c.count, 0),
      balances,
      transfers,
      naiveTransferCount: pairs.size,
      categories,
    };
  }

  // Records a payment the caller sent or received. Settlements are manually confirmed (no UPI callback yet).
  async addSettlement(access: TripAccess, idempotencyKey: string, input: unknown) {
    const body = object(input);
    requireThat(body.fromMemberId === access.memberId || body.toMemberId === access.memberId, 'You can only record payments you sent or received');
    const groupId = access.trip.expense_group_id;
    const ledgerInput = { fromMemberId: body.fromMemberId, toMemberId: body.toMemberId, amountPaise: body.amountPaise, confirmed: true, note: body.note || 'Settled in GhoomMates' };
    return this.ledger.mutate(`${groupId}/settlements`, idempotencyKey || randomUUID(), ledgerInput, (session) => this.ledger.addSettlement(groupId, ledgerInput, session));
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
    // Upsert on object_key: a photo registered twice keeps its first doc
    const now = new Date();
    await this.db.collection('trip_photos').bulkWrite(photos.map(p => ({
      updateOne: {
        filter: { object_key: p.key },
        update: { $setOnInsert: {
          _id: p.id as any, trip_id: access.trip.id, uploaded_by: userId, content_type: p.contentType, size_bytes: p.size,
          width: p.width, height: p.height, caption: p.caption, created_at: now,
        } },
        upsert: true,
      },
    })));
    return { added: photos.length };
  }

  // face_photos is written by the cloud/ face services; a trip photo with no face_photos doc yet is pending.
  private async faceIndex(tripId: string, keys: string[]) {
    const [rows, [s]] = await Promise.all([
      this.db.collection('face_photos').find({ trip_id: tripId, object_name: { $in: keys } }, { projection: { object_name: 1, status: 1, face_count: 1 } }).toArray(),
      this.db.collection('trip_photos').aggregate([
        { $match: { trip_id: tripId } },
        { $lookup: { from: 'face_photos', localField: 'object_key', foreignField: 'object_name', pipeline: [{ $match: { trip_id: tripId } }, { $project: { status: 1, face_count: 1 } }], as: 'fp' } },
        { $unwind: { path: '$fp', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: null,
          indexed: { $sum: { $cond: [{ $eq: ['$fp.status', 'indexed'] }, 1, 0] } },
          no_faces: { $sum: { $cond: [{ $eq: ['$fp.status', 'no_faces'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$fp.status', 'error'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $ifNull: ['$fp', false] }, 0, 1] } },
          faces: { $sum: '$fp.face_count' },
        } },
      ]).toArray(),
    ]);
    return {
      byKey: new Map(rows.map(r => [r.object_name as string, { status: r.status as string, count: Number(r.face_count) }])),
      summary: { indexed: s?.indexed ?? 0, noFaces: s?.no_faces ?? 0, pending: s?.pending ?? 0, failed: s?.failed ?? 0, faces: s?.faces ?? 0 },
    };
  }

  async photos(access: TripAccess, limit: number, offset: number) {
    const collection = this.db.collection('trip_photos');
    const [rows, total] = await Promise.all([
      collection.find({ trip_id: access.trip.id }).sort({ created_at: -1, _id: 1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments({ trip_id: access.trip.id }),
    ]);
    const [uploaders, faces] = await Promise.all([
      this.db.collection('users').find({ _id: { $in: [...new Set(rows.map(r => r.uploaded_by))] } as any }, { projection: { name: 1 } }).toArray(),
      this.faceIndex(access.trip.id, rows.map(r => r.object_key)),
    ]);
    const nameOf = new Map(uploaders.map(u => [u._id as unknown as string, u.name as string]));
    return {
      total,
      faceSummary: faces.summary,
      items: await Promise.all(rows.map(async r => ({
        id: r._id as unknown as string,
        url: await this.storage.readUrl(r.object_key),
        width: r.width,
        height: r.height,
        caption: r.caption,
        uploadedBy: { userId: r.uploaded_by, name: nameOf.get(r.uploaded_by) },
        createdAt: r.created_at.toISOString(),
        faces: faces.byKey.get(r.object_key) ?? { status: 'pending', count: 0 },
      }))),
    };
  }

  // Selfie search over the trip's indexed faces. The selfie itself is never stored, only its embedding: after the
  // first search the 512-float vector is cached per user (keyed by the selfie's hash), and later searches send just
  // the vector, so face-search skips detection and embedding.
  async findMe(access: TripAccess, userId: string, body: unknown, faceSearch: FaceSearch) {
    const selfies = parseSelfies(body);
    const hashes = selfies.map(selfieHash);
    const embeddings = this.db.collection('user_face_embeddings');
    const cached = await embeddings.find({ user_id: userId, selfie_hash: { $in: hashes } }).toArray();
    const byHash = new Map(cached.map(r => [r.selfie_hash as string, (r.embedding as number[]).map(Number)]));
    let result: FaceSearchResult;
    if (hashes.every(h => byHash.has(h))) {
      result = await faceSearch.searchByEmbeddings(access.trip.id, hashes.map(h => byHash.get(h)!));
    } else {
      result = await faceSearch.search(access.trip.id, selfies);
      const fresh = result.embeddings;
      if (fresh?.length === hashes.length) {
        // A failed cache write must not fail the search; the next one just embeds again.
        await embeddings.deleteMany({ user_id: userId, selfie_hash: { $nin: hashes } })
          .then(() => embeddings.bulkWrite(hashes.map((h, i) => ({
            updateOne: {
              filter: { user_id: userId, selfie_hash: h },
              update: { $set: { embedding: fresh[i] }, $setOnInsert: { created_at: new Date() } },
              upsert: true,
            },
          }))))
          .catch(() => undefined);
      }
    }
    const names = result.matches.map(m => m.object_name);
    const rows = names.length
      ? await this.db.collection('trip_photos').find({ trip_id: access.trip.id, object_key: { $in: names } }, { projection: { object_key: 1 } }).toArray()
      : [];
    const matches = mapMatches(result.matches, new Map(rows.map(r => [r.object_key as string, r._id as unknown as string])));
    return { matches, threshold: result.threshold, truncated: result.truncated };
  }
}
