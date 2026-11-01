import { describe, test } from 'node:test';
import { Router } from 'express';
import { expect } from '../expect.ts';
import { createServer } from '../../src/app.ts';
import { createEventsApp } from '../../src/events/app.ts';
import { mount, serve } from '../helpers.ts';
import { authenticate, fakeTrips, TOKEN, TRIP_ID, type FakeTripOptions } from './fakes.ts';

// Sun 1 Nov 2026, 11:30 AM IST
const NOW = () => new Date('2026-11-01T06:00:00Z');

type Api = (path: string, init?: { body?: unknown; token?: string; method?: string }) => Promise<{ status: number; data: any }>;

async function withApi(setup: { trips?: boolean; trip?: FakeTripOptions }, run: (api: Api, stops: ReturnType<typeof fakeTrips>['stops']) => Promise<void>) {
  const { trips, stops } = fakeTrips(setup.trip);
  const router = createEventsApp({ authenticate, now: NOW, ...(setup.trips === false ? {} : { trips }) });
  const server = await serve(mount('/api/events', router));
  const call: Api = async (path, init = {}) => {
    const { body, token, method } = init;
    const res = await server.request(`/api/events${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() as any };
  };
  try {
    await run(call, stops);
  } finally {
    await server.close();
  }
}

describe('listing events', () => {
  test('is public and needs no database: this week in Mewar, the nightly shows and the fair with no dates', async () => {
    await withApi({ trips: false }, async (api) => {
      const { status, data } = await api('/?from=2026-11-01&to=2026-11-14');
      expect(status).toBe(200);
      expect(data.city).toBe('Udaipur');
      expect(data.today).toBe('2026-11-01');
      expect(data.items.map((i: { id: string }) => i.id)).toEqual(['diwali', 'annakut-nathdwara']);
      expect(data.recurring.map((r: { id: string }) => r.id)).toEqual(['dharohar-show', 'puppet-show']);
      expect(data.undated.map((u: { id: string }) => u.id)).toEqual(['shilpgram-utsav']);
      const diwali = data.items[0];
      expect(diwali.crowd.label).toBe('packed');
      expect(diwali.crowd.sites[0].windowLabel.length > 0).toBe(true);
      expect(diwali.name).toBe('Diwali');
      expect(diwali.nameHi).toBe('दीपावली');
    });
  });

  test('defaults to today and the next four months, and takes today from the clock in India', async () => {
    await withApi({}, async (api) => {
      const { data } = await api('/');
      expect(data.from).toBe('2026-11-01');
      expect(data.to).toBe('2027-03-01');
      expect(data.items.map((i: { id: string }) => i.id)).toEqual(['diwali', 'annakut-nathdwara', 'kartik-purnima', 'year-end-peak', 'makar-sankranti']);
    });
  });

  test('checks the dates and the city', async () => {
    await withApi({}, async (api) => {
      expect((await api('/?from=soon')).status).toBe(400);
      expect((await api('/?to=2026-02-31')).status).toBe(400);
      expect((await api('/?from=2026-11-10&to=2026-11-01')).status).toBe(400);
      expect((await api('/?from=2026-01-01&to=2029-01-01')).status).toBe(400);
      expect((await api('/?city=Goa')).status).toBe(404);
      expect((await api('/?city=Udaipur, Rajasthan')).status).toBe(200);
      expect((await api('/unknown')).status).toBe(404);
    });
  });
});

describe('adding an event to the squad’s plan', () => {
  const add = (api: Api, id: string, body: unknown, token = TOKEN) => api(`/${id}/stops`, { body, token });
  const dharohar = { tripId: TRIP_ID, date: '2026-11-08' };

  test('needs a signed-in user, and a database', async () => {
    await withApi({}, async (api) => {
      expect((await add(api, 'dharohar-show', dharohar, '')).status).toBe(401);
      expect((await add(api, 'dharohar-show', dharohar, 'wrong')).status).toBe(401);
    });
    await withApi({ trips: false }, async (api) => {
      const res = await add(api, 'dharohar-show', dharohar);
      expect(res.status).toBe(503);
      expect(res.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  test('puts the Dharohar show on Day 2 through the trips module’s own insert, with its time, place and advice', async () => {
    await withApi({}, async (api, stops) => {
      const { status, data } = await add(api, 'dharohar-show', dharohar);
      expect(status).toBe(201);
      expect(data.stop).toEqual({ id: 'stop-1', dayNumber: 2, date: '2026-11-08', time: '07:00 PM', title: 'Dharohar folk dance show', place: 'Bagore ki Haveli, Gangaur Ghat' });
      expect(data.event).toEqual({ id: 'dharohar-show', name: 'Dharohar folk dance show' });
      expect(stops).toHaveLength(1);
      expect(stops[0].userId).toBe('usr_asha');
      expect(stops[0].input.dayNumber).toBe(2);
      expect(stops[0].input.tag).toBe('Culture');
      expect(String(stops[0].input.notes).includes('send one of the squad ahead to queue')).toBe(true);
      // The crowd model's heads-up comes back with it: Diwali evening at the haveli
      expect(data.crowd.siteName).toBe('Bagore ki Haveli');
      expect(data.crowd.label).toBe('packed');
      expect(data.crowd.dayNote).toBe('Busier than usual: it’s Diwali');
    });
  });

  test('takes a time of the squad’s choosing and tidies it', async () => {
    await withApi({}, async (api, stops) => {
      const { status, data } = await add(api, 'diwali', { tripId: TRIP_ID, date: '2026-11-08', time: '5:00 pm' });
      expect(status).toBe(201);
      expect(data.stop.time).toBe('05:00 PM');
      expect(stops[0].input.title).toBe('Diwali evening in the old city');
      expect((await add(api, 'puppet-show', { ...dharohar, time: 'evening' })).status).toBe(400);
      expect((await add(api, 'puppet-show', { ...dharohar, time: '13:00 PM' })).status).toBe(400);
    });
  });

  test('refuses a day outside the trip, a day the event is not on, and a second copy on the same day', async () => {
    await withApi({}, async (api) => {
      const outside = await add(api, 'dharohar-show', { tripId: TRIP_ID, date: '2026-11-12' });
      expect(outside.status).toBe(400);
      expect(outside.data.error.code).toBe('DATE_OUTSIDE_TRIP');

      const notOn = await add(api, 'diwali', { tripId: TRIP_ID, date: '2026-11-09' });
      expect(notOn.status).toBe(400);
      expect(notOn.data.error.code).toBe('DATE_OUTSIDE_EVENT');

      expect((await add(api, 'dharohar-show', dharohar)).status).toBe(201);
      const twice = await add(api, 'dharohar-show', dharohar);
      expect(twice.status).toBe(409);
      expect(twice.data.error.code).toBe('ALREADY_ADDED');
      // Another day is fine
      expect((await add(api, 'dharohar-show', { tripId: TRIP_ID, date: '2026-11-09' })).status).toBe(201);
    });
  });

  test('checks the event, the trip and the body', async () => {
    await withApi({}, async (api) => {
      expect((await add(api, 'nope', dharohar)).status).toBe(404);
      expect((await add(api, 'dharohar-show', { ...dharohar, tripId: 'abc' })).status).toBe(400);
      // Not your trip: a 404, like the trips module
      expect((await add(api, 'dharohar-show', { ...dharohar, tripId: '22222222-2222-4222-8222-222222222222' })).status).toBe(404);
      expect((await add(api, 'dharohar-show', { tripId: TRIP_ID })).status).toBe(400);
      expect((await add(api, 'dharohar-show', { ...dharohar, date: 'tomorrow' })).status).toBe(400);
      // A season is a heads-up, not a stop
      const season = await add(api, 'year-end-peak', { tripId: TRIP_ID, date: '2026-11-08' });
      expect(season.status).toBe(400);
    });
  });

  test('a trip without dates takes the day the squad picked, and an event with no dates yet can be added with a reminder', async () => {
    await withApi({ trip: { startDate: null, endDate: null, flexibleDays: 4 } }, async (api, stops) => {
      expect((await add(api, 'dharohar-show', { tripId: TRIP_ID })).status).toBe(201);
      expect(stops[0].input.dayNumber).toBe(1);
      expect((await add(api, 'puppet-show', { tripId: TRIP_ID, dayNumber: 3 })).status).toBe(201);
      expect(stops[1].input.dayNumber).toBe(3);
      expect((await add(api, 'puppet-show', { tripId: TRIP_ID, dayNumber: 9 })).status).toBe(400);
      const fair = await add(api, 'shilpgram-utsav', { tripId: TRIP_ID, dayNumber: 2 });
      expect(fair.status).toBe(201);
      expect(String(stops.at(-1)!.input.notes).includes('announced closer to the time')).toBe(true);
    });
  });

  test('no stop, no event: a failure adding the stop is passed on', async () => {
    await withApi({ trip: { failAddStop: true } }, async (api) => {
      expect((await add(api, 'dharohar-show', dharohar)).status).toBe(500);
    });
  });
});

describe('on the server', () => {
  test('is mounted ahead of the expenses ledger, whose catch-all would otherwise answer /api/events', async () => {
    const stub = (name: string) => Router().use((_req, res) => { res.json({ handledBy: name }); });
    const server = await serve(createServer({ auth: stub('auth'), expenses: stub('expenses'), events: createEventsApp({ now: NOW }) }));
    try {
      const events = await server.request('/api/events?from=2026-11-01&to=2026-11-14');
      expect(events.status).toBe(200);
      expect((await events.json() as { items: unknown[] }).items).toHaveLength(2);
      expect(((await (await server.request('/api/groups/abc/balances')).json()) as { handledBy: string }).handledBy).toBe('expenses');
    } finally {
      await server.close();
    }
  });
});
