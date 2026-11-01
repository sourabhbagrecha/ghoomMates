import { ApiError, integer, object, requireThat } from '../expenses/domain.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import { crowdForStop } from '../heritage/crowd.ts';
import { tripLength } from '../trips/itinerary.ts';
import type { TripAccess } from '../trips/service.ts';
import type { MewarEvent } from './calendar.ts';
import { daysBetween, isIsoDate } from './dates.ts';
import { runsOn } from './logic.ts';

/** What adding an event to a plan needs from the trips module: who is in the trip, the stop insert, and a duplicate check */
export type EventsTrips = {
  access(tripId: string, userId: string): Promise<TripAccess>;
  addStop(access: TripAccess, userId: string, input: unknown): Promise<{ id: string }>;
  /** Is a stop with this title already on that day? */
  hasStop(tripId: string, dayNumber: number, title: string): Promise<boolean>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

/** "7:00 pm" → "07:00 PM"; the event's own time when none is given */
function timeOf(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === '') return fallback;
  const match = typeof value === 'string' ? TIME.exec(value.trim()) : null;
  requireThat(match !== null && Number(match[1]) >= 1 && Number(match[1]) <= 12 && Number(match[2]) <= 59, 'time must look like "07:00 PM"');
  return `${match[1].padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
}

const minutesOf = (time: string) => {
  const [, h, m, period] = TIME.exec(time)!;
  return (Number(h) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m);
};

/** Day N of the trip for a date; trips without dates take the day the squad picked (day 1 unless told otherwise) */
export function dayFor(trip: TripAccess['trip'], date: string | null, requested: unknown) {
  const length = tripLength(trip);
  if (!trip.start_date) return requested === undefined || requested === null ? 1 : integer(requested, 'dayNumber', 1, length);
  requireThat(date !== null, 'date must be a YYYY-MM-DD date, the day of the trip to add it to');
  const day = daysBetween(trip.start_date, date) + 1;
  if (day < 1 || day > length) {
    throw new ApiError(400, 'DATE_OUTSIDE_TRIP', `That date is outside your trip (${trip.start_date} to ${trip.end_date ?? trip.start_date}).`);
  }
  return day;
}

export class EventsService {
  private trips: EventsTrips;

  constructor(trips: EventsTrips) {
    this.trips = trips;
  }

  /** Adds the event to a day of the squad's plan with the trips module's own stop insert, so it behaves like any stop */
  async addToTrip(user: User, event: MewarEvent, input: unknown) {
    const body = object(input);
    const { stop } = event;
    requireThat(stop !== null, 'This one is a heads-up, not a stop you can add to the plan');
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
    requireThat(UUID.test(tripId), 'tripId must be one of your trips');
    const date = body.date === undefined || body.date === null || body.date === '' ? null : body.date;
    requireThat(date === null || isIsoDate(date), 'date must be a YYYY-MM-DD date');
    const time = timeOf(body.time, stop.time);

    // Non-members get a 404 here, so trip ids don't leak
    const access = await this.trips.access(tripId, user.id);
    const dayNumber = dayFor(access.trip, date, body.dayNumber);
    if (date !== null && !runsOn(event, date)) {
      throw new ApiError(400, 'DATE_OUTSIDE_EVENT', `${event.name} isn’t on that day.`);
    }
    if (await this.trips.hasStop(tripId, dayNumber, stop.title)) {
      throw new ApiError(409, 'ALREADY_ADDED', `${stop.title} is already on that day of your plan.`);
    }

    const undated = !event.recurring && event.occurrences.length === 0;
    const added = await this.trips.addStop(access, user.id, {
      dayNumber, time, title: stop.title, tag: stop.tag, place: stop.place,
      notes: undated ? `${stop.notes} Dates are announced closer to the time, so check them before you go.` : stop.notes,
    });
    logger.info('Events', `${user.email} added ${event.id} to day ${dayNumber} of trip ${tripId}`);

    // What the crowd model says about it, so the screen can warn the squad straight away
    const crowd = crowdForStop({ title: stop.title, place: stop.place, minutes: minutesOf(time) }, { city: 'Udaipur', date });
    return {
      stop: { id: added.id, dayNumber, date, time, title: stop.title, place: stop.place },
      event: { id: event.id, name: event.name },
      crowd: crowd && { siteName: crowd.siteName, level: crowd.level, label: crowd.label, dayNote: crowd.dayNote },
    };
  }
}
