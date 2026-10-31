export {};
// Creates a small sample trip and records one MANUAL settlement; no money moves.
// BASE_URL=https://your-service.run.app API_KEY=... bun scripts/test-api.ts
const baseUrl = process.env.BASE_URL?.replace(/\/$/, '');
const apiKey = process.env.API_KEY;
if (!baseUrl || !apiKey) throw new Error('Set BASE_URL and API_KEY before running the test flow');
const target = new URL(baseUrl);
if (target.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Use HTTPS when sending an API key to a remote service');
}
async function call(path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(data)}`);
  console.log(`${body === undefined ? 'GET' : 'POST'} ${path}: ${response.status}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}
await call('/health');
const group = await call('/api/groups', { name: `API test trip ${new Date().toISOString()}`, members: ['Asha', 'Ben', 'Chen'] });
const path = `/api/groups/${group.id}`;
await call(`${path}/expenses`, {
  payerId: group.members[0].id,
  description: 'Sample dinner — test data',
  amountPaise: 120000,
  split: { type: 'equal', participants: group.members.map((member: { id: string }) => ({ memberId: member.id })) },
});
await call(`${path}/balances`);
const { transfers } = await call(`${path}/settlement-suggestions`);
if (transfers.length !== 2 || transfers.some((transfer: { amountPaise: number }) => transfer.amountPaise !== 40000)) {
  throw new Error('Unexpected balances for the sample expense');
}
await call(`${path}/settlements`, { ...transfers[0], confirmed: true, note: 'Sample manual settlement for API testing only' });
await call(`${path}/balances`);
await call(`${path}/settlements`);
console.log(`Test flow passed. Sample group retained at ${baseUrl}${path}`);
