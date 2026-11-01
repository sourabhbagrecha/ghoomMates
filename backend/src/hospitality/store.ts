// Where reservations and logged leftovers live: Postgres in the app, memory when there is no database
// (so the host dashboard still works) and in tests.
import { randomUUID } from 'node:crypto';
import { normaliseMix, type Booking } from './plan.ts';
import { emptyMix, type Diet, type DietMix, type Meal } from './types.ts';

export type StoredBooking = Booking & { userId: string; stopId: string | null; dayNumber: number | null; createdAt: string };

export type NewBooking = Omit<Booking, 'id'> & { userId: string };

export type WasteLog = { hostId: string; date: string; leftoverKg: number; covers: number; note: string };

export type Squad = { members: number; diets: DietMix };

export interface HospitalityStore {
  /** False for the in-memory store: reservations need the trips database */
  readonly persistent: boolean;
  bookingsForHost(hostId: string, from: string, to: string): Promise<Booking[]>;
  bookingsForTrip(tripId: string): Promise<StoredBooking[]>;
  findBooking(id: string): Promise<StoredBooking | null>;
  findSlot(tripId: string, hostId: string, date: string, meal: Meal): Promise<StoredBooking | null>;
  /** Inserts, or updates the booking this trip already has for that host, day and meal */
  saveBooking(booking: NewBooking): Promise<StoredBooking>;
  setStop(id: string, stopId: string | null, dayNumber: number | null): Promise<void>;
  deleteBooking(id: string): Promise<void>;
  /** How many people are in the trip and which diets their profiles mention; null when unknown */
  squad(tripId: string): Promise<Squad | null>;
  wasteLogs(hostId: string, from: string, to: string): Promise<WasteLog[]>;
  saveWaste(log: WasteLog, userId: string | null): Promise<WasteLog>;
}

/* Diets from a profile */

const notesOf = (preferences: Record<string, unknown>): string[] => {
  const notes = (preferences.ghoomate as { notes?: unknown } | undefined)?.notes;
  return Array.isArray(notes) ? notes.map(n => (n as { text?: unknown })?.text).filter((t): t is string => typeof t === 'string') : [];
};

/**
 * The diet a member's profile points to: an explicit `preferences.diet`, else what they told GhoomMate
 * ("I'm Jain", "vegan"). Anyone else gets the standard vegetarian thali, which is all a Mewari thali is.
 */
export function dietOf(preferences: unknown): Diet {
  const prefs = preferences && typeof preferences === 'object' ? preferences as Record<string, unknown> : {};
  const said = [typeof prefs.diet === 'string' ? prefs.diet : '', ...notesOf(prefs)].join(' ').toLowerCase();
  if (/\bjain\b/.test(said)) return 'jain';
  if (/\bvegan\b|dairy[- ]free|no dairy/.test(said)) return 'vegan';
  return 'veg';
}

export function squadFrom(preferences: unknown[]): Squad {
  const diets = emptyMix();
  for (const p of preferences) diets[dietOf(p)]++;
  return { members: preferences.length, diets };
}

/* Postgres */

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }` */
export type HospitalityDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: any[] }> };
};

/** A `date` column as YYYY-MM-DD: the app's pool already returns strings, a plain pg client returns local-midnight Dates */
export function dateString(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

const BOOKING_COLUMNS = 'id, host_id, trip_id, group_name, user_id, meal_date, meal, meal_time, headcount, dietary, note, stop_id, day_number, created_at';

function toBooking(row: any): StoredBooking {
  return {
    id: row.id, hostId: row.host_id, tripId: row.trip_id, group: row.group_name, userId: row.user_id,
    date: dateString(row.meal_date), meal: row.meal, time: row.meal_time, headcount: Number(row.headcount),
    dietary: normaliseMix(row.dietary, Number(row.headcount)), note: row.note, stopId: row.stop_id ?? null,
    dayNumber: row.day_number === null || row.day_number === undefined ? null : Number(row.day_number),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const toWaste = (row: any): WasteLog => ({
  hostId: row.host_id, date: dateString(row.log_date), leftoverKg: Number(row.leftover_kg), covers: Number(row.covers), note: row.note,
});

export class PgStore implements HospitalityStore {
  readonly persistent = true;
  private db: HospitalityDb;

  constructor(db: HospitalityDb) {
    this.db = db;
  }

  async bookingsForHost(hostId: string, from: string, to: string) {
    const { rows } = await this.db.pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM hospitality_reservations WHERE host_id = $1 AND meal_date BETWEEN $2 AND $3 ORDER BY meal_date, meal, created_at`,
      [hostId, from, to],
    );
    return rows.map(toBooking);
  }

  async bookingsForTrip(tripId: string) {
    const { rows } = await this.db.pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM hospitality_reservations WHERE trip_id = $1 ORDER BY meal_date, meal`,
      [tripId],
    );
    return rows.map(toBooking);
  }

  async findBooking(id: string) {
    const { rows } = await this.db.pool.query(`SELECT ${BOOKING_COLUMNS} FROM hospitality_reservations WHERE id = $1`, [id]);
    return rows[0] ? toBooking(rows[0]) : null;
  }

  async findSlot(tripId: string, hostId: string, date: string, meal: Meal) {
    const { rows } = await this.db.pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM hospitality_reservations WHERE trip_id = $1 AND host_id = $2 AND meal_date = $3 AND meal = $4`,
      [tripId, hostId, date, meal],
    );
    return rows[0] ? toBooking(rows[0]) : null;
  }

  async saveBooking(b: NewBooking) {
    const { rows } = await this.db.pool.query(
      `INSERT INTO hospitality_reservations (id, host_id, trip_id, group_name, user_id, meal_date, meal, meal_time, headcount, dietary, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (trip_id, host_id, meal_date, meal) DO UPDATE SET
         group_name = excluded.group_name, user_id = excluded.user_id, meal_time = excluded.meal_time, headcount = excluded.headcount,
         dietary = excluded.dietary, note = excluded.note, updated_at = now()
       RETURNING ${BOOKING_COLUMNS}`,
      [randomUUID(), b.hostId, b.tripId, b.group, b.userId, b.date, b.meal, b.time, b.headcount, JSON.stringify(b.dietary), b.note],
    );
    return toBooking(rows[0]);
  }

  async setStop(id: string, stopId: string | null, dayNumber: number | null) {
    await this.db.pool.query('UPDATE hospitality_reservations SET stop_id = $2, day_number = $3 WHERE id = $1', [id, stopId, dayNumber]);
  }

  async deleteBooking(id: string) {
    await this.db.pool.query('DELETE FROM hospitality_reservations WHERE id = $1', [id]);
  }

  async squad(tripId: string) {
    const { rows } = await this.db.pool.query(
      'SELECT u.preferences FROM trip_members m JOIN users u ON u.id = m.user_id WHERE m.trip_id = $1',
      [tripId],
    );
    return rows.length ? squadFrom(rows.map(r => r.preferences)) : null;
  }

  async wasteLogs(hostId: string, from: string, to: string) {
    const { rows } = await this.db.pool.query(
      `SELECT host_id, log_date, leftover_kg::float8 AS leftover_kg, covers, note FROM hospitality_waste_logs
       WHERE host_id = $1 AND log_date BETWEEN $2 AND $3 ORDER BY log_date`,
      [hostId, from, to],
    );
    return rows.map(toWaste);
  }

  async saveWaste(log: WasteLog, userId: string | null) {
    const { rows } = await this.db.pool.query(
      `INSERT INTO hospitality_waste_logs (host_id, log_date, leftover_kg, covers, note, logged_by) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (host_id, log_date) DO UPDATE SET
         leftover_kg = excluded.leftover_kg, covers = excluded.covers, note = excluded.note, logged_by = excluded.logged_by, updated_at = now()
       RETURNING host_id, log_date, leftover_kg::float8 AS leftover_kg, covers, note`,
      [log.hostId, log.date, log.leftoverKg, log.covers, log.note, userId],
    );
    return toWaste(rows[0]);
  }
}

/* Memory */

export class MemoryStore implements HospitalityStore {
  readonly persistent: boolean;
  private bookings: StoredBooking[] = [];
  private waste = new Map<string, WasteLog>();
  /** Tests can set who is in a trip */
  squads = new Map<string, Squad>();

  /** `persistent` lets tests pretend to be the database, which is what squad tables require */
  constructor(persistent = false) {
    this.persistent = persistent;
  }

  async bookingsForHost(hostId: string, from: string, to: string) {
    return this.bookings.filter(b => b.hostId === hostId && b.date >= from && b.date <= to);
  }

  async bookingsForTrip(tripId: string) {
    return this.bookings.filter(b => b.tripId === tripId);
  }

  async findBooking(id: string) {
    return this.bookings.find(b => b.id === id) ?? null;
  }

  async findSlot(tripId: string, hostId: string, date: string, meal: Meal) {
    return this.bookings.find(b => b.tripId === tripId && b.hostId === hostId && b.date === date && b.meal === meal) ?? null;
  }

  async saveBooking(b: NewBooking) {
    const existing = await this.findSlot(b.tripId, b.hostId, b.date, b.meal);
    if (existing) {
      Object.assign(existing, { group: b.group, userId: b.userId, time: b.time, headcount: b.headcount, dietary: b.dietary, note: b.note });
      return existing;
    }
    const saved: StoredBooking = { ...b, id: randomUUID(), stopId: null, dayNumber: null, createdAt: new Date().toISOString() };
    this.bookings.push(saved);
    return saved;
  }

  async setStop(id: string, stopId: string | null, dayNumber: number | null) {
    const booking = await this.findBooking(id);
    if (booking) Object.assign(booking, { stopId, dayNumber });
  }

  async deleteBooking(id: string) {
    this.bookings = this.bookings.filter(b => b.id !== id);
  }

  async squad(tripId: string) {
    return this.squads.get(tripId) ?? null;
  }

  async wasteLogs(hostId: string, from: string, to: string) {
    return [...this.waste.values()].filter(l => l.hostId === hostId && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveWaste(log: WasteLog) {
    this.waste.set(`${log.hostId}|${log.date}`, log);
    return log;
  }
}

