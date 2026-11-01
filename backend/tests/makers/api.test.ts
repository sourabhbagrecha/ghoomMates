import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { createMakersApp } from '../../src/makers/app.ts';
import { mount, serve } from '../helpers.ts';
import { asha, authenticate, expectFields, fakeGemini, fakeTrips, MemoryStore, TOKEN, TRIP_ID, type FakeTripOptions } from './fakes.ts';

// Sun 1 Nov 2026, 11:30 AM IST
const NOW = () => new Date('2026-11-01T06:00:00Z');

type Setup = { gemini?: ReturnType<typeof fakeGemini>; booking?: boolean; trip?: FakeTripOptions };

async function withApi(setup: Setup, run: (api: Api, fakes: { store: MemoryStore; stops: ReturnType<typeof fakeTrips>['stops'] }) => Promise<void>) {
  const store = new MemoryStore();
  const { trips, stops } = fakeTrips(setup.trip);
  const booking = setup.booking ?? true;
  const router = createMakersApp({ gemini: setup.gemini, authenticate, now: NOW, ...(booking ? { store, trips } : {}) });
  const server = await serve(mount('/api/makers', router));
  const call: Api = async (path, init = {}) => {
    const { body, token, method } = init;
    const res = await server.request(`/api/makers${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() as any };
  };
  try {
    await run(call, { store, stops });
  } finally {
    await server.close();
  }
}

type Api = (path: string, init?: { body?: unknown; token?: string; method?: string }) => Promise<{ status: number; data: any }>;

describe('browsing', () => {
  test('lists every maker, or one craft, or those near a heritage site nearest first', async () => {
    await withApi({}, async (api) => {
      const all = await api('/');
      expect(all.status).toBe(200);
      expect(all.data.items).toHaveLength(16);
      expect(all.data.near).toBe(null);

      const miniature = await api('/?craft=miniature');
      expect(miniature.data.items.map((m: { id: string }) => m.id).sort()).toEqual(['dwarkesh-bhatt', 'kavita-sharma', 'lalit-vyas', 'mahendra-chitera']);
      expect(miniature.data.craft).toEqual({ id: 'miniature', name: 'Mewar miniature painting' });

      const near = await api('/?near=city-palace');
      expect(near.data.near.name).toBe('City Palace');
      expect(near.data.items[0].id).toBe('mahendra-chitera');
      expect(near.data.items[0].fromSite.minutes).toBe(6);
      expect(near.data.items[0].fromSite.mode).toBe('walk');

      const close = await api('/?near=city-palace&maxKm=1.5');
      expect(close.data.items.every((m: { fromSite: { km: number } }) => m.fromSite.km <= 1.5)).toBe(true);
    });
  });

  test('rejects an unknown craft, site or radius', async () => {
    await withApi({}, async (api) => {
      expect((await api('/?craft=pottery')).status).toBe(400);
      expect((await api('/?near=taj-mahal')).status).toBe(400);
      expect((await api('/?maxKm=-2')).status).toBe(400);
      expect((await api('/?maxKm=abc')).status).toBe(400);
    });
  });

  test('crafts come with their maker counts, GI tags and price guides', async () => {
    await withApi({}, async (api) => {
      const { status, data } = await api('/crafts');
      expect(status).toBe(200);
      expect(data.items).toHaveLength(14);
      const pichwai = data.items.find((c: { id: string }) => c.id === 'pichwai');
      expect(pichwai.makerCount).toBe(1);
      expect(pichwai.gi.name).toBe('Nathdwara Pichhwai Painting');
      expect(pichwai.prices).toHaveLength(3);
      expect(data.items.find((c: { id: string }) => c.id === 'miniature').makerCount).toBe(4);
    });
  });

  test('a maker comes with the story, the workshop, the craft explainer and the closed days', async () => {
    await withApi({}, async (api) => {
      const { status, data } = await api('/mahendra-chitera?near=city-palace');
      expect(status).toBe(200);
      const maker = data.maker;
      expect(maker.name).toBe('Mahendra Chitera');
      expect(maker.generation).toBe(4);
      expect(maker.story.length > 100).toBe(true);
      expect(maker.workshop.weekly[0].times).toEqual(['10:30 AM', '12:30 PM', '04:00 PM']);
      expect(maker.craftDetails[0].steps.length >= 4).toBe(true);
      expect(maker.fromSite.minutes).toBe(6);
      expect(maker.closedDates[0].date).toBe('2026-11-08');
      expect(maker.questions.length > 0).toBe(true);
      expect((await api('/nobody')).status).toBe(404);
      expect((await api('/mahendra-chitera?near=nowhere')).status).toBe(400);
      expect((await api('/mahendra-chitera/unknown')).status).toBe(404);
    });
  });
});

describe('price check', () => {
  test('calls the ₹2,500 antique miniature a tourist price and suggests a counter', async () => {
    await withApi({}, async (api) => {
      const { status, data } = await api('/price-check', { body: { craftId: 'miniature', size: 'medium', quoted: 2500, antique: true } });
      expect(status).toBe(200);
      expect(data.verdict).toBe('tourist-price');
      expect(data.fair).toEqual({ min: 800, max: 1800 });
      expect(data.counter).toBe(1200);
      expect(data.walkAway).toBe(1800);
      expect(data.antiqueNote.includes('1972')).toBe(true);
    });
  });

  test('works without a database or sign-in, and checks its input', async () => {
    await withApi({ booking: false }, async (api) => {
      expect((await api('/price-check', { body: { craftId: 'dabu', size: 'medium', quoted: 900 } })).data.verdict).toBe('fair');
      expect((await api('/price-check', { body: { craftId: 'nope', size: 'medium', quoted: 900 } })).status).toBe(400);
      expect((await api('/price-check', { body: { craftId: 'dabu', size: 'giant', quoted: 900 } })).status).toBe(400);
      expect((await api('/price-check', { body: { craftId: 'dabu', size: 'small', quoted: 0 } })).status).toBe(400);
      expect((await api('/price-check', { body: { craftId: 'dabu', size: 'small', quoted: 12.5 } })).status).toBe(400);
      expect((await api('/price-check', { body: { craftId: 'dabu', size: 'small' } })).status).toBe(400);
    });
  });
});

describe('asking a maker', () => {
  const ask = (api: Api, question: unknown, id = 'mahendra-chitera') => api(`/${id}/ask`, { body: { question } });

  test('uses Gemini’s answer when it is grounded, and gives it only this maker’s facts', async () => {
    let prompt = '';
    const gemini = fakeGemini((request) => {
      prompt = String(request.prompt);
      return { answer: 'Yes, from age eight. Mahendra loves teaching kids.', grounded: true };
    });
    await withApi({ gemini }, async (api) => {
      const { status, data } = await ask(api, 'Can my kids come?');
      expect(status).toBe(200);
      expect(data).toEqual({ answer: 'Yes, from age eight. Mahendra loves teaching kids.', source: 'gemini', matched: null });
      expect(prompt.includes('Mahendra Chitera')).toBe(true);
      expect(prompt.includes('Can my kids come?')).toBe(true);
      expect(prompt.includes('Rafiq')).toBe(false);
    });
  });

  test('falls back to the best curated answer when Gemini is unsure, fails, or is off', async () => {
    const unsure = fakeGemini(() => ({ answer: 'I am not sure.', grounded: false }));
    const broken = fakeGemini(() => { throw new Error('Gemini 500'); });
    const garbage = fakeGemini(() => ({ nope: true }));
    const off = fakeGemini(() => ({ answer: 'x', grounded: true }), false);
    for (const gemini of [unsure, broken, garbage, off, undefined]) {
      await withApi({ gemini }, async (api) => {
        const { status, data } = await ask(api, 'Is it okay for kids?');
        expect(status).toBe(200);
        expect(data.source).toBe('faq');
        expect(data.matched).toBe('Can children join?');
        expect(data.answer).toBe('Yes, from age 8.');
      });
    }
    expect(off.calls).toBe(0);
  });

  test('admits when it has nothing, and points to the workshop', async () => {
    await withApi({}, async (api) => {
      const { data } = await ask(api, 'does the studio have wifi');
      expect(data.source).toBe('faq');
      expect(data.matched).toBe(null);
      expect(data.answer.includes('Mahendra')).toBe(true);
    });
  });

  test('checks the question, the maker and how often you ask', async () => {
    await withApi({}, async (api) => {
      expect((await ask(api, '')).status).toBe(400);
      expect((await ask(api, 'x'.repeat(301))).status).toBe(400);
      expect((await ask(api, 'hello', 'nobody')).status).toBe(404);
      // 20 questions a minute, then a polite stop (the failed requests above never counted)
      for (let i = 0; i < 20; i++) expect((await ask(api, 'How long is it?')).status).toBe(200);
      const tooMany = await ask(api, 'How long is it?');
      expect(tooMany.status).toBe(429);
      expect(tooMany.data.error.code).toBe('RATE_LIMITED');
    });
  });
});

describe('slots', () => {
  test('shows the sessions on a date, and works without a database', async () => {
    await withApi({ booking: false }, async (api) => {
      const { status, data } = await api('/mahendra-chitera/slots?date=2026-11-12');
      expect(status).toBe(200);
      expect(data.open).toBe(true);
      expect(data.slots.map((s: { time: string }) => s.time)).toEqual(['10:30 AM', '12:30 PM', '04:00 PM']);
      expect((await api('/mahendra-chitera/slots?date=2026-11-15')).data.closedReason).toBe('Closed on Sundays');
      expect((await api('/mahendra-chitera/slots?date=soon')).status).toBe(400);
      expect((await api('/mahendra-chitera/slots')).status).toBe(400);
    });
  });
});

describe('booking a workshop for the squad', () => {
  const booking = { tripId: TRIP_ID, date: '2026-11-12', slot: '10:30 AM', people: 6 };
  const book = (api: Api, body: unknown, token = TOKEN, id = 'mahendra-chitera') => api(`/${id}/bookings`, { body, token });

  test('needs a signed-in user, and a database', async () => {
    await withApi({}, async (api) => {
      expect((await book(api, booking, '')).status).toBe(401);
      expect((await book(api, booking, 'wrong')).status).toBe(401);
      expect((await api(`/bookings?tripId=${TRIP_ID}`)).status).toBe(401);
    });
    await withApi({ booking: false }, async (api) => {
      const res = await book(api, booking);
      expect(res.status).toBe(503);
      expect(res.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  test('books all six of us, adds the stop to the right day, and the booking shows up for the trip', async () => {
    await withApi({}, async (api, { stops }) => {
      const { status, data } = await book(api, booking);
      expect(status).toBe(201);
      expectFields(data, {
        makerId: 'mahendra-chitera', makerName: 'Mahendra Chitera', date: '2026-11-12', slot: '10:30 AM', people: 6,
        pricePerPerson: 750, total: 4500, status: 'confirmed', dayNumber: 3, stopId: 'stop-1',
      });
      expect(data.stop).toEqual({ id: 'stop-1', dayNumber: 3, time: '10:30 AM' });

      // The itinerary stop went through the trips module's own insert
      expect(stops).toHaveLength(1);
      expect(stops[0].userId).toBe(asha.id);
      expectFields(stops[0].input, {
        dayNumber: 3, time: '10:30 AM', tag: 'Culture', title: 'Paint your own Mewar miniature with Mahendra',
        place: 'Chitera Kala Niwas, Jagdish Chowk lane',
      });
      expect(String(stops[0].input.notes).includes('₹4,500')).toBe(true);
      expect(String(stops[0].input.notes).includes('Pay Mahendra directly')).toBe(true);
      expect(String(stops[0].input.notes).includes('You take away your own hand-painted miniature')).toBe(true);

      const list = await api(`/bookings?tripId=${TRIP_ID}`, { token: TOKEN });
      expect(list.status).toBe(200);
      expect(list.data.items).toHaveLength(1);
      expectFields(list.data.items[0], { makerName: 'Mahendra Chitera', studio: 'Chitera Kala Niwas', stopId: 'stop-1', total: 4500, craftId: 'miniature', cover: '/makers/miniature.jpg' });
      expect(list.data.items[0].lat > 24).toBe(true);

      // Six of the eight places in that session are taken
      const slots = await api('/mahendra-chitera/slots?date=2026-11-12');
      expect(slots.data.slots[0]).toEqual({ time: '10:30 AM', spotsLeft: 2, available: true, reason: null });
    });
  });

  test('a note and a lowercase time are accepted', async () => {
    await withApi({}, async (api, { stops }) => {
      const { status } = await book(api, { ...booking, slot: '12:30 pm', people: 4, note: 'Two of us are vegetarian' });
      expect(status).toBe(201);
      expect(stops[0].input.time).toBe('12:30 PM');
      expect(String(stops[0].input.notes).includes('Two of us are vegetarian')).toBe(true);
    });
  });

  test('refuses a second booking of the same session, a full session and a session that is closed', async () => {
    // A long trip, so a Sunday and Diwali fall inside it
    await withApi({ trip: { startDate: '2026-11-06', endDate: '2026-11-16' } }, async (api, { store }) => {
      expect((await book(api, booking)).status).toBe(201);
      const twice = await book(api, booking);
      expect(twice.status).toBe(409);
      expect(twice.data.error.code).toBe('ALREADY_BOOKED');

      // Another squad has 5 of the 8 places in the 12:30 session, so six don't fit
      store.others.set('mahendra-chitera|2026-11-12|12:30 PM', 5);
      const full = await book(api, { ...booking, slot: '12:30 PM' });
      expect(full.status).toBe(409);
      expect(full.data.error.code).toBe('SLOT_UNAVAILABLE');
      expect(full.data.error.message.includes('3 spots')).toBe(true);
      expect((await book(api, { ...booking, slot: '12:30 PM', people: 3 })).status).toBe(201);

      const sunday = await book(api, { ...booking, date: '2026-11-15' });
      expect(sunday.status).toBe(409);
      expect(sunday.data.error.message.includes('Closed on Sundays')).toBe(true);
      expect((await book(api, { ...booking, date: '2026-11-08' })).data.error.message.includes('Diwali')).toBe(true);
      // A time he doesn't run
      expect((await book(api, { ...booking, slot: '09:00 AM' })).status).toBe(409);
    });
  });

  test('checks the group size, the date and the trip', async () => {
    await withApi({}, async (api) => {
      expect((await book(api, { ...booking, people: 1 })).status).toBe(400);
      expect((await book(api, { ...booking, people: 9 })).status).toBe(400);
      expect((await book(api, { ...booking, people: 'six' })).status).toBe(400);
      expect((await book(api, { ...booking, date: 'tomorrow' })).status).toBe(400);
      expect((await book(api, { ...booking, slot: 'morning' })).status).toBe(400);
      expect((await book(api, { ...booking, tripId: 'abc' })).status).toBe(400);
      expect((await book(api, { ...booking, note: 'x'.repeat(201) })).status).toBe(400);
      const outside = await book(api, { ...booking, date: '2026-11-16' });
      expect(outside.status).toBe(400);
      expect(outside.data.error.code).toBe('DATE_OUTSIDE_TRIP');
      // Not your trip: a 404, like the trips module
      const stranger = await book(api, { ...booking, tripId: '22222222-2222-4222-8222-222222222222' });
      expect(stranger.status).toBe(404);
      expect((await api('/nobody/bookings', { body: booking, token: TOKEN })).status).toBe(404);
      expect((await api('/bookings?tripId=22222222-2222-4222-8222-222222222222', { token: TOKEN })).status).toBe(404);
      expect((await api('/bookings', { token: TOKEN })).status).toBe(400);
    });
  });

  test('a trip without dates takes the day the squad picks', async () => {
    await withApi({ trip: { startDate: null, endDate: null } }, async (api, { stops }) => {
      expect((await book(api, { ...booking, dayNumber: 2 })).status).toBe(201);
      expect(stops[0].input.dayNumber).toBe(2);
    });
  });

  test('no itinerary stop, no booking: the session is released if the stop can’t be added', async () => {
    await withApi({ trip: { failAddStop: true } }, async (api, { store }) => {
      const res = await book(api, booking);
      expect(res.status).toBe(500);
      expect(store.records[0].status).toBe('cancelled');
      expect((await api(`/bookings?tripId=${TRIP_ID}`, { token: TOKEN })).data.items).toHaveLength(0);
      expect((await api('/mahendra-chitera/slots?date=2026-11-12')).data.slots[0].spotsLeft).toBe(8);
    });
  });
});
