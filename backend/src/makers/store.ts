import { randomUUID } from 'node:crypto';
import { ApiError } from '../http.ts';
import { transaction, type Database } from '../db.ts';

export type BookingRecord = {
  id: string;
  tripId: string;
  makerId: string;
  bookedBy: string;
  /** The itinerary stop added for this booking; null if the squad later deleted it */
  stopId: string | null;
  dayNumber: number;
  /** YYYY-MM-DD */
  date: string;
  /** "10:30 AM" */
  slot: string;
  people: number;
  /** Rupees */
  pricePerPerson: number;
  total: number;
  status: 'confirmed' | 'cancelled';
  note: string;
  createdAt: string;
};

export type NewBooking = Pick<BookingRecord, 'tripId' | 'makerId' | 'bookedBy' | 'dayNumber' | 'date' | 'slot' | 'people' | 'pricePerPerson' | 'total' | 'note'>;

/** Where bookings live. The MongoDB store is the real one; tests swap in an in-memory one. */
export interface MakersStore {
  /** People already booked per slot on a date, across every trip */
  booked(makerId: string, date: string): Promise<Record<string, number>>;
  /** This trip's booking for the same maker, date and slot, if any */
  findOpen(tripId: string, makerId: string, date: string, slot: string): Promise<BookingRecord | null>;
  /** Books the slot unless it filled up in the meantime (409), counting everyone already booked against `capacity` */
  create(input: NewBooking, capacity: number): Promise<BookingRecord>;
  attachStop(id: string, stopId: string): Promise<void>;
  /** Used to undo a booking when its itinerary stop could not be added */
  cancel(id: string): Promise<void>;
  forTrip(tripId: string): Promise<BookingRecord[]>;
}

type Doc = {
  _id: string; trip_id: string; maker_id: string; booked_by: string; stop_id: string | null; day_number: number;
  workshop_date: string; slot: string; people: number; price_per_person_inr: number; total_inr: number;
  status: 'confirmed' | 'cancelled'; note: string; created_at: Date;
};

const record = (r: Doc): BookingRecord => ({
  id: r._id, tripId: r.trip_id, makerId: r.maker_id, bookedBy: r.booked_by, stopId: r.stop_id ?? null, dayNumber: r.day_number,
  date: r.workshop_date, slot: r.slot, people: r.people, pricePerPerson: r.price_per_person_inr, total: r.total_inr,
  status: r.status, note: r.note, createdAt: r.created_at.toISOString(),
});

// The maker_slots counter holding how many people are confirmed into one workshop slot
const slotId = (makerId: string, date: string, slot: string) => `${makerId}:${date}:${slot}`;

export class MongoMakersStore implements MakersStore {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  private get bookings() {
    return this.database.db.collection<Doc>('maker_bookings');
  }

  private get slots() {
    return this.database.db.collection<{ _id: string; people: number }>('maker_slots');
  }

  async booked(makerId: string, date: string) {
    const rows = await this.bookings.aggregate<{ _id: string; people: number }>([
      { $match: { maker_id: makerId, workshop_date: date, status: 'confirmed' } },
      { $group: { _id: '$slot', people: { $sum: '$people' } } },
    ]).toArray();
    return Object.fromEntries(rows.map(r => [r._id, r.people]));
  }

  async findOpen(tripId: string, makerId: string, date: string, slot: string) {
    const doc = await this.bookings.findOne({ trip_id: tripId, maker_id: makerId, workshop_date: date, slot, status: 'confirmed' });
    return doc ? record(doc) : null;
  }

  async create(input: NewBooking, capacity: number) {
    return transaction(this.database, async (session) => {
      // Taking seats bumps the slot's counter, so two squads booking at once conflict and one retries against the new total
      const counter = await this.slots.findOneAndUpdate(
        { _id: slotId(input.makerId, input.date, input.slot) },
        { $inc: { people: input.people } },
        { upsert: true, returnDocument: 'after', session },
      );
      if (counter!.people > capacity) {
        throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Someone just took those spots. Pick another slot.');
      }
      const doc: Doc = {
        _id: randomUUID(), trip_id: input.tripId, maker_id: input.makerId, booked_by: input.bookedBy, stop_id: null, day_number: input.dayNumber,
        workshop_date: input.date, slot: input.slot, people: input.people, price_per_person_inr: input.pricePerPerson, total_inr: input.total,
        status: 'confirmed', note: input.note, created_at: new Date(),
      };
      await this.bookings.insertOne(doc, { session });
      return record(doc);
    });
  }

  async attachStop(id: string, stopId: string) {
    await this.bookings.updateOne({ _id: id }, { $set: { stop_id: stopId } });
  }

  async cancel(id: string) {
    await transaction(this.database, async (session) => {
      const doc = await this.bookings.findOneAndUpdate({ _id: id, status: 'confirmed' }, { $set: { status: 'cancelled' } }, { session });
      // Free the seats it held
      if (doc) await this.slots.updateOne({ _id: slotId(doc.maker_id, doc.workshop_date, doc.slot) }, { $inc: { people: -doc.people } }, { session });
    });
  }

  async forTrip(tripId: string) {
    const docs = await this.bookings.find({ trip_id: tripId, status: 'confirmed' }).sort({ workshop_date: 1, created_at: 1 }).toArray();
    return docs.map(record);
  }
}
