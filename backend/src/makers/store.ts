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

/** Where bookings live. The Postgres store is the real one; tests swap in an in-memory one. */
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

type Row = {
  id: string; trip_id: string; maker_id: string; booked_by: string; stop_id: string | null; day_number: number;
  workshop_date: string; slot: string; people: number; price_per_person_inr: number; total_inr: number;
  status: 'confirmed' | 'cancelled'; note: string; created_at: Date;
};

const COLUMNS = 'id, trip_id, maker_id, booked_by, stop_id, day_number, workshop_date, slot, people, price_per_person_inr, total_inr, status, note, created_at';

const record = (r: Row): BookingRecord => ({
  id: r.id, tripId: r.trip_id, makerId: r.maker_id, bookedBy: r.booked_by, stopId: r.stop_id, dayNumber: r.day_number,
  date: r.workshop_date, slot: r.slot, people: r.people, pricePerPerson: r.price_per_person_inr, total: r.total_inr,
  status: r.status, note: r.note, createdAt: r.created_at.toISOString(),
});

export class PostgresMakersStore implements MakersStore {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async booked(makerId: string, date: string) {
    const { rows } = await this.db.pool.query<{ slot: string; people: number }>(
      `SELECT slot, sum(people)::int AS people FROM maker_bookings
       WHERE maker_id = $1 AND workshop_date = $2 AND status = 'confirmed' GROUP BY slot`,
      [makerId, date],
    );
    return Object.fromEntries(rows.map(r => [r.slot, r.people]));
  }

  async findOpen(tripId: string, makerId: string, date: string, slot: string) {
    const { rows: [row] } = await this.db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM maker_bookings
       WHERE trip_id = $1 AND maker_id = $2 AND workshop_date = $3 AND slot = $4 AND status = 'confirmed'`,
      [tripId, makerId, date, slot],
    );
    return row ? record(row) : null;
  }

  async create(input: NewBooking, capacity: number) {
    return transaction(this.db.pool, async (tx) => {
      // One booking at a time per slot, so two squads can't both take the last seats
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`maker:${input.makerId}:${input.date}:${input.slot}`]);
      const { rows: [taken] } = await tx.query<{ people: number }>(
        `SELECT coalesce(sum(people), 0)::int AS people FROM maker_bookings
         WHERE maker_id = $1 AND workshop_date = $2 AND slot = $3 AND status = 'confirmed'`,
        [input.makerId, input.date, input.slot],
      );
      if (taken.people + input.people > capacity) {
        throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Someone just took those spots. Pick another slot.');
      }
      const { rows: [row] } = await tx.query<Row>(
        `INSERT INTO maker_bookings (id, trip_id, maker_id, booked_by, day_number, workshop_date, slot, people, price_per_person_inr, total_inr, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
        [randomUUID(), input.tripId, input.makerId, input.bookedBy, input.dayNumber, input.date, input.slot, input.people, input.pricePerPerson, input.total, input.note],
      );
      return record(row);
    });
  }

  async attachStop(id: string, stopId: string) {
    await this.db.pool.query('UPDATE maker_bookings SET stop_id = $2 WHERE id = $1', [id, stopId]);
  }

  async cancel(id: string) {
    await this.db.pool.query(`UPDATE maker_bookings SET status = 'cancelled' WHERE id = $1`, [id]);
  }

  async forTrip(tripId: string) {
    const { rows } = await this.db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM maker_bookings WHERE trip_id = $1 AND status = 'confirmed' ORDER BY workshop_date, created_at`,
      [tripId],
    );
    return rows.map(record);
  }
}
