import { ApiError, integer, object, requireThat } from '../expenses/domain.ts';
import { logger } from '../logger.ts';
import type { TripAccess } from '../trips/service.ts';
import { tripLength } from '../trips/itinerary.ts';
import type { User } from '../auth/types.ts';
import { CRAFT_BY_ID } from './crafts.ts';
import { availabilityFor, isIsoDate, normaliseSlot, slotMinutes, stopNotes, type DayAvailability } from './logic.ts';
import { MAKER_BY_ID, type Maker } from './makers.ts';
import type { BookingRecord, MakersStore } from './store.ts';

/** The two things booking needs from the trips module: who is in the trip, and adding an itinerary stop */
export type MakersTrips = {
  access(tripId: string, userId: string): Promise<TripAccess>;
  addStop(access: TripAccess, userId: string, input: unknown): Promise<{ id: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

/** A booking as the app shows it: the stored record plus the maker's details */
export type BookingView = BookingRecord & {
  makerName: string;
  studio: string;
  area: string;
  lat: number;
  lng: number;
  workshopTitle: string;
  craftId: string;
  craftName: string;
  /** The craft's cover art, for the stop screen */
  cover: string;
};

export function bookingView(record: BookingRecord): BookingView {
  const maker = MAKER_BY_ID.get(record.makerId);
  const craft = maker ? CRAFT_BY_ID.get(maker.craftIds[0]) : undefined;
  return {
    ...record,
    makerName: maker?.name ?? 'Maker',
    studio: maker?.studio ?? '',
    area: maker?.area ?? '',
    lat: maker?.lat ?? 0,
    lng: maker?.lng ?? 0,
    workshopTitle: maker?.workshop.title ?? 'Workshop',
    craftId: craft?.id ?? '',
    craftName: craft?.name ?? '',
    cover: craft?.cover ?? '',
  };
}

/** Day N of the trip for a date. Trips without dates use the day the squad picked (day 1 unless told otherwise). */
export function dayNumberFor(trip: TripAccess['trip'], date: string, requested: unknown) {
  const length = tripLength(trip);
  if (!trip.start_date) return requested === undefined ? 1 : integer(requested, 'dayNumber', 1, length);
  const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / DAY_MS) + 1;
  if (day < 1 || day > length) {
    throw new ApiError(400, 'DATE_OUTSIDE_TRIP', `That date is outside your trip (${trip.start_date} to ${trip.end_date ?? trip.start_date}).`);
  }
  return day;
}

const firstName = (maker: Maker) => maker.name.split(' ')[0];

export class MakersService {
  private store: MakersStore;
  private trips: MakersTrips;
  private now: () => Date;

  constructor(store: MakersStore, trips: MakersTrips, now: () => Date = () => new Date()) {
    this.store = store;
    this.trips = trips;
    this.now = now;
  }

  /** Free workshop slots on a date, counting the people other squads have already booked */
  async slots(maker: Maker, date: string): Promise<DayAvailability> {
    return availabilityFor(maker, date, await this.store.booked(maker.id, date), this.now());
  }

  async book(user: User, maker: Maker, input: unknown) {
    const body = object(input);
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
    requireThat(UUID.test(tripId), 'tripId must be one of your trips');
    const date = body.date;
    requireThat(isIsoDate(date), 'date must be a YYYY-MM-DD date');
    const slot = normaliseSlot(body.slot);
    requireThat(slot !== null, 'slot must be a time like "10:30 AM"');
    const { workshop } = maker;
    const people = integer(body.people, 'people', 1, 100);
    requireThat(people >= workshop.minPeople && people <= workshop.maxPeople, `${firstName(maker)} takes ${workshop.minPeople} to ${workshop.maxPeople} people per session`);
    const note = body.note === undefined || body.note === null || body.note === '' ? '' : String(body.note).trim();
    requireThat(note.length <= 200, 'note must be at most 200 characters');

    // Non-members get a 404 here, so trip ids don't leak
    const access = await this.trips.access(tripId, user.id);
    const dayNumber = dayNumberFor(access.trip, date, body.dayNumber);

    if (await this.store.findOpen(tripId, maker.id, date, slot)) {
      throw new ApiError(409, 'ALREADY_BOOKED', `Your squad already has ${firstName(maker)}’s ${slot} session on that day.`);
    }

    const day = await this.slots(maker, date);
    const open = day.slots.find(s => s.time === slot);
    if (!day.open) throw new ApiError(409, 'SLOT_UNAVAILABLE', `${firstName(maker)} is closed that day (${day.closedReason}).`);
    if (!open) throw new ApiError(409, 'SLOT_UNAVAILABLE', `${firstName(maker)} has no ${slot} session on that day.`);
    if (open.reason === 'past') throw new ApiError(409, 'SLOT_UNAVAILABLE', 'That session starts too soon to book. Pick a later one.');
    if (!open.available || people > open.spotsLeft) {
      throw new ApiError(409, 'SLOT_UNAVAILABLE', open.spotsLeft > 0 ? `Only ${open.spotsLeft} spot${open.spotsLeft === 1 ? '' : 's'} left in that session.` : 'That session is full. Pick another slot.');
    }

    const total = workshop.pricePerPerson * people;
    const booking = await this.store.create({
      tripId, makerId: maker.id, bookedBy: user.id, dayNumber, date, slot, people,
      pricePerPerson: workshop.pricePerPerson, total, note,
    }, workshop.maxPeople);

    // The itinerary stop goes through the trips module's own insert, so it behaves like any stop the squad adds
    try {
      const stop = await this.trips.addStop(access, user.id, {
        dayNumber,
        time: slot,
        title: `${workshop.title} with ${firstName(maker)}`,
        tag: 'Culture',
        place: maker.stopPlace,
        notes: stopNotes(maker, people, total, note),
      });
      await this.store.attachStop(booking.id, stop.id);
      logger.info('Makers', `${user.email} booked ${maker.name} for ${people} on ${date} ${slot} (trip ${tripId})`);
      return { ...bookingView({ ...booking, stopId: stop.id }), stop: { id: stop.id, dayNumber, time: slot } };
    } catch (err) {
      // No stop, no booking: the squad should never be charged for a session that isn't in their plan
      await this.store.cancel(booking.id).catch(() => undefined);
      throw err;
    }
  }

  /** Every confirmed workshop for a trip, soonest first. Members only. */
  async bookings(user: User, tripId: unknown) {
    requireThat(typeof tripId === 'string' && UUID.test(tripId), 'tripId is required');
    await this.trips.access(tripId, user.id);
    const records = await this.store.forTrip(tripId);
    return records
      .sort((a, b) => a.date.localeCompare(b.date) || slotMinutes(a.slot) - slotMinutes(b.slot))
      .map(bookingView);
  }
}
