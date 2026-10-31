import { createHash } from 'node:crypto';
import { ApiError, integer, object, requireThat, splitExpense, suggestTransfers, text, type Balance } from './domain.ts';
import { transaction, type Database, type Pool, type Tx } from '../db.ts';

type Member = { id: string; name: string };
type Group = {
  id: string; name: string; currency: 'INR'; createdAt: string;
  members: Member[]; balances: Record<string, number>; sequence: number;
};

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
  private pool: Pool;

  constructor(database: Database) {
    this.pool = database.pool;
  }

  // Runs action in one transaction with its idempotency record. A transaction-scoped advisory lock
  // serializes requests sharing a key, so concurrent retries wait and replay the stored response.
  async mutate(scope: string, key: string, input: unknown, action: (tx: Tx) => Promise<unknown>): Promise<unknown> {
    requireThat(/^[A-Za-z0-9_.:-]{1,128}$/.test(key), 'Idempotency-Key is required (1–128 letters, digits, _, ., :, or -)');
    const request = canonical(input);
    const id = createHash('sha256').update(JSON.stringify([scope, key])).digest('hex');
    return transaction(this.pool, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
      const { rows: [old] } = await tx.query<{ request: string; response: string }>('SELECT request, response FROM idempotency_keys WHERE id = $1', [id]);
      if (old) {
        if (old.request !== request) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key was already used with a different request');
        return JSON.parse(old.response);
      }
      const result = await action(tx);
      await tx.query('INSERT INTO idempotency_keys (id, scope, request, response) VALUES ($1, $2, $3, $4)', [id, scope, request, JSON.stringify(result)]);
      return result;
    });
  }

  // With forUpdate, the group row stays locked until the transaction ends, serializing ledger writes per group.
  // Members are read in a second statement so, under READ COMMITTED, they see writes committed while waiting for the lock.
  private async loadGroup(id: string, db: Pool | Tx = this.pool, forUpdate = false): Promise<Group> {
    if (!UUID.test(id)) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const { rows: [row] } = await db.query(`SELECT id, name, currency, sequence, created_at FROM groups WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const { rows: members } = await db.query('SELECT id, name, balance_paise FROM group_members WHERE group_id = $1 ORDER BY position', [id]);
    return {
      id: row.id, name: row.name, currency: row.currency, createdAt: row.created_at.toISOString(),
      members: members.map(m => ({ id: m.id, name: m.name })),
      balances: Object.fromEntries(members.map(m => [m.id, m.balance_paise])),
      sequence: row.sequence,
    };
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

  // Persists the next sequence number and every member balance of a group loaded with forUpdate.
  private async writeGroup(tx: Tx, group: Group) {
    group.sequence = integer(group.sequence + 1, 'group sequence', 1, Number.MAX_SAFE_INTEGER);
    const ids = Object.keys(group.balances);
    await tx.query(
      `WITH bumped AS (UPDATE groups SET sequence = $2 WHERE id = $1)
       UPDATE group_members m SET balance_paise = b.balance
       FROM unnest($3::uuid[], $4::bigint[]) AS b (id, balance)
       WHERE m.group_id = $1 AND m.id = b.id AND m.balance_paise <> b.balance`,
      [group.id, group.sequence, ids, ids.map(id => String(group.balances[id]))],
    );
  }

  async createGroup(input: unknown, tx: Tx) {
    const body = object(input);
    const name = text(body.name, 'name');
    requireThat(body.currency === undefined || body.currency === 'INR', 'Only INR is supported');
    requireThat(Array.isArray(body.members) && body.members.length >= 1 && body.members.length <= 100, 'Provide between 1 and 100 member names');
    const members = body.members.map(n => ({ id: crypto.randomUUID(), name: text(n, 'member name', 100) }));
    const group: Group = {
      id: crypto.randomUUID(), name, currency: 'INR', createdAt: new Date().toISOString(), members,
      balances: Object.fromEntries(members.map(m => [m.id, 0])), sequence: 0,
    };
    await tx.query('INSERT INTO groups (id, name, currency, created_at) VALUES ($1, $2, $3, $4)', [group.id, name, group.currency, group.createdAt]);
    await tx.query(
      `INSERT INTO group_members (id, group_id, position, name)
       SELECT m.id, $1, m.ord - 1, m.name FROM unnest($2::uuid[], $3::text[]) WITH ORDINALITY AS m (id, name, ord)`,
      [group.id, members.map(m => m.id), members.map(m => m.name)],
    );
    return publicGroup(group);
  }

  async addMember(groupId: string, input: unknown, tx: Tx) {
    const group = await this.loadGroup(groupId, tx, true);
    requireThat(group.members.length < 100, 'A group can have at most 100 members');
    const member = { id: crypto.randomUUID(), name: text(object(input).name, 'name', 100) };
    await tx.query('INSERT INTO group_members (id, group_id, position, name) VALUES ($1, $2, $3, $4)', [member.id, groupId, group.members.length, member.name]);
    group.members.push(member); group.balances[member.id] = 0;
    await this.writeGroup(tx, group);
    return member;
  }

  async addExpense(groupId: string, input: unknown, tx: Tx) {
    const group = await this.loadGroup(groupId, tx, true);
    const body = object(input);
    const amountPaise = integer(body.amountPaise, 'amountPaise');
    const payerId = text(body.payerId, 'payerId');
    const description = text(body.description, 'description', 500);
    this.member(group, payerId);
    const split = splitExpense(amountPaise, body.split);
    for (const share of split.shares) this.member(group, share.memberId);
    this.updateBalances(group, [[payerId, amountPaise], ...split.shares.map(s => [s.memberId, -s.amountPaise] as [string, number])]);
    const expense = { id: crypto.randomUUID(), groupId, payerId, description, amountPaise, splitType: split.type, createdAt: new Date().toISOString(), shares: split.shares };
    await this.writeGroup(tx, group);
    await tx.query(
      `INSERT INTO expenses (id, group_id, sequence, payer_id, description, amount_paise, split_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [expense.id, groupId, group.sequence, payerId, description, amountPaise, split.type, expense.createdAt],
    );
    await tx.query(
      `INSERT INTO expense_shares (expense_id, position, group_id, member_id, amount_paise)
       SELECT $1, s.ord - 1, $2, s.member_id, s.amount FROM unnest($3::uuid[], $4::bigint[]) WITH ORDINALITY AS s (member_id, amount, ord)`,
      [expense.id, groupId, split.shares.map(s => s.memberId), split.shares.map(s => String(s.amountPaise))],
    );
    return expense;
  }

  async expenses(groupId: string, limit: number, offset: number) {
    await this.loadGroup(groupId);
    const { rows } = await this.pool.query(
      `SELECT e.id, e.group_id, e.payer_id, e.description, e.amount_paise, e.split_type, e.created_at,
         (SELECT json_agg(json_build_object('memberId', s.member_id, 'amountPaise', s.amount_paise) ORDER BY s.position)
          FROM expense_shares s WHERE s.expense_id = e.id) AS shares
       FROM expenses e WHERE e.group_id = $1 ORDER BY e.sequence DESC LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );
    return rows.map(r => ({
      id: r.id, groupId: r.group_id, payerId: r.payer_id, description: r.description, amountPaise: r.amount_paise,
      splitType: r.split_type, createdAt: r.created_at.toISOString(), shares: r.shares,
    }));
  }

  async balances(groupId: string): Promise<Balance[]> {
    const group = await this.loadGroup(groupId);
    return Object.entries(group.balances).map(([memberId, netPaise]) => ({ memberId, netPaise })).sort((a, b) => a.memberId.localeCompare(b.memberId));
  }

  async suggestions(groupId: string) { return suggestTransfers(await this.balances(groupId)); }

  async addSettlement(groupId: string, input: unknown, tx: Tx) {
    const body = object(input);
    const group = await this.loadGroup(groupId, tx, true);
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
    await this.writeGroup(tx, group);
    await tx.query(
      `INSERT INTO settlements (id, group_id, sequence, from_member_id, to_member_id, amount_paise, note, verification, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [settlement.id, groupId, group.sequence, from, to, amountPaise, note, settlement.verification, settlement.createdAt],
    );
    return settlement;
  }

  async settlements(groupId: string, limit: number, offset: number) {
    await this.loadGroup(groupId);
    const { rows } = await this.pool.query(
      `SELECT id, from_member_id, to_member_id, amount_paise, note, verification, created_at
       FROM settlements WHERE group_id = $1 ORDER BY sequence DESC LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );
    return rows.map(r => ({
      id: r.id, fromMemberId: r.from_member_id, toMemberId: r.to_member_id, amountPaise: r.amount_paise,
      note: r.note, verification: r.verification, createdAt: r.created_at.toISOString(),
    }));
  }
}
