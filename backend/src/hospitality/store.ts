// Where reservations and logged leftovers live: MongoDB in the app, memory when there is no database
// (so the host dashboard still works) and in tests.
import { randomUUID } from 'node:crypto';
import type { Database, Db } from '../db.ts';
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

/* MongoDB */

export type HospitalityDb = Pick<Database, 'db'>;

/** A `date` field as YYYY-MM-DD (stored as a string; a Date from older data is read as its local day) */
export function dateString(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function toBooking(doc: any): StoredBooking {
  return {
    id: doc._id, hostId: doc.host_id, tripId: doc.trip_id, group: doc.group_name, userId: doc.user_id,
    date: dateString(doc.meal_date), meal: doc.meal, time: doc.meal_time, headcount: Number(doc.headcount),
    dietary: normaliseMix(doc.dietary, Number(doc.headcount)), note: doc.note, stopId: doc.stop_id ?? null,
    dayNumber: doc.day_number === null || doc.day_number === undefined ? null : Number(doc.day_number),
    createdAt: new Date(doc.created_at).toISOString(),
  };
}

const toWaste = (doc: any): WasteLog => ({
  hostId: doc.host_id, date: dateString(doc.log_date), leftoverKg: Number(doc.leftover_kg), covers: Number(doc.covers), note: doc.note,
});

// numeric(7, 2) in the old schema: keep kilos to two decimals
const kilos = (kg: number) => Math.round(kg * 100) / 100;

export class MongoStore implements HospitalityStore {
  readonly persistent = true;
  private db: Db;

  constructor(database: HospitalityDb) {
    this.db = database.db;
  }

  private get reservations() {
    return this.db.collection<any>('hospitality_reservations');
  }

  async bookingsForHost(hostId: string, from: string, to: string) {
    const docs = await this.reservations.find({ host_id: hostId, meal_date: { $gte: from, $lte: to } }).sort({ meal_date: 1, meal: 1, created_at: 1 }).toArray();
    return docs.map(toBooking);
  }

  async bookingsForTrip(tripId: string) {
    const docs = await this.reservations.find({ trip_id: tripId }).sort({ meal_date: 1, meal: 1 }).toArray();
    return docs.map(toBooking);
  }

  async findBooking(id: string) {
    const doc = await this.reservations.findOne({ _id: id });
    return doc ? toBooking(doc) : null;
  }

  async findSlot(tripId: string, hostId: string, date: string, meal: Meal) {
    const doc = await this.reservations.findOne({ trip_id: tripId, host_id: hostId, meal_date: date, meal });
    return doc ? toBooking(doc) : null;
  }

  async saveBooking(b: NewBooking) {
    const now = new Date();
    const doc = await this.reservations.findOneAndUpdate(
      { trip_id: b.tripId, host_id: b.hostId, meal_date: b.date, meal: b.meal },
      {
        $set: { group_name: b.group, user_id: b.userId, meal_time: b.time, headcount: b.headcount, dietary: b.dietary, note: b.note, updated_at: now },
        $setOnInsert: { _id: randomUUID(), stop_id: null, day_number: null, created_at: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return toBooking(doc);
  }

  async setStop(id: string, stopId: string | null, dayNumber: number | null) {
    await this.reservations.updateOne({ _id: id }, { $set: { stop_id: stopId, day_number: dayNumber } });
  }

  async deleteBooking(id: string) {
    await this.reservations.deleteOne({ _id: id });
  }

  async squad(tripId: string) {
    const members = await this.db.collection('trip_members').find({ trip_id: tripId }, { projection: { user_id: 1 } }).toArray();
    if (!members.length) return null;
    const users = await this.db.collection<any>('users').find({ _id: { $in: members.map(m => m.user_id) } }, { projection: { preferences: 1 } }).toArray();
    return users.length ? squadFrom(users.map(u => u.preferences)) : null;
  }

  async wasteLogs(hostId: string, from: string, to: string) {
    const docs = await this.db.collection('hospitality_waste_logs').find({ host_id: hostId, log_date: { $gte: from, $lte: to } }).sort({ log_date: 1 }).toArray();
    return docs.map(toWaste);
  }

  async saveWaste(log: WasteLog, userId: string | null) {
    const now = new Date();
    const doc = await this.db.collection('hospitality_waste_logs').findOneAndUpdate(
      { host_id: log.hostId, log_date: log.date },
      { $set: { leftover_kg: kilos(log.leftoverKg), covers: log.covers, note: log.note, logged_by: userId, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true, returnDocument: 'after' },
    );
    return toWaste(doc);
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

