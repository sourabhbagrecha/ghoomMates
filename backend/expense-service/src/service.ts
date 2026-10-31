import { createHash } from 'node:crypto';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { ApiError, integer, object, requireThat, splitExpense, suggestTransfers, text, type Balance } from './domain.ts';
import type { Database } from './database.ts';

type Member = { id: string; name: string };
type Group = {
  id: string; name: string; currency: 'INR'; createdAt: string;
  members: Member[]; balances: Record<string, number>; sequence: number;
};

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
  private client: MongoClient;
  private db: Db;

  constructor(database: Database) {
    this.client = database.client;
    this.db = database.db;
  }

  // All reads happen before writes. Multi-document transactions protect consistency.
  async mutate(scope: string, key: string, input: unknown, action: (session: ClientSession) => Promise<unknown>): Promise<unknown> {
    requireThat(/^[A-Za-z0-9_.:-]{1,128}$/.test(key), 'Idempotency-Key is required (1–128 letters, digits, _, ., :, or -)');
    const request = canonical(input);
    const id = createHash('sha256').update(JSON.stringify([scope, key])).digest('hex');
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const idempotencyCol = this.db.collection('idempotency');
        const old = await idempotencyCol.findOne({ _id: id as any }, { session });
        if (old) {
          if (old.request !== request) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key was already used with a different request');
          return JSON.parse(old.response);
        }
        const result = await action(session);
        await idempotencyCol.insertOne({ _id: id as any, scope, request, response: JSON.stringify(result) }, { session });
        return result;
      });
    } finally {
      await session.endSession();
    }
  }

  private async loadGroup(id: string, session?: ClientSession): Promise<Group> {
    const doc = await this.db.collection('groups').findOne({ id }, { session });
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const { _id, ...group } = doc;
    return group as unknown as Group;
  }

  async group(id: string) { return publicGroup(await this.loadGroup(id)); }

  private member(group: Group, id: string) {
    requireThat(group.members.some(m => m.id === id), 'All referenced members must belong to this group');
  }

  private updateBalances(group: Group, changes: [string, number][]) {
    // BigInt also protects intermediate sums when a payer is a participant.
    const values = new Map(Object.entries(group.balances).map(([id, value]) => [id, BigInt(value)]));
    for (const [id, delta] of changes) values.set(id, values.get(id)! + BigInt(delta));
    for (const [id, value] of values) {
      requireThat(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Group balance exceeds supported integer range');
      group.balances[id] = Number(value);
    }
    requireThat([...values.values()].reduce((sum, value) => sum + value, 0n) === 0n, 'Group balances must sum to zero');
  }

  private async writeGroup(session: ClientSession, group: Group) {
    group.sequence = integer(group.sequence + 1, 'group sequence', 1, Number.MAX_SAFE_INTEGER);
    await this.db.collection('groups').replaceOne({ id: group.id }, { ...group }, { upsert: true, session });
  }

  async createGroup(input: unknown, session: ClientSession) {
    const body = object(input);
    const name = text(body.name, 'name');
    requireThat(body.currency === undefined || body.currency === 'INR', 'Only INR is supported');
    requireThat(Array.isArray(body.members) && body.members.length >= 1 && body.members.length <= 100, 'Provide between 1 and 100 member names');
    const members = body.members.map(n => ({ id: crypto.randomUUID(), name: text(n, 'member name', 100) }));
    const group: Group = {
      id: crypto.randomUUID(), name, currency: 'INR', createdAt: new Date().toISOString(), members,
      balances: Object.fromEntries(members.map(m => [m.id, 0])), sequence: 0,
    };
    await this.db.collection('groups').insertOne({ ...group }, { session });
    return publicGroup(group);
  }

  async addMember(groupId: string, input: unknown, session: ClientSession) {
    const group = await this.loadGroup(groupId, session);
    requireThat(group.members.length < 100, 'A group can have at most 100 members');
    const member = { id: crypto.randomUUID(), name: text(object(input).name, 'name', 100) };
    group.members.push(member); group.balances[member.id] = 0;
    await this.writeGroup(session, group);
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
    this.updateBalances(group, [[payerId, amountPaise], ...split.shares.map(s => [s.memberId, -s.amountPaise] as [string, number])]);
    const expense = { id: crypto.randomUUID(), groupId, payerId, description, amountPaise, splitType: split.type, createdAt: new Date().toISOString(), shares: split.shares };
    await this.writeGroup(session, group);
    await this.db.collection('expenses').insertOne({ ...expense, sequence: group.sequence }, { session });
    return expense;
  }

  private async history(groupId: string, collectionName: string, limit: number, offset: number) {
    await this.loadGroup(groupId);
    const docs = await this.db.collection(collectionName)
      .find({ groupId })
      .sort({ sequence: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
    return docs.map(doc => {
      const { _id, sequence, ...entry } = doc;
      return entry;
    });
  }

  expenses(groupId: string, limit: number, offset: number) { return this.history(groupId, 'expenses', limit, offset); }

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
    const settlement = { id: crypto.randomUUID(), groupId, fromMemberId: from, toMemberId: to, amountPaise, note, verification: 'manual', createdAt: new Date().toISOString() };
    this.updateBalances(group, [[from, amountPaise], [to, -amountPaise]]);
    await this.writeGroup(session, group);
    await this.db.collection('settlements').insertOne({ ...settlement, sequence: group.sequence }, { session });
    return settlement;
  }

  async settlements(groupId: string, limit: number, offset: number) {
    return (await this.history(groupId, 'settlements', limit, offset)).map(({ groupId: _, ...entry }) => entry);
  }
}
