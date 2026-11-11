import { createHash } from 'node:crypto';
import { ApiError, integer, object, requireThat, splitExpense, suggestTransfers, text, type Balance } from './domain.ts';
import type { AnyBulkWriteOperation, Db } from 'mongodb';
import { isDuplicateKey, transaction, type ClientSession, type Database } from '../db.ts';

type Member = { id: string; name: string };
type Group = {
  id: string; name: string; currency: 'INR'; createdAt: string;
  members: Member[]; balances: Record<string, number>; sequence: number;
};

type GroupDoc = { _id: string; name: string; currency: 'INR'; sequence: number; created_at: Date };
type MemberDoc = { _id: string; group_id: string; position: number; name: string; balance_paise: number };
type ShareDoc = { position: number; member_id: string; amount_paise: number };
type ExpenseDoc = {
  _id: string; group_id: string; sequence: number; payer_id: string; description: string; amount_paise: number; split_type: string;
  created_at: Date; category: string; receipt_key: string | null; created_by: string | null; shares: ShareDoc[];
};
type SettlementDoc = {
  _id: string; group_id: string; sequence: number; from_member_id: string; to_member_id: string; amount_paise: number;
  note: string; verification: string; created_at: Date;
};
type IdempotencyDoc = { _id: string; scope: string; request: string; response: string; created_at: Date };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function publicGroup({ balances, sequence, ...group }: Group) { return group; }

export class ExpenseService {
  private database: Database;
  private db: Db;

  constructor(database: Database) {
    this.database = database;
    this.db = database.db;
  }

  private get groups() { return this.db.collection<GroupDoc>('groups'); }
  private get members() { return this.db.collection<MemberDoc>('group_members'); }
  private get expenseDocs() { return this.db.collection<ExpenseDoc>('expenses'); }
  private get settlementDocs() { return this.db.collection<SettlementDoc>('settlements'); }

  // Runs action in one transaction with its idempotency record. Concurrent requests sharing a key also bump the same
  // group sequence, so all but one hit a write conflict and the driver re-runs them; the re-run sees the stored response.
  // A request whose snapshot predates the winner's commit gets a duplicate key on insert instead: run it once more to replay.
  async mutate(scope: string, key: string, input: unknown, action: (session: ClientSession) => Promise<unknown>): Promise<unknown> {
    requireThat(/^[A-Za-z0-9_.:-]{1,128}$/.test(key), 'Idempotency-Key is required (1–128 letters, digits, _, ., :, or -)');
    const request = canonical(input);
    const id = createHash('sha256').update(JSON.stringify([scope, key])).digest('hex');
    const keys = this.db.collection<IdempotencyDoc>('idempotency_keys');
    const run = () => transaction(this.database, async (session) => {
      const old = await keys.findOne({ _id: id }, { session });
      if (old) {
        if (old.request !== request) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key was already used with a different request');
        return JSON.parse(old.response);
      }
      const result = await action(session);
      await keys.insertOne({ _id: id, scope, request, response: JSON.stringify(result), created_at: new Date() }, { session });
      return result;
    });
    try {
      return await run();
    } catch (err) {
      if (isDuplicateKey(err)) return run();
      throw err;
    }
  }

  // With a session (writes), the group's sequence is bumped first: concurrent ledger writes to the same group then
  // write-conflict and the driver retries them on a fresh snapshot, serializing ledger writes per group.
  private async loadGroup(id: string, session?: ClientSession): Promise<Group> {
    if (!UUID.test(id)) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const row = session
      ? await this.groups.findOneAndUpdate({ _id: id }, { $inc: { sequence: 1 } }, { session, returnDocument: 'after' })
      : await this.groups.findOne({ _id: id });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const members = await this.members.find({ group_id: id }, { session }).sort({ position: 1 }).toArray();
    return {
      id: row._id, name: row.name, currency: row.currency, createdAt: row.created_at.toISOString(),
      members: members.map(m => ({ id: m._id, name: m.name })),
      balances: Object.fromEntries(members.map(m => [m._id, m.balance_paise])),
      sequence: session ? integer(row.sequence, 'group sequence', 1, Number.MAX_SAFE_INTEGER) : row.sequence,
    };
  }

  async group(id: string) { return publicGroup(await this.loadGroup(id)); }

  private member(group: Group, id: string) {
    requireThat(group.members.some(m => m.id === id), 'All referenced members must belong to this group');
  }

  // Validates and applies balance changes to a group loaded with a session, then persists them as $inc deltas.
  private async updateBalances(session: ClientSession, group: Group, changes: [string, number][]) {
    // BigInt also protects intermediate sums when a payer is a participant.
    const values = new Map(Object.entries(group.balances).map(([id, value]) => [id, BigInt(value)]));
    const deltas = new Map<string, number>();
    for (const [id, delta] of changes) values.set(id, values.get(id)! + BigInt(delta));
    for (const [id, value] of values) {
      requireThat(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Group balance exceeds supported integer range');
      if (Number(value) !== group.balances[id]) deltas.set(id, Number(value) - group.balances[id]);
      group.balances[id] = Number(value);
    }
    requireThat([...values.values()].reduce((sum, value) => sum + value, 0n) === 0n, 'Group balances must sum to zero');
    const ops: AnyBulkWriteOperation<MemberDoc>[] = [...deltas].map(([id, delta]) => ({
      updateOne: { filter: { _id: id, group_id: group.id }, update: { $inc: { balance_paise: delta } } },
    }));
    if (ops.length) await this.members.bulkWrite(ops, { session });
  }

  async createGroup(input: unknown, session: ClientSession) {
    const body = object(input);
    const name = text(body.name, 'name');
    requireThat(body.currency === undefined || body.currency === 'INR', 'Only INR is supported');
    requireThat(Array.isArray(body.members) && body.members.length >= 1 && body.members.length <= 100, 'Provide between 1 and 100 member names');
    const members = body.members.map(n => ({ id: crypto.randomUUID(), name: text(n, 'member name', 100) }));
    const createdAt = new Date();
    const group: Group = {
      id: crypto.randomUUID(), name, currency: 'INR', createdAt: createdAt.toISOString(), members,
      balances: Object.fromEntries(members.map(m => [m.id, 0])), sequence: 0,
    };
    await this.groups.insertOne({ _id: group.id, name, currency: group.currency, sequence: 0, created_at: createdAt }, { session });
    await this.members.insertMany(members.map((m, position) => ({ _id: m.id, group_id: group.id, position, name: m.name, balance_paise: 0 })), { session });
    return publicGroup(group);
  }

  async addMember(groupId: string, input: unknown, session: ClientSession) {
    const group = await this.loadGroup(groupId, session);
    requireThat(group.members.length < 100, 'A group can have at most 100 members');
    const member = { id: crypto.randomUUID(), name: text(object(input).name, 'name', 100) };
    await this.members.insertOne({ _id: member.id, group_id: groupId, position: group.members.length, name: member.name, balance_paise: 0 }, { session });
    return member;
  }

  async addExpense(groupId: string, input: unknown, session: ClientSession) {
    const group = await this.loadGroup(groupId, session);
    const body = object(input);
    const amountPaise = integer(body.amountPaise, 'amountPaise');
    const payerId = text(body.payerId, 'payerId');
    const description = text(body.description, 'description', 500);
    this.member(group, payerId);
    const split = splitExpense(amountPaise, body.split);
    for (const share of split.shares) this.member(group, share.memberId);
    await this.updateBalances(session, group, [[payerId, amountPaise], ...split.shares.map(s => [s.memberId, -s.amountPaise] as [string, number])]);
    const createdAt = new Date();
    const expense = { id: crypto.randomUUID(), groupId, payerId, description, amountPaise, splitType: split.type, createdAt: createdAt.toISOString(), shares: split.shares };
    await this.expenseDocs.insertOne({
      _id: expense.id, group_id: groupId, sequence: group.sequence, payer_id: payerId, description, amount_paise: amountPaise,
      split_type: split.type, created_at: createdAt, category: 'other', receipt_key: null, created_by: null,
      shares: split.shares.map((s, position) => ({ position, member_id: s.memberId, amount_paise: s.amountPaise })),
    }, { session });
    return expense;
  }

  async expenses(groupId: string, limit: number, offset: number) {
    await this.loadGroup(groupId);
    const rows = await this.expenseDocs.find({ group_id: groupId }).sort({ sequence: -1 }).skip(offset).limit(limit).toArray();
    return rows.map(r => ({
      id: r._id, groupId: r.group_id, payerId: r.payer_id, description: r.description, amountPaise: r.amount_paise,
      splitType: r.split_type, createdAt: r.created_at.toISOString(),
      shares: [...r.shares].sort((a, b) => a.position - b.position).map(s => ({ memberId: s.member_id, amountPaise: s.amount_paise })),
    }));
  }

  async balances(groupId: string): Promise<Balance[]> {
    const group = await this.loadGroup(groupId);
    return Object.entries(group.balances).map(([memberId, netPaise]) => ({ memberId, netPaise })).sort((a, b) => a.memberId.localeCompare(b.memberId));
  }

  async suggestions(groupId: string) { return suggestTransfers(await this.balances(groupId)); }

  async addSettlement(groupId: string, input: unknown, session: ClientSession) {
    const body = object(input);
    const group = await this.loadGroup(groupId, session);
    const from = text(body.fromMemberId, 'fromMemberId');
    const to = text(body.toMemberId, 'toMemberId');
    this.member(group, from); this.member(group, to);
    requireThat(from !== to, 'Settlement members must differ');
    const amountPaise = integer(body.amountPaise, 'amountPaise');
    requireThat(body.confirmed === true, 'confirmed must be true to record a manually confirmed payment');
    requireThat(amountPaise <= -group.balances[from] && amountPaise <= group.balances[to], 'Settlement exceeds outstanding debtor or creditor balance');
    const note = body.note === undefined ? '' : text(body.note, 'note', 500);
    const createdAt = new Date();
    const settlement = { id: crypto.randomUUID(), groupId, fromMemberId: from, toMemberId: to, amountPaise, note, verification: 'manual', createdAt: createdAt.toISOString() };
    await this.updateBalances(session, group, [[from, amountPaise], [to, -amountPaise]]);
    await this.settlementDocs.insertOne({
      _id: settlement.id, group_id: groupId, sequence: group.sequence, from_member_id: from, to_member_id: to,
      amount_paise: amountPaise, note, verification: settlement.verification, created_at: createdAt,
    }, { session });
    return settlement;
  }

  async settlements(groupId: string, limit: number, offset: number) {
    await this.loadGroup(groupId);
    const rows = await this.settlementDocs.find({ group_id: groupId }).sort({ sequence: -1 }).skip(offset).limit(limit).toArray();
    return rows.map(r => ({
      id: r._id, fromMemberId: r.from_member_id, toMemberId: r.to_member_id, amountPaise: r.amount_paise,
      note: r.note, verification: r.verification, createdAt: r.created_at.toISOString(),
    }));
  }
}
