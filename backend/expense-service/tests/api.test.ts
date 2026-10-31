import { afterEach, beforeEach, expect, test } from 'bun:test';
import { openDatabase, type Database } from '../src/database.ts';
import { createApp } from '../src/app.ts';
const apiKey = 'test-secret-'.repeat(4);

let db: Database;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = await openDatabase();
  app = createApp(db, apiKey);
});
afterEach(async () => {
  await db.terminate();
});
async function request(path: string, body?: unknown, key: string = crypto.randomUUID()) {
  const response = await app(new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: response.status, data: await response.json() as any };
}
async function group() {
  const result = await request('/api/groups', { name: 'Goa trip', members: ['Asha', 'Ben', 'Chen'] });
  expect(result.status).toBe(201);
  return result.data as { id: string; members: { id: string }[] };
}
function expense(members: { id: string }[], amountPaise = 10000) {
  return { payerId: members[0].id, description: 'Dinner', amountPaise, split: { type: 'equal', participants: members.map(m => ({ memberId: m.id })) } };
}
test('expenses, balances, partial settlements, and suggested transfers work end to end', async () => {
  const g = await group(); const base = `/api/groups/${g.id}`;
  expect((await request(`${base}/expenses`, expense(g.members))).status).toBe(201);
  const balances = (await request(`${base}/balances`)).data.balances;
  expect(balances.reduce((sum: number, b: any) => sum + b.netPaise, 0)).toBe(0);
  expect(balances.find((b: any) => b.memberId === g.members[0].id).netPaise).toBe(6666);
  const transfer = { fromMemberId: g.members[1].id, toMemberId: g.members[0].id, amountPaise: 1000, confirmed: true };
  const first = await request(`${base}/settlements`, transfer, 'payment-1');
  expect(first.status).toBe(201); expect(first.data.verification).toBe('manual');
  expect((await request(`${base}/settlements`, transfer, 'payment-1')).data).toEqual(first.data);
  expect((await request(`${base}/settlements`)).data.items).toHaveLength(1);
  expect((await request(`${base}/settlements`, { ...transfer, amountPaise: 3333 })).status).toBe(400);
  for (const t of (await request(`${base}/settlement-suggestions`)).data.transfers) {
    expect((await request(`${base}/settlements`, { ...t, confirmed: true })).status).toBe(201);
  }
  expect((await request(`${base}/balances`)).data.balances.every((b: any) => b.netPaise === 0)).toBe(true);
  expect((await request(`${base}/settlement-suggestions`)).data.transfers).toEqual([]);
});
test('expense retries are idempotent, including simultaneous requests', async () => {
  const g = await group(); const path = `/api/groups/${g.id}/expenses`; const payload = expense(g.members);
  const results = await Promise.all(Array.from({ length: 5 }, () => request(path, payload, 'same')));
  expect(results.every(r => r.status === 201)).toBe(true);
  expect(new Set(results.map(r => r.data.id)).size).toBe(1);
  expect((await request(path)).data.items).toHaveLength(1);
  expect((await request(path, { ...payload, amountPaise: 999 }, 'same')).status).toBe(409);
});
test('cross-group members and invalid shares cannot create partial ledger entries', async () => {
  const g = await group(); const other = await group(); const path = `/api/groups/${g.id}/expenses`;
  expect((await request(path, expense(other.members), 'retry')).status).toBe(400);
  expect((await request(path, { ...expense(g.members), split: { type: 'exact', participants: [{ memberId: g.members[0].id, value: 1 }] } })).status).toBe(400);
  expect((await request(path)).data.items).toEqual([]);
  expect((await request(path, expense(g.members), 'retry')).status).toBe(201);
});
test('exact and percentage expenses persist correct shares', async () => {
  const g = await group(); const path = `/api/groups/${g.id}/expenses`;
  for (const [type, values] of [['exact', [100, 200, 9700]], ['percentage', [3333, 3333, 3334]]] as const) {
    const result = await request(path, { ...expense(g.members), split: { type, participants: g.members.map((m, i) => ({ memberId: m.id, value: values[i] })) } });
    expect(result.status).toBe(201);
    expect(result.data.shares.map((s: any) => s.amountPaise)).toEqual([...values]);
  }
});
test('member additions do not retroactively change existing expense shares', async () => {
  const g = await group(); const base = `/api/groups/${g.id}`;
  await request(`${base}/expenses`, expense(g.members));
  const added = await request(`${base}/members`, { name: 'Deepa' });
  expect(added.status).toBe(201);
  expect((await request(`${base}/balances`)).data.balances.find((b: any) => b.memberId === added.data.id).netPaise).toBe(0);
});
test('requires authentication, valid JSON, content type, and idempotency key', async () => {
  expect((await app(new Request('http://localhost/api/groups'))).status).toBe(401);
  expect((await app(new Request('http://localhost/health'))).status).toBe(200);
  expect((await request('/api/groups', { name: 'x', members: ['a'] }, '')).status).toBe(400);
  for (const [body, contentType, status] of [['{', 'application/json', 400], ['{}', 'text/plain', 415], ['x'.repeat(65537), 'application/json', 413]] as const) {
    const response = await app(new Request('http://localhost/api/groups', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': contentType }, body }));
    expect(response.status).toBe(status);
  }
  expect((await request('/api/groups/missing/balances')).status).toBe(404);
});
test('settlement rejects self-payments, unconfirmed records, and cross-group parties', async () => {
  const g = await group(); const other = await group(); const base = `/api/groups/${g.id}`;
  await request(`${base}/expenses`, expense(g.members));
  const payment = { fromMemberId: g.members[1].id, toMemberId: g.members[0].id, amountPaise: 100, confirmed: true };
  for (const invalid of [{ ...payment, confirmed: false }, { ...payment, toMemberId: payment.fromMemberId }, { ...payment, fromMemberId: other.members[1].id }, { ...payment, amountPaise: -1 }]) {
    expect((await request(`${base}/settlements`, invalid)).status).toBe(400);
  }
  expect((await request(`${base}/settlements`)).data.items).toHaveLength(0);
});
test('ledger and idempotency survive creating a new Firestore client', async () => {
  const payload = { name: 'Persistent trip', members: ['Asha'] };
  const initial = await request('/api/groups', payload, 'persistent');
  expect(initial.status).toBe(201);
  await db.terminate(); db = await openDatabase(); app = createApp(db, apiKey);
  expect((await request('/api/groups', payload, 'persistent')).data).toEqual(initial.data);
  expect((await request(`/api/groups/${initial.data.id}`)).status).toBe(200);
});

test('concurrent unique expenses do not lose balance updates', async () => {
  const g = await group(); const base = `/api/groups/${g.id}`;
  const results = await Promise.all(Array.from({ length: 4 }, () => request(`${base}/expenses`, expense(g.members, 300))));
  expect(results.map(r => r.status)).toEqual([201, 201, 201, 201]);
  const balances = (await request(`${base}/balances`)).data.balances;
  expect(balances.find((b: any) => b.memberId === g.members[0].id).netPaise).toBe(800);
  expect((await request(`${base}/expenses`)).data.items).toHaveLength(4);
});

test('concurrent settlements cannot overpay the same debt', async () => {
  const g = await group(); const base = `/api/groups/${g.id}`;
  await request(`${base}/expenses`, expense(g.members, 300));
  const payload = { fromMemberId: g.members[1].id, toMemberId: g.members[0].id, amountPaise: 100, confirmed: true };
  const results = await Promise.all([request(`${base}/settlements`, payload), request(`${base}/settlements`, payload)]);
  expect(results.map(r => r.status).sort()).toEqual([201, 400]);
  expect((await request(`${base}/settlements`)).data.items).toHaveLength(1);
  expect((await request(`${base}/balances`)).data.balances.find((b: any) => b.memberId === g.members[1].id).netPaise).toBe(0);
});

test('history pagination preserves newest-first ledger order', async () => {
  const g = await group(); const base = `/api/groups/${g.id}/expenses`;
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await request(base, expense(g.members, 300))).data.id);
  expect((await request(`${base}?limit=2&offset=1`)).data.items.map((e: any) => e.id)).toEqual([ids[1], ids[0]]);
});
