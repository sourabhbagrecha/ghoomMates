import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import type { User } from '../../src/auth/types.ts';
import type { Gemini, JsonRequest } from '../../src/gemini.ts';
import { createHospitalityApp, type StopsWriter, type TripsLookup } from '../../src/hospitality/app.ts';
import { MemoryStore } from '../../src/hospitality/store.ts';
import type { TripAccess } from '../../src/trips/service.ts';
import { mount, serve } from '../helpers.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;
const ravi = { id: 'usr_2', username: 'ravi', email: 'ravi@test.local', name: 'Ravi' } as User;
// 8 AM in India on Sunday 1 November 2026
const NOW = new Date('2026-11-01T02:30:00Z');
const HAVELI = 'kesar-pol-haveli';

const tripRow = (over: Record<string, unknown> = {}) => ({
  id: TRIP, group_name: 'Goa Gang', name: 'Udaipur', destination: 'Udaipur', start_date: '2026-10-31', end_date: '2026-11-04', details: {}, ...over,
}) as unknown as TripAccess['trip'];

type StopCall = { op: 'add' | 'update' | 'delete'; stopId?: string; input?: Record<string, unknown> };

function setup(options: { gemini?: (call: JsonRequest) => unknown; geminiOn?: boolean; trip?: Record<string, unknown>; persistent?: boolean } = {}) {
  const store = new MemoryStore(options.persistent ?? true);
  store.squads.set(TRIP, { members: 6, diets: { veg: 4, jain: 2, vegan: 0 } });
  const stopCalls: StopCall[] = [];
  const geminiCalls: JsonRequest[] = [];
  let stopSeq = 0;
  const trips: TripsLookup = {
    async access(tripId, userId) {
      if (tripId !== TRIP || userId !== asha.id) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
      return { trip: tripRow(options.trip), memberId: 'm1', role: 'organiser' };
    },
  };
  const stops: StopsWriter = {
    async addStop(_access, _userId, input) {
      const id = `00000000-0000-4000-8000-00000000000${++stopSeq}`;
      stopCalls.push({ op: 'add', stopId: id, input: input as Record<string, unknown> });
      return { id };
    },
    async updateStop(_access, stopId, input) {
      stopCalls.push({ op: 'update', stopId, input: input as Record<string, unknown> });
      return { id: stopId };
    },
    async deleteStop(_access, stopId) {
      stopCalls.push({ op: 'delete', stopId });
    },
  };
  const gemini: Gemini = {
    enabled: options.geminiOn ?? true,
    imageEnabled: false,
    models: { lite: 'lite-model', smart: 'smart-model', image: 'image-model', tts: 'tts-model' },
    async json<T>(call: JsonRequest) {
      geminiCalls.push(call);
      if (!options.gemini) throw new Error('no answer');
      return options.gemini(call) as T;
    },
    async image() { throw new Error('not used'); },
    async speech() { throw new Error('not used'); },
  };
  const authenticate = async (token: string) => {
    if (token === 'asha') return asha;
    if (token === 'ravi') return ravi;
    throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  };
  const router = createHospitalityApp({ authenticate, gemini, store, trips, stops, now: () => NOW });
  return { router, store, stopCalls, geminiCalls };
}

async function withServer(env: ReturnType<typeof setup>, run: (call: (method: string, path: string, body?: unknown, token?: string | null) => Promise<Response>) => Promise<void>) {
  const server = await serve(mount('/api/hospitality', env.router));
  try {
    await run((method, path, body, token = 'asha') => server.request(`/api/hospitality${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } finally {
    await server.close();
  }
}

const offGemini: Gemini = {
  enabled: false,
  imageEnabled: false,
  models: { lite: 'lite-model', smart: 'smart-model', image: 'image-model', tts: 'tts-model' },
  json: async () => { throw new Error('off'); },
  image: async () => { throw new Error('off'); },
  speech: async () => { throw new Error('off'); },
};

const reserve = (over: Record<string, unknown> = {}) => ({ tripId: TRIP, date: '2026-11-02', meal: 'dinner', ...over });

const validMenu = {
  title: 'Winter Feast at Kesar Pol',
  intro: 'Fresh makki and winter greens.',
  dishes: ['makki-ki-raab', 'dal-baati-churma', 'makki-roti-saag', 'kaddu-ki-sabzi', 'rajasthani-kadhi', 'lapsi'].map(id => ({ id, story: `Story of ${id}.` })),
  zeroWasteTip: 'Crumble leftover baatis into churma.',
};

describe('hosts', () => {
  test('lists the four sample hosts, greenest first, without signing in', async () => {
    await withServer(setup(), async (call) => {
      const res = await call('GET', '/hosts', undefined, null);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.month).toBe(11);
      expect(body.today).toBe('2026-11-01');
      expect(body.sample).toBe(true);
      expect(body.season.season).toBe('Makki season');
      expect(body.season.fresh.includes('Makki (maize flour)') && body.season.fresh.includes('Methi, palak & bathua')).toBe(true);
      // Greens and vegetables lead, so the first tags a traveller sees are things on the plate
      expect(body.season.fresh[0]).toBe('Methi, palak & bathua');
      expect(body.hosts.map((h: any) => h.id)).toHaveLength(4);
      const scores = body.hosts.map((h: any) => h.green.score);
      expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
      const haveli = body.hosts.find((h: any) => h.id === HAVELI);
      expect(haveli.area).toBe('Gangaur Ghat');
      expect(haveli.green.tier).toBe('Gold');
      expect(haveli.sourcing.avgKm < haveli.sourcing.wholesaleKm).toBe(true);
      expect(haveli.special.name).toBe('Makki ki raab');
      expect(haveli.special.supply.farm).toBe('Hariyali Dhani');
      expect(haveli.image.startsWith('/hospitality/hosts/')).toBe(true);
    });
  });

  test('one host: story, partner farms with what they supply this month, the thali and a directions link', async () => {
    await withServer(setup(), async (call) => {
      const res = await call('GET', `/hosts/${HAVELI}`, undefined, null);
      expect(res.status).toBe(200);
      const host = await res.json();
      expect(host.farms.length).toBe(5);
      expect(host.farms[0].km <= host.farms[1].km).toBe(true);
      const makki = host.farms.flatMap((f: any) => f.produce).find((p: any) => p.id === 'makki');
      expect(makki.status).toBe('fresh');
      expect(host.thali.dishes).toHaveLength(6);
      expect(host.thali.zeroWasteTip.length > 10).toBe(true);
      expect(host.mealOptions.map((m: any) => m.id)).toEqual(['lunch', 'dinner']);
      expect(host.directionsUrl.startsWith('https://www.google.com/maps/dir/?api=1&destination=24.58')).toBe(true);
      expect(host.green.parts).toHaveLength(4);
    });
  });

  test('an unknown host is a 404', async () => {
    await withServer(setup(), async (call) => {
      expect((await call('GET', '/hosts/nope', undefined, null)).status).toBe(404);
      expect((await call('GET', '/nowhere', undefined, null)).status).toBe(401);
      expect((await call('GET', '/nowhere')).status).toBe(404);
    });
  });
});

describe('squad reservations', () => {
  test('need a signed-in trip member', async () => {
    await withServer(setup(), async (call) => {
      expect((await call('POST', `/hosts/${HAVELI}/reservations`, reserve(), null)).status).toBe(401);
      expect((await call('POST', `/hosts/${HAVELI}/reservations`, reserve(), 'ravi')).status).toBe(404);
      expect((await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ tripId: OTHER_TRIP }))).status).toBe(404);
      expect((await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ tripId: 'x' }))).status).toBe(404);
      expect((await call('POST', '/hosts/nope/reservations', reserve())).status).toBe(404);
    });
  });

  test('book the squad: headcount and diets come from the trip, and a Food stop lands on the right day', async () => {
    const env = setup();
    await withServer(env, async (call) => {
      const res = await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.reservation.headcount).toBe(6);
      expect(body.reservation.dietary).toEqual({ veg: 4, jain: 2, vegan: 0 });
      expect(body.reservation.time).toBe('08:00 PM');
      expect(body.reservation.group).toBe('Goa Gang');
      expect(body.reservation.dateLabel).toBe('Mon, 2 Nov');
      expect(body.updated).toBe(false);
      expect(body.stop.dayNumber).toBe(3);
      expect(body.seatsLeft).toBe(34);

      expect(env.stopCalls).toHaveLength(1);
      const stop = env.stopCalls[0];
      expect(stop.op).toBe('add');
      expect(stop.input?.tag).toBe('Food');
      expect(stop.input?.title).toBe('Mewari thali at Kesar Pol Haveli');
      expect(stop.input?.dayNumber).toBe(3);
      expect(stop.input?.time).toBe('08:00 PM');
      expect(stop.input?.place).toBe('Kesar Pol Haveli, Gangaur Ghat');
      expect(String(stop.input?.notes).includes('Table for 6 (2 Jain)')).toBe(true);
      expect(body.reservation.stopId).toBe(stop.stopId);
    });
  });

  test('your own headcount, diet mix, time and a note are honoured', async () => {
    await withServer(setup(), async (call) => {
      const res = await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ headcount: 8, dietary: { jain: 1, vegan: 2 }, time: '08:30 PM', note: 'Birthday cake coming' }));
      const body = await res.json();
      expect(body.reservation.headcount).toBe(8);
      expect(body.reservation.dietary).toEqual({ veg: 5, jain: 1, vegan: 2 });
      expect(body.reservation.time).toBe('08:30 PM');
      expect(body.reservation.note).toBe('Birthday cake coming');
    });
  });

  test('booking the same slot again updates the table and its stop instead of doubling them', async () => {
    const env = setup();
    await withServer(env, async (call) => {
      await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      const again = await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ headcount: 7 }));
      expect(again.status).toBe(200);
      const body = await again.json();
      expect(body.updated).toBe(true);
      expect(body.reservation.headcount).toBe(7);
      expect(env.stopCalls.map(c => c.op)).toEqual(['add', 'update']);
      const list = await (await call('GET', `/reservations?tripId=${TRIP}`)).json();
      expect(list.items).toHaveLength(1);
      expect(list.items[0].hostName).toBe('Kesar Pol Haveli');
      expect(list.squad).toEqual({ members: 6, diets: { veg: 4, jain: 2, vegan: 0 } });
    });
  });

  test('a day outside the trip is still booked, just without an itinerary stop', async () => {
    const env = setup();
    await withServer(env, async (call) => {
      const res = await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ date: '2026-11-20' }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.stop).toBe(null);
      expect(env.stopCalls).toHaveLength(0);
    });
  });

  test('a trip with no dates yet uses the day the app picked', async () => {
    const env = setup({ trip: { start_date: null, end_date: null, details: { flexibleDays: 4 } } });
    await withServer(env, async (call) => {
      const body = await (await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ dayNumber: 2 }))).json();
      expect(body.stop.dayNumber).toBe(2);
      expect(env.stopCalls[0].input?.dayNumber).toBe(2);
    });
  });

  test('refuses bad requests with a clear 400', async () => {
    await withServer(setup(), async (call) => {
      const bad = async (over: Record<string, unknown>) => (await call('POST', `/hosts/${HAVELI}/reservations`, reserve(over))).status;
      expect(await bad({ date: '2026-10-30' })).toBe(400);
      expect(await bad({ date: '2027-06-01' })).toBe(400);
      expect(await bad({ date: 'tomorrow' })).toBe(400);
      expect(await bad({ meal: 'brunch' })).toBe(400);
      expect(await bad({ time: '03:00 AM' })).toBe(400);
      expect(await bad({ headcount: 0 })).toBe(400);
      expect(await bad({ headcount: 41 })).toBe(400);
      expect(await bad({ headcount: 4, dietary: { jain: 3, vegan: 3 } })).toBe(400);
      expect(await bad({ dietary: { jain: -1 } })).toBe(400);
      expect(await bad({ note: 'x'.repeat(300) })).toBe(400);
      const plain = await call('POST', `/hosts/${HAVELI}/reservations`, 'not json');
      expect(plain.status).toBe(400);
    });
  });

  test('a full house is a 409 with the seats left', async () => {
    const env = setup();
    await env.store.saveBooking({ hostId: HAVELI, tripId: OTHER_TRIP, group: 'Another Gang', userId: ravi.id, date: '2026-11-02', meal: 'dinner', time: '08:00 PM', headcount: 36, dietary: { veg: 36, jain: 0, vegan: 0 }, note: '' });
    await withServer(env, async (call) => {
      const res = await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('FULLY_BOOKED');
      expect(body.error.message.includes('Only 4 seats left')).toBe(true);
      // Lunch is still free
      expect((await call('POST', `/hosts/${HAVELI}/reservations`, reserve({ meal: 'lunch' }))).status).toBe(201);
    });
  });

  test('without the trips database the tables are a clear 503, while hosts still load', async () => {
    const env = setup({ persistent: false });
    await withServer(env, async (call) => {
      const res = await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      expect(res.status).toBe(503);
      expect((await call('GET', '/hosts', undefined, null)).status).toBe(200);
    });
  });

  test('cancelling removes the table and its stop; only the squad can cancel', async () => {
    const env = setup();
    await withServer(env, async (call) => {
      const made = await (await call('POST', `/hosts/${HAVELI}/reservations`, reserve())).json();
      const id = made.reservation.id as string;
      expect((await call('DELETE', `/reservations/${id}`, undefined, 'ravi')).status).toBe(404);
      expect((await call('DELETE', `/reservations/${id}`, undefined, null)).status).toBe(401);
      expect((await call('DELETE', '/reservations/not-a-uuid')).status).toBe(404);
      const gone = await call('DELETE', `/reservations/${id}`);
      expect(gone.status).toBe(204);
      expect(env.stopCalls.at(-1)).toEqual({ op: 'delete', stopId: made.stop.id });
      expect((await (await call('GET', `/reservations?tripId=${TRIP}`)).json()).items).toHaveLength(0);
      expect((await call('DELETE', `/reservations/${id}`)).status).toBe(404);
    });
  });
});

describe('the host’s forecast', () => {
  test('needs a signed-in user and a known host', async () => {
    await withServer(setup(), async (call) => {
      expect((await call('GET', `/hosts/${HAVELI}/forecast`, undefined, null)).status).toBe(401);
      expect((await call('GET', '/hosts/nope/forecast')).status).toBe(404);
      expect((await call('GET', `/hosts/${HAVELI}/forecast?days=99`)).status).toBe(400);
    });
  });

  test('a seven-day window from today with the baseline, the menu, the shopping list and the impact', async () => {
    await withServer(setup(), async (call) => {
      const f = await (await call('GET', `/hosts/${HAVELI}/forecast`)).json();
      expect(f.from).toBe('2026-11-01');
      expect(f.to).toBe('2026-11-07');
      expect(f.days).toHaveLength(7);
      expect(f.days[0].label).toBe('Sun, 1 Nov');
      expect(f.days.every((d: any) => d.booked === 0 && d.walkIn > 0 && d.covers === d.walkIn)).toBe(true);
      expect(f.totals.squads).toBe(0);
      expect(f.menu.dishes).toHaveLength(6);
      expect(f.procurement.farms.length >= 4).toBe(true);
      expect(f.procurement.localShare > 0.8).toBe(true);
      expect(f.foodMiles.savedPercent > 60).toBe(true);
      expect(f.waste.avoidedKg > 0).toBe(true);
      expect(f.waste.avoidedKg).toBe(Math.round((f.waste.overproductionKg + f.waste.spoilageKg) * 10) / 10);
      expect(f.green.score > 80).toBe(true);
    });
  });

  test('the demo: a squad of six reserves, and tomorrow’s covers jump by six with two Jain diets and a bigger farm order', async () => {
    await withServer(setup(), async (call) => {
      const before = await (await call('GET', `/hosts/${HAVELI}/forecast`)).json();
      await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      const after = await (await call('GET', `/hosts/${HAVELI}/forecast`)).json();

      const tomorrow = (f: any) => f.days.find((d: any) => d.date === '2026-11-02');
      expect(tomorrow(after).covers - tomorrow(before).covers).toBe(6);
      expect(tomorrow(after).booked).toBe(6);
      expect(tomorrow(after).diets.booked).toEqual({ veg: 4, jain: 2, vegan: 0 });
      const booking = tomorrow(after).meals.dinner.bookings[0];
      expect(booking.group).toBe('Goa Gang');
      expect(booking.headcount).toBe(6);
      expect(after.totals.squads).toBe(1);
      expect(after.totals.diets.jain).toBe(tomorrow(after).diets.total.jain + after.days.filter((d: any) => d.date !== '2026-11-02').reduce((s: number, d: any) => s + d.diets.total.jain, 0));

      const kg = (f: any, village: string, ingredient: string) => f.procurement.farms.find((o: any) => o.village === village).items.find((i: any) => i.ingredientId === ingredient);
      expect(kg(after, 'Badgaon', 'makki').kg > kg(before, 'Badgaon', 'makki').kg).toBe(true);
      expect(kg(after, 'Badgaon', 'makki').squadKg > 0).toBe(true);
      expect(after.waste.overproductionKg > 0 && before.waste.overproductionKg === 0).toBe(true);
    });
  });

  test('each farm’s order carries a WhatsApp link that only pre-fills a message', async () => {
    await withServer(setup(), async (call) => {
      await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      const f = await (await call('GET', `/hosts/${HAVELI}/forecast`)).json();
      const badgaon = f.procurement.farms.find((o: any) => o.village === 'Badgaon');
      expect(badgaon.whatsapp.url.startsWith('https://wa.me/?text=')).toBe(true);
      expect(badgaon.whatsapp.text.includes('Hariyali Dhani')).toBe(true);
      expect(badgaon.whatsapp.text.includes('Makki (maize flour):')).toBe(true);
      expect(badgaon.whatsapp.text.includes('Mon, 2 Nov')).toBe(false);
      expect(badgaon.whatsapp.text.includes('Sun, 1 Nov to Sat, 7 Nov')).toBe(true);
      expect(badgaon.whatsapp.text.includes('including 6 from squads')).toBe(true);
    });
  });

  test('the number of days can be changed', async () => {
    await withServer(setup(), async (call) => {
      expect((await (await call('GET', `/hosts/${HAVELI}/forecast?days=3`)).json()).days).toHaveLength(3);
    });
  });
});

describe('leftovers', () => {
  test('logging today’s leftovers shows up in the trend and the Green Host data', async () => {
    await withServer(setup(), async (call) => {
      const before = await (await call('GET', `/hosts/${HAVELI}/waste`)).json();
      expect(before.days).toHaveLength(7);
      expect(before.days.every((d: any) => d.source === 'estimate')).toBe(true);
      expect(before.summary.loggedDays).toBe(0);
      expect(before.summary.avgPerCoverKg).toBe(null);

      const res = await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 2.5, covers: 50 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.log).toEqual({ hostId: HAVELI, date: '2026-11-01', leftoverKg: 2.5, covers: 50, note: '' });
      const today = body.days.at(-1);
      expect(today.date).toBe('2026-11-01');
      expect(today.source).toBe('logged');
      expect(today.perCoverKg).toBe(0.05);
      expect(body.summary.loggedDays).toBe(1);
      expect(body.summary.avgPerCoverKg).toBe(0.05);
      expect(body.summary.savedVsBufferKg > 0).toBe(true);
    });
  });

  test('logging a day twice replaces it, covers default to the forecast, and other days can be filled in', async () => {
    await withServer(setup(), async (call) => {
      await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 4 });
      const second = await (await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 1.5 })).json();
      expect(second.days.filter((d: any) => d.source === 'logged')).toHaveLength(1);
      expect(second.days.at(-1).leftoverKg).toBe(1.5);
      expect(second.days.at(-1).covers > 20).toBe(true);
      const yesterday = await (await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 3, date: '2026-10-31', covers: 44, note: 'Diwali prep' })).json();
      expect(yesterday.days.filter((d: any) => d.source === 'logged').map((d: any) => d.date)).toEqual(['2026-10-31', '2026-11-01']);
    });
  });

  test('rejects nonsense and the future', async () => {
    await withServer(setup(), async (call) => {
      const post = async (body: unknown) => (await call('POST', `/hosts/${HAVELI}/waste`, body)).status;
      expect(await post({ leftoverKg: -1 })).toBe(400);
      expect(await post({ leftoverKg: 'lots' })).toBe(400);
      expect(await post({ leftoverKg: 900 })).toBe(400);
      expect(await post({})).toBe(400);
      expect(await post({ leftoverKg: 2, date: '2026-11-05' })).toBe(400);
      expect(await post({ leftoverKg: 2, date: '2026-09-01' })).toBe(400);
      expect(await post({ leftoverKg: 2, covers: 1.5 })).toBe(400);
      expect((await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 2 }, null)).status).toBe(401);
    });
  });

  test('works without a database (kept in memory)', async () => {
    await withServer(setup({ persistent: false }), async (call) => {
      expect((await call('POST', `/hosts/${HAVELI}/waste`, { leftoverKg: 2 })).status).toBe(200);
      expect((await (await call('GET', `/hosts/${HAVELI}/waste?days=14`)).json()).days).toHaveLength(14);
    });
  });
});

describe('the Gemini menu', () => {
  test('is composed from the forecast’s covers and diets by default, for tomorrow', async () => {
    const env = setup({ gemini: () => validMenu });
    await withServer(env, async (call) => {
      await call('POST', `/hosts/${HAVELI}/reservations`, reserve());
      const res = await call('POST', '/menu', { hostId: HAVELI });
      expect(res.status).toBe(200);
      const menu = await res.json();
      expect(menu.source).toBe('gemini');
      expect(menu.model).toBe('smart-model');
      expect(menu.date).toBe('2026-11-02');
      expect(menu.covers >= 6).toBe(true);
      expect(menu.dietary.jain >= 2).toBe(true);
      expect(menu.dishes).toHaveLength(6);
      expect(Boolean(menu.dishes[0].ingredients[0].farm)).toBe(true);
      expect(menu.zeroWasteTip).toBe('Crumble leftover baatis into churma.');
      expect(env.geminiCalls[0].prompt.toString().includes('Kesar Pol Haveli')).toBe(true);
    });
  });

  test('takes covers and a diet mix from the host, and repeats are served from memory', async () => {
    const env = setup({ gemini: () => validMenu });
    await withServer(env, async (call) => {
      const body = { hostId: HAVELI, date: '2026-11-03', covers: 25, dietary: { jain: 3, vegan: 1 } };
      const first = await (await call('POST', '/menu', body)).json();
      expect(first.covers).toBe(25);
      expect(first.dietary).toEqual({ veg: 21, jain: 3, vegan: 1 });
      await call('POST', '/menu', body);
      expect(env.geminiCalls).toHaveLength(1);
    });
  });

  test('falls back to the curated menu when Gemini fails or is off, quietly', async () => {
    await withServer(setup(), async (call) => {
      const menu = await (await call('POST', '/menu', { hostId: HAVELI })).json();
      expect(menu.source).toBe('curated');
      expect(menu.dishes).toHaveLength(6);
    });
    await withServer(setup({ geminiOn: false, gemini: () => validMenu }), async (call) => {
      expect((await (await call('POST', '/menu', { hostId: HAVELI })).json()).source).toBe('curated');
    });
  });

  test('validates the request', async () => {
    await withServer(setup({ gemini: () => validMenu }), async (call) => {
      expect((await call('POST', '/menu', {}, null)).status).toBe(401);
      expect((await call('POST', '/menu', {})).status).toBe(404);
      expect((await call('POST', '/menu', { hostId: 'nope' })).status).toBe(404);
      expect((await call('POST', '/menu', { hostId: HAVELI, date: '2026-10-01' })).status).toBe(400);
      expect((await call('POST', '/menu', { hostId: HAVELI, covers: 0 })).status).toBe(400);
      expect((await call('POST', '/menu', { hostId: HAVELI, covers: 4000 })).status).toBe(400);
    });
  });

  test('slows down someone asking for menu after menu', async () => {
    await withServer(setup({ gemini: () => validMenu }), async (call) => {
      const statuses: number[] = [];
      for (let covers = 10; covers < 24; covers++) statuses.push((await call('POST', '/menu', { hostId: HAVELI, covers })).status);
      expect(statuses.slice(0, 10).every(s => s === 200)).toBe(true);
      expect(statuses.slice(10).every(s => s === 429)).toBe(true);
    });
  });
});

describe('without a database at all', () => {
  test('hosts, forecasts and menus work from the curated data alone', async () => {
    const router = createHospitalityApp({
      authenticate: async () => asha,
      gemini: offGemini,
      now: () => NOW,
    });
    const server = await serve(mount('/api/hospitality', router));
    try {
      const auth = { authorization: 'Bearer asha', 'content-type': 'application/json' };
      expect((await server.request('/api/hospitality/hosts')).status).toBe(200);
      const forecast = await server.request(`/api/hospitality/hosts/${HAVELI}/forecast`, { headers: auth });
      expect(forecast.status).toBe(200);
      expect((await forecast.json()).days).toHaveLength(7);
      const menu = await server.request('/api/hospitality/menu', { method: 'POST', headers: auth, body: JSON.stringify({ hostId: HAVELI }) });
      expect((await menu.json()).source).toBe('curated');
      const booking = await server.request(`/api/hospitality/hosts/${HAVELI}/reservations`, { method: 'POST', headers: auth, body: JSON.stringify(reserve()) });
      expect(booking.status).toBe(503);
    } finally {
      await server.close();
    }
  });
});
