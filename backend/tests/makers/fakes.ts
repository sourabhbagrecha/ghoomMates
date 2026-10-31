import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../src/http.ts';
import type { Gemini } from '../../src/gemini.ts';
import type { User } from '../../src/auth/types.ts';
import type { MakersTrips } from '../../src/makers/service.ts';
import type { BookingRecord, MakersStore, NewBooking } from '../../src/makers/store.ts';
import type { TripAccess } from '../../src/trips/service.ts';

export const TRIP_ID = '11111111-1111-4111-8111-111111111111';
export const TOKEN = 'token-asha';
export const asha = { id: 'usr_asha', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;

/** In-memory bookings, with the same capacity rule as the Postgres store */
export class MemoryStore implements MakersStore {
  records: BookingRecord[] = [];
  /** People other squads have already booked, per "makerId|date|slot" */
  others = new Map<string, number>();

  private taken(makerId: string, date: string, slot: string) {
    const mine = this.records.filter(r => r.makerId === makerId && r.date === date && r.slot === slot && r.status === 'confirmed').reduce((n, r) => n + r.people, 0);
    return mine + (this.others.get(`${makerId}|${date}|${slot}`) ?? 0);
  }

  async booked(makerId: string, date: string) {
    const slots = new Set([...this.records.filter(r => r.makerId === makerId && r.date === date).map(r => r.slot), ...[...this.others.keys()].filter(k => k.startsWith(`${makerId}|${date}|`)).map(k => k.split('|')[2])]);
    return Object.fromEntries([...slots].map(slot => [slot, this.taken(makerId, date, slot)]));
  }

  async findOpen(tripId: string, makerId: string, date: string, slot: string) {
    return this.records.find(r => r.tripId === tripId && r.makerId === makerId && r.date === date && r.slot === slot && r.status === 'confirmed') ?? null;
  }

  async create(input: NewBooking, capacity: number) {
    if (this.taken(input.makerId, input.date, input.slot) + input.people > capacity) {
      throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Someone just took those spots. Pick another slot.');
    }
    const record: BookingRecord = { ...input, id: randomUUID(), stopId: null, status: 'confirmed', createdAt: new Date().toISOString() };
    this.records.push(record);
    return record;
  }

  async attachStop(id: string, stopId: string) {
    this.records.find(r => r.id === id)!.stopId = stopId;
  }

  async cancel(id: string) {
    this.records.find(r => r.id === id)!.status = 'cancelled';
  }

  async forTrip(tripId: string) {
    return this.records.filter(r => r.tripId === tripId && r.status === 'confirmed').map(r => ({ ...r }));
  }
}

export type FakeTripOptions = { startDate?: string | null; endDate?: string | null; failAddStop?: boolean };

/** Trip membership and stops: only Asha is in TRIP_ID, and every stop she adds is recorded */
export function fakeTrips({ startDate = '2026-11-10', endDate = '2026-11-13', failAddStop = false }: FakeTripOptions = {}) {
  const stops: { access: TripAccess; userId: string; input: Record<string, unknown> }[] = [];
  const trips: MakersTrips = {
    async access(tripId, userId) {
      if (tripId !== TRIP_ID || userId !== asha.id) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
      return { trip: { id: TRIP_ID, start_date: startDate, end_date: endDate, details: {} } as unknown as TripAccess['trip'], memberId: 'm1', role: 'organiser' };
    },
    async addStop(access, userId, input) {
      if (failAddStop) throw new ApiError(500, 'INTERNAL_ERROR', 'boom');
      stops.push({ access, userId, input: input as Record<string, unknown> });
      return { id: `stop-${stops.length}` };
    },
  };
  return { trips, stops };
}

export const authenticate = async (token: string) => {
  if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  return asha;
};

/** A Gemini whose json() is whatever the test says */
export function fakeGemini(json: (request: { prompt: unknown }) => unknown, enabled = true): Gemini & { calls: number } {
  const gemini = {
    enabled,
    imageEnabled: false,
    calls: 0,
    models: { lite: 'fake-lite', smart: 'fake-smart', image: 'fake-image', tts: 'fake-tts' },
    async json(request: { prompt: unknown }) {
      gemini.calls++;
      return json(request);
    },
    async image() {
      throw new Error('not used');
    },
    async speech() {
      throw new Error('not used');
    },
  };
  return gemini as unknown as Gemini & { calls: number };
}

/** Asserts that `actual` has every field of `expected` (and more is fine) */
export function expectFields(actual: unknown, expected: Record<string, unknown>) {
  const object = actual as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(object[key], value, `field ${key}`);
}
