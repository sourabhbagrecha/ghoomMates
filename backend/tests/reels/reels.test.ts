import test from 'node:test';
import assert from 'node:assert/strict';
import { signJwt } from '../../src/auth/jwt.ts';
import { createApp } from '../../src/reels/app.ts';
import { createGeminiPlanner } from '../../src/reels/gemini.ts';
import { normalizePlan, parseReelRequest } from '../../src/reels/plan.ts';
import type { ReelPlanner } from '../../src/reels/gemini.ts';
import { mount, serve } from '../helpers.ts';

const SECRET = 'reels-test-secret-that-is-at-least-32-chars';
const token = signJwt({ userId: 'usr_1', email: 'a@test.com', name: 'A' }, SECRET);

const body = {
  direction: 'Make a 20s reel of Kabir’s funniest moments',
  durationSeconds: 20,
  squad: ['You', 'Kabir', 'Riya'],
  photos: [
    { id: 'p0', caption: 'Chapora Fort', time: 'Sat 06:12', people: ['Kabir', 'Riya'], image: { mimeType: 'image/jpeg', data: 'AAAA' } },
    { id: 'p1', caption: 'Vagator beach', people: ['Kabir'] },
  ],
};

const rawPlan = {
  title: 'Kabir unfiltered',
  style: 'spotlight',
  starring: 'kabir',
  scenes: [
    { photoId: 'p0', seconds: 4, caption: 'Sunrise squad', motion: 'zoom-in', transition: 'fade' },
    { photoId: 'nope', seconds: 4, caption: 'Made up', motion: 'zoom-in', transition: 'fade' },
    { photoId: 'p1', seconds: 4, caption: 'x'.repeat(100), motion: 'spin', transition: 'explode' },
  ],
};

test('parseReelRequest validates and clamps the request', () => {
  const request = parseReelRequest({ ...body, durationSeconds: 500, style: 'auto' });
  assert.equal(request.durationSeconds, 90);
  assert.equal(request.style, null);
  assert.deepEqual(request.photos[0].image, { mimeType: 'image/jpeg', data: 'AAAA' });

  assert.throws(() => parseReelRequest({ ...body, direction: '  ' }), /direction is required/);
  assert.throws(() => parseReelRequest({ ...body, style: 'vaporwave' }), /style must be one of/);
  assert.throws(() => parseReelRequest({ ...body, photos: [body.photos[1], body.photos[1]] }), /duplicated/);
  assert.throws(
    () => parseReelRequest({ ...body, photos: [{ id: 'p0', image: { mimeType: 'image/gif', data: 'AAAA' } }] }),
    /mimeType/,
  );
});

test('normalizePlan drops unknown photos, defaults options and fits the duration', () => {
  const plan = normalizePlan(rawPlan, parseReelRequest(body));
  assert.deepEqual(plan.scenes.map((s) => s.photoId), ['p0', 'p1']);
  assert.equal(plan.scenes[1].caption.length, 48);
  assert.equal(plan.scenes[1].motion, 'zoom-in');
  assert.equal(plan.scenes[1].transition, 'wipe');
  assert.equal(plan.starring, 'kabir');
  // 20s minus 3s for the title and end cards, split across two equal scenes
  assert.deepEqual(plan.scenes.map((s) => s.seconds), [8, 8]);

  // A style the user picked wins over the model's choice; an unknown star is dropped
  const picked = normalizePlan({ ...rawPlan, starring: 'Zoya' }, parseReelRequest({ ...body, style: 'cinematic' }));
  assert.equal(picked.style, 'cinematic');
  assert.equal(picked.starring, null);

  assert.throws(() => normalizePlan({ scenes: [{ photoId: 'nope' }] }, parseReelRequest(body)), /did not pick any photos/);
});

test('POST /reels/plan requires a session and returns the normalized plan', async () => {
  const seen: unknown[] = [];
  const planner: ReelPlanner = async (request) => {
    seen.push(request);
    return rawPlan;
  };
  const server = await serve(mount('/reels', createApp(planner, { jwtSecret: SECRET, clientOrigin: 'http://localhost:5173' })));
  const post = (headers: Record<string, string>, payload: unknown = body) =>
    server.request('/reels/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  try {
    const anonymous = await post({});
    assert.equal(anonymous.status, 401);

    const forged = await post({ Authorization: `Bearer ${signJwt({ userId: 'x', email: 'x', name: 'x' }, 'another-secret-that-is-32-characters-long')}` });
    assert.equal(forged.status, 401);

    const bad = await post({ Authorization: `Bearer ${token}` }, { photos: [] });
    assert.equal(bad.status, 400);
    assert.equal(seen.length, 0);

    const ok = await post({ Authorization: `Bearer ${token}` });
    assert.equal(ok.status, 200);
    const { plan } = await ok.json();
    assert.equal(plan.title, 'Kabir unfiltered');
    assert.equal(plan.scenes.length, 2);
    assert.equal(seen.length, 1);
  } finally {
    await server.close();
  }
});

test('Gemini planner sends photos with a constrained JSON schema and parses the reply', async () => {
  let url = '';
  let sent: any;
  const planner = createGeminiPlanner({
    apiKey: 'test-key',
    model: 'gemini-test',
    fetch: async (input, init) => {
      url = String(input);
      sent = { headers: init?.headers, body: JSON.parse(String(init?.body)) };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(rawPlan) }] } }] });
    },
  });

  assert.deepEqual(await planner(parseReelRequest(body)), rawPlan);
  assert.match(url, /\/models\/gemini-test:generateContent$/);
  assert.equal(sent.headers['x-goog-api-key'], 'test-key');
  const parts = sent.body.contents[0].parts;
  assert.match(parts[0].text, /Direction: Make a 20s reel/);
  assert.deepEqual(parts.find((p: any) => p.inlineData).inlineData, { mimeType: 'image/jpeg', data: 'AAAA' });
  const config = sent.body.generationConfig;
  assert.equal(config.responseMimeType, 'application/json');
  assert.deepEqual(config.responseSchema.properties.scenes.items.properties.photoId.enum, ['p0', 'p1']);

  const blocked = createGeminiPlanner({
    apiKey: 'k',
    model: 'm',
    fetch: async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }),
  });
  await assert.rejects(blocked(parseReelRequest(body)), { code: 'DIRECTION_REJECTED' });
});
