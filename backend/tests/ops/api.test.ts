import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import type { Gemini } from '../../src/gemini.ts';
import { ApiError } from '../../src/http.ts';
import type { User } from '../../src/auth/types.ts';
import type { OpsDb } from '../../src/ops/advisories.ts';
import { createOpsApp } from '../../src/ops/app.ts';
import { mount, serve } from '../helpers.ts';

const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;
const authenticate = async (token: string) => {
  if (token !== 'asha') throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  return asha;
};

// 2026-11-01 11:30 in India
const NOW = () => new Date('2026-11-01T06:00:00Z');
const TOMORROW = '2026-11-02';

type PlannedRow = { trip_id: string; title: string; place: string; tag: string; minutes: number; destination: string; name: string; people: number };
const planned = (n: number, title: string, minutes: number, extra: Partial<PlannedRow> = {}): PlannedRow[] =>
  Array.from({ length: n }, (_, i) => ({
    trip_id: `trip-secret-${title}-${minutes}-${i}`, title, place: '', tag: 'Culture', minutes, destination: 'Udaipur', name: 'Secret Squad Trip', people: 4, ...extra,
  }));

/** In-memory stand-in for the queries the ops routes run */
function fakeDb(rows: PlannedRow[] = []) {
  const advisories: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const db: OpsDb = {
    pool: {
      query: async (sql, values = []) => {
        calls.push(sql);
        if (sql.includes('FROM trip_stops')) return { rowCount: rows.length, rows };
        if (sql.startsWith('INSERT INTO heritage_advisories')) {
          const row = {
            id: values[0], city: values[1], site_id: values[2], advisory_date: values[3], start_minutes: values[4], end_minutes: values[5],
            level: values[6], message_en: values[7], message_hi: values[8], alt_site_id: values[9], alt_minutes: values[10],
            reach_squads: values[11], reach_people: values[12], created_by: values[13], created_at: new Date('2026-11-01T06:00:00Z'), withdrawn_at: null,
          };
          advisories.push(row);
          return { rowCount: 1, rows: [row] };
        }
        if (sql.includes('FROM heritage_advisories')) {
          const [from, date, city] = values as [string, string | null, string | null];
          const found = advisories.filter(r => !r.withdrawn_at && (r.advisory_date as string) >= from && (!date || r.advisory_date === date) && (!city || r.city === city));
          return { rowCount: found.length, rows: found };
        }
        if (sql.startsWith('UPDATE heritage_advisories')) {
          const row = advisories.find(r => r.id === values[0] && !r.withdrawn_at);
          if (row) row.withdrawn_at = new Date();
          return { rowCount: row ? 1 : 0, rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    },
  };
  return { db, advisories, calls };
}

function fakeGemini(json: Gemini['json'], enabled = true): Gemini {
  return {
    enabled, imageEnabled: false,
    models: { lite: 'lite', smart: 'smart', image: 'image', tts: 'tts' },
    json,
    image: async () => { throw new Error('not used'); },
    speech: async () => { throw new Error('not used'); },
  };
}

type Options = Partial<Parameters<typeof createOpsApp>[0]>;

async function withServer(options: Options, run: (call: (method: string, path: string, body?: unknown, token?: string | null) => Promise<Response>) => Promise<void>) {
  const server = await serve(mount('/api/ops', createOpsApp({ authenticate, now: NOW, env: {}, ...options })));
  try {
    await run((method, path, body, token = 'asha') => server.request(`/api/ops${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } finally {
    await server.close();
  }
}

const advisory = {
  siteId: 'city-palace', date: TOMORROW, startMinutes: 600, endMinutes: 720, level: 'packed',
  messageEn: 'Heads up: City Palace is expected packed 10 AM–12 PM.', messageHi: 'ध्यान दें: सिटी पैलेस में भीड़ रहेगी।',
  altSiteId: 'bagore-ki-haveli', altMinutes: 570,
};

describe('the forecast', () => {
  test('needs a signed-in user', async () => {
    await withServer({}, async (call) => {
      expect((await call('GET', `/Udaipur/forecast?date=${TOMORROW}`, undefined, null)).status).toBe(401);
      expect((await call('GET', `/Udaipur/forecast?date=${TOMORROW}`, undefined, 'nobody')).status).toBe(401);
    });
  });

  test('adds the squads’ real plans to the modelled crowd and shares only aggregates', async () => {
    const rows = [
      ...planned(5, 'City Palace museum', 600),
      ...planned(2, 'Gulab Bagh garden walk', 840),
      ...planned(4, 'Lunch near City Palace', 600, { tag: 'Food' }),
      ...planned(3, 'City Palace', 600, { destination: 'Goa', name: 'Goa Gang' }),
    ];
    const { db } = fakeDb(rows);
    await withServer({ db }, async (call) => {
      const res = await call('GET', `/Udaipur/forecast?date=${TOMORROW}&sample=0`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta).toEqual({ live: true, sample: false, sampleSquads: 0 });
      const palace = body.sites.find((s: { id: string }) => s.id === 'city-palace');
      const ten = palace.hours.find((h: { hour: number }) => h.hour === 10);
      expect(ten.squads).toBe(5);
      expect(ten.people).toBe(20);
      expect(ten.uplift > 0).toBe(true);
      expect(ten.level).toBe(ten.baseline + ten.uplift);
      // Food stops and other cities' trips are not visits to Udaipur's sites
      expect(body.kpis.squads).toBe(7);
      // Two squads at the garden are hidden behind "<3"
      const garden = body.sites.find((s: { id: string }) => s.id === 'gulab-bagh');
      expect(garden.hours.find((h: { hour: number }) => h.hour === 14).squads).toBe('<3');
      expect(garden.hours.find((h: { hour: number }) => h.hour === 14).people).toBe(null);
      expect(garden.squads).toBe('<3');
      // No trip handle or name ever leaves the module
      const json = JSON.stringify(body);
      expect(json.includes('secret')).toBe(false);
      expect(json.includes('Secret Squad')).toBe(false);
      expect(json.includes('Goa')).toBe(false);
    });
  });

  test('without a database it returns the modelled baseline only', async () => {
    await withServer({}, async (call) => {
      const body = await (await call('GET', `/Udaipur/forecast?date=${TOMORROW}&sample=0`)).json();
      expect(body.meta).toEqual({ live: false, sample: false, sampleSquads: 0 });
      expect(body.kpis.squads).toBe(0);
      expect(body.hotspots).toHaveLength(0);
      for (const site of body.sites) for (const cell of site.hours) expect(cell.uplift).toBe(0);
    });
  });

  test('the demo squads fill in a city-scale picture, and OPS_SAMPLE_SQUADS=off turns them off', async () => {
    await withServer({}, async (call) => {
      const body = await (await call('GET', `/Udaipur/forecast?date=${TOMORROW}`)).json();
      expect(body.meta.sample).toBe(true);
      expect(body.meta.sampleSquads > 100).toBe(true);
      expect(body.hotspots[0].siteId).toBe('city-palace');
      expect(body.hotspots[0].label).toBe('packed');
      expect(body.hotspots[0].startMinutes).toBe(600);
      expect(body.sites[0].id).toBe('city-palace');
      expect(body.kpis.busiest.level).toBe(100);
    });
    await withServer({ env: { OPS_SAMPLE_SQUADS: 'off' } }, async (call) => {
      const off = await (await call('GET', `/Udaipur/forecast?date=${TOMORROW}`)).json();
      expect(off.meta.sample).toBe(false);
      expect(off.kpis.squads).toBe(0);
      const on = await (await call('GET', `/Udaipur/forecast?date=${TOMORROW}&sample=1`)).json();
      expect(on.meta.sample).toBe(true);
    });
  });

  test('falls back to the baseline when the planned stops can’t be read', async () => {
    const db: OpsDb = { pool: { query: async () => { throw new Error('connection lost'); } } };
    await withServer({ db }, async (call) => {
      const res = await call('GET', `/Udaipur/forecast?date=${TOMORROW}&sample=0`);
      expect(res.status).toBe(200);
      expect((await res.json()).meta.live).toBe(false);
    });
  });

  test('rejects an unknown city and a malformed date', async () => {
    await withServer({}, async (call) => {
      expect((await call('GET', `/Goa/forecast?date=${TOMORROW}`)).status).toBe(404);
      expect((await call('GET', '/Udaipur/forecast?date=tomorrow')).status).toBe(400);
    });
  });

  test('defaults to today in India', async () => {
    await withServer({}, async (call) => {
      expect((await (await call('GET', '/Udaipur/forecast?sample=0')).json()).date).toBe('2026-11-01');
    });
  });
});

describe('advisories', () => {
  test('publish, show to travellers, withdraw', async () => {
    const { db } = fakeDb(planned(6, 'City Palace museum', 630));
    await withServer({ db }, async (call) => {
      expect((await call('POST', '/advisories', advisory, null)).status).toBe(401);

      const published = await call('POST', '/advisories', { ...advisory, sample: false });
      expect(published.status).toBe(201);
      const body = await published.json();
      // 6 squads of 4 start a stop at City Palace between 10 and 12
      expect(body.reach).toEqual({ squads: 6, people: 24, includesSample: false, relief: 7, pickup: 0.3 });
      expect(body.advisory.reach).toEqual({ squads: 6, people: 24 });
      expect(body.advisory.siteName).toBe('City Palace');

      // Travellers: public, no author, no reach
      const listed = await call('GET', `/advisories?city=Udaipur&date=${TOMORROW}`, undefined, null);
      expect(listed.status).toBe(200);
      const items = (await listed.json()).items;
      expect(items).toHaveLength(1);
      expect(items[0].messageEn).toBe(advisory.messageEn);
      expect(items[0].alternative.site.name).toBe('Bagore ki Haveli');
      expect(items[0].alternative.time.time).toBe('09:30 AM');
      expect('reach' in items[0]).toBe(false);
      expect(JSON.stringify(items).includes('usr_1')).toBe(false);

      // Signing in alone doesn't show the reach; the console asks for it
      expect('reach' in (await (await call('GET', '/advisories?city=Udaipur')).json()).items[0]).toBe(false);
      const partner = (await (await call('GET', '/advisories?city=Udaipur&reach=1')).json()).items;
      expect(partner[0].reach).toEqual({ squads: 6, people: 24 });
      expect('reach' in (await (await call('GET', '/advisories?city=Udaipur&reach=1', undefined, null)).json()).items[0]).toBe(false);

      expect((await call('GET', '/advisories?city=Udaipur&date=2026-11-05', undefined, null).then(r => r.json())).items).toHaveLength(0);

      expect((await call('DELETE', `/advisories/${items[0].id}`, undefined, null)).status).toBe(401);
      expect((await call('DELETE', `/advisories/${items[0].id}`)).status).toBe(204);
      expect((await (await call('GET', '/advisories?city=Udaipur', undefined, null)).json()).items).toHaveLength(0);
      expect((await call('DELETE', `/advisories/${items[0].id}`)).status).toBe(404);
      expect((await call('DELETE', '/advisories/not-an-id')).status).toBe(404);
    });
  });

  test('small reach is hidden and the relief estimate needs a real group', async () => {
    const { db } = fakeDb(planned(2, 'City Palace museum', 630));
    await withServer({ db }, async (call) => {
      const body = await (await call('POST', '/advisories', { ...advisory, sample: false })).json();
      expect(body.reach).toEqual({ squads: '<3', people: null, includesSample: false, relief: null, pickup: 0.3 });
    });
  });

  test('reach includes the demo squads unless they are switched off, and says so', async () => {
    await withServer({}, async (call) => {
      const body = await (await call('POST', '/advisories', advisory)).json();
      expect(body.reach.includesSample).toBe(true);
      expect(body.reach.squads > 20).toBe(true);
      expect(body.reach.relief > 0).toBe(true);
    });
  });

  test('previews the reach of a window while the manager adjusts it', async () => {
    const { db } = fakeDb([...planned(4, 'City Palace museum', 600), ...planned(3, 'City Palace museum', 780)]);
    await withServer({ db }, async (call) => {
      const window = (startMinutes: number, endMinutes: number) =>
        call('POST', '/advisories/reach', { siteId: 'city-palace', date: TOMORROW, startMinutes, endMinutes, sample: false });
      expect((await call('POST', '/advisories/reach', {}, null)).status).toBe(401);
      expect(await (await window(600, 720)).json()).toEqual({ squads: 4, people: 16, includesSample: false, relief: 5, pickup: 0.3 });
      expect((await (await window(600, 840)).json()).squads).toBe(7);
      expect((await (await window(840, 900)).json()).squads).toBe(0);
      expect((await window(720, 600)).status).toBe(400);
      expect((await call('POST', '/advisories/reach', { siteId: 'nowhere', startMinutes: 600, endMinutes: 700 })).status).toBe(400);
    });
  });

  test('works without a database: advisories are kept in memory', async () => {
    await withServer({}, async (call) => {
      expect((await call('POST', '/advisories', advisory)).status).toBe(201);
      expect((await (await call('GET', '/advisories?city=Udaipur', undefined, null)).json()).items).toHaveLength(1);
    });
  });

  test('rejects bad input with a 400 and unknown cities with a 404', async () => {
    await withServer({}, async (call) => {
      for (const bad of [{ ...advisory, siteId: 'nowhere' }, { ...advisory, date: '2026-10-30' }, { ...advisory, level: 'calm' }, { ...advisory, endMinutes: 100 }, { ...advisory, messageEn: '' }]) {
        const res = await call('POST', '/advisories', bad);
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
      }
      expect((await call('GET', '/advisories?city=Goa', undefined, null)).status).toBe(404);
      expect((await call('GET', '/advisories?date=soon', undefined, null)).status).toBe(400);
    });
  });

  test('an advisory disappears once its window is over', async () => {
    let clock = new Date('2026-11-02T03:30:00Z'); // 9:00 AM on the day
    await withServer({ now: () => clock }, async (call) => {
      await call('POST', '/advisories', advisory);
      expect((await (await call('GET', '/advisories?city=Udaipur', undefined, null)).json()).items).toHaveLength(1);
      clock = new Date('2026-11-02T05:30:00Z'); // 11:00 AM: still in the window
      expect((await (await call('GET', '/advisories?city=Udaipur', undefined, null)).json()).items).toHaveLength(1);
      clock = new Date('2026-11-02T07:00:00Z'); // 12:30 PM: over
      expect((await (await call('GET', '/advisories?city=Udaipur', undefined, null)).json()).items).toHaveLength(0);
    });
  });

  test('travellers see no advisories rather than an error when the store fails', async () => {
    const db: OpsDb = { pool: { query: async () => { throw new Error('connection lost'); } } };
    await withServer({ db }, async (call) => {
      const res = await call('GET', '/advisories?city=Udaipur', undefined, null);
      expect(res.status).toBe(200);
      expect((await res.json()).items).toHaveLength(0);
    });
  });
});

describe('drafting an advisory', () => {
  test('proposes the crunch window, level and alternatives, with Gemini’s wording', async () => {
    const gemini = fakeGemini(async () => ({
      messageEn: 'Heads up: City Palace is expected packed 10 AM–12 PM. Bagore ki Haveli is calm then, or come at 9:30 AM.',
      messageHi: 'ध्यान दें: सुबह 10 से दोपहर 12 बजे तक सिटी पैलेस में बहुत भीड़ रहेगी। बागोर की हवेली शांत है।',
    }) as never);
    await withServer({ gemini }, async (call) => {
      expect((await call('POST', '/advisories/draft', { siteId: 'city-palace' }, null)).status).toBe(401);
      const res = await call('POST', '/advisories/draft', { siteId: 'city-palace', date: TOMORROW });
      expect(res.status).toBe(200);
      const { source, draft } = await res.json();
      expect(source).toBe('gemini');
      expect(draft.startMinutes).toBe(600);
      expect(draft.endMinutes).toBe(720);
      expect(draft.level).toBe('packed');
      expect(draft.calm).toBe(false);
      expect(draft.squads > 20).toBe(true);
      expect(draft.alternative.site.level < 65).toBe(true);
      expect(draft.alternative.time.time).toBe('09:30 AM');
      expect(draft.messageEn.startsWith('Heads up')).toBe(true);
    });
  });

  test('falls back to the bilingual template when Gemini is unavailable or fails', async () => {
    for (const gemini of [undefined, fakeGemini(async () => { throw new Error('quota'); })]) {
      await withServer({ gemini }, async (call) => {
        const { source, draft } = await (await call('POST', '/advisories/draft', { siteId: 'city-palace', date: TOMORROW })).json();
        expect(source).toBe('template');
        expect(draft.messageEn.startsWith('Heads up: City Palace is expected packed 10 AM–12 PM.')).toBe(true);
        expect(/[ऀ-ॿ]/.test(draft.messageHi)).toBe(true);
      });
    }
  });

  test('takes a window chosen by the manager and says when it looks calm', async () => {
    await withServer({}, async (call) => {
      const { draft } = await (await call('POST', '/advisories/draft', { siteId: 'city-palace', date: TOMORROW, startMinutes: 540, endMinutes: 570, sample: false })).json();
      expect(draft.startMinutes).toBe(540);
      expect(draft.endMinutes).toBe(570);
      expect(draft.calm).toBe(true);
      expect(draft.level).toBe('busy');
      expect(draft.squads).toBe(0);
      expect((await call('POST', '/advisories/draft', { siteId: 'city-palace', startMinutes: 700, endMinutes: 600 })).status).toBe(400);
      expect((await call('POST', '/advisories/draft', { siteId: 'atlantis' })).status).toBe(400);
    });
  });
});
