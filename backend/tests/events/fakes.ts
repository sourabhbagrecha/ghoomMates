import { ApiError } from '../../src/http.ts';
import type { User } from '../../src/auth/types.ts';
import type { EventsTrips } from '../../src/events/service.ts';
import type { TripAccess } from '../../src/trips/service.ts';

export const TRIP_ID = '11111111-1111-4111-8111-111111111111';
export const TOKEN = 'token-asha';
export const asha = { id: 'usr_asha', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;

export type FakeTripOptions = { startDate?: string | null; endDate?: string | null; failAddStop?: boolean; flexibleDays?: number };

/** Trip membership and stops: only Asha is in TRIP_ID, and every stop she adds is recorded */
export function fakeTrips({ startDate = '2026-11-07', endDate = '2026-11-09', failAddStop = false, flexibleDays }: FakeTripOptions = {}) {
  const stops: { access: TripAccess; userId: string; input: Record<string, unknown> }[] = [];
  const trips: EventsTrips = {
    async access(tripId, userId) {
      if (tripId !== TRIP_ID || userId !== asha.id) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
      const details = flexibleDays === undefined ? {} : { flexibleDays };
      return { trip: { id: TRIP_ID, start_date: startDate, end_date: endDate, details } as unknown as TripAccess['trip'], memberId: 'm1', role: 'organiser' };
    },
    async addStop(access, userId, input) {
      if (failAddStop) throw new ApiError(500, 'INTERNAL_ERROR', 'boom');
      stops.push({ access, userId, input: input as Record<string, unknown> });
      return { id: `stop-${stops.length}` };
    },
    async hasStop(_tripId, dayNumber, title) {
      return stops.some(s => s.input.dayNumber === dayNumber && String(s.input.title).toLowerCase() === title.toLowerCase());
    },
  };
  return { trips, stops };
}

export const authenticate = async (token: string) => {
  if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  return asha;
};
