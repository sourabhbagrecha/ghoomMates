// Advisories a site manager publishes ("City Palace is expected packed 10 AM–12 PM"): validation, storage and the
// public shape travellers see. They live in Postgres, or in memory when the server runs without a database.
import { randomUUID } from 'node:crypto';
import { integer, object, requireThat, text } from '../expenses/domain.ts';
import { formatTime } from '../heritage/crowd.ts';
import { SITE_BY_ID, type HeritageCity } from '../heritage/sites.ts';
import type { AdvisoryLevel } from './draft.ts';
import { shownPeople, shownSquads, type Shown } from './forecast.ts';

export const ADVISORY_LEVELS: readonly AdvisoryLevel[] = ['busy', 'packed'];
const MAX_AHEAD_DAYS = 120;
const MAX_WINDOW_MINUTES = 12 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

/** Minimal slice of the database, so tests can pass a fake `{ pool: { query } }` */
export type OpsDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }> };
};

export type StoredAdvisory = {
  id: string;
  city: HeritageCity;
  siteId: string;
  /** YYYY-MM-DD */
  date: string;
  startMinutes: number;
  endMinutes: number;
  level: AdvisoryLevel;
  messageEn: string;
  messageHi: string;
  /** A calmer site to swap to */
  altSiteId: string | null;
  /** A calmer time at the same site */
  altMinutes: number | null;
  /** Squads and people planned in the window when it was published (exact, partners only) */
  reachSquads: number | null;
  reachPeople: number | null;
  createdBy: string | null;
  createdAt: string;
};

export type NewAdvisory = Omit<StoredAdvisory, 'id' | 'createdAt'>;

/** What travellers see: no author, no reach, and the swap ready to apply to a stop */
export type PublicAdvisory = {
  id: string;
  city: HeritageCity;
  siteId: string;
  siteName: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  level: AdvisoryLevel;
  messageEn: string;
  messageHi: string;
  alternative: {
    /** Same fields as a crowd "swap" nudge, so the app can replace a stop with it */
    site: { id: string; name: string; title: string; place: string; tag: string; notes: string } | null;
    time: { minutes: number; time: string } | null;
  } | null;
  publishedAt: string;
};

export type PartnerAdvisory = PublicAdvisory & { reach: { squads: Shown; people: number | null } | null };

/* Dates */

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 2 Nov" */
export function dateLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

/* Validation */

export function parseWindow(start: unknown, end: unknown) {
  const startMinutes = integer(start, 'startMinutes', 0, 1439);
  const endMinutes = integer(end, 'endMinutes', 1, 1440);
  requireThat(endMinutes > startMinutes, 'The window must end after it starts');
  requireThat(endMinutes - startMinutes <= MAX_WINDOW_MINUTES, 'A window can be at most 12 hours');
  return { startMinutes, endMinutes };
}

export function parseSiteId(value: unknown) {
  requireThat(typeof value === 'string' && SITE_BY_ID.has(value), 'siteId must be one of the heritage sites');
  return SITE_BY_ID.get(value)!;
}

/** A validated advisory from a request body; throws a 400 naming the first problem */
export function parseNewAdvisory(input: unknown, today: string): Omit<NewAdvisory, 'reachSquads' | 'reachPeople' | 'createdBy'> {
  const body = object(input);
  const site = parseSiteId(body.siteId);
  requireThat(isIsoDate(body.date), 'date must look like 2026-11-02');
  requireThat(body.date >= today && body.date <= addDays(today, MAX_AHEAD_DAYS), `date must be between today and ${MAX_AHEAD_DAYS} days ahead`);
  const { startMinutes, endMinutes } = parseWindow(body.startMinutes, body.endMinutes);
  requireThat(ADVISORY_LEVELS.includes(body.level as AdvisoryLevel), 'level must be busy or packed');

  const messageEn = text(body.messageEn, 'messageEn', 300);
  const messageHi = body.messageHi === undefined || body.messageHi === null || body.messageHi === '' ? '' : text(body.messageHi, 'messageHi', 420);

  let altSiteId: string | null = null;
  if (body.altSiteId !== undefined && body.altSiteId !== null && body.altSiteId !== '') {
    const alt = parseSiteId(body.altSiteId);
    requireThat(alt.city === site.city && alt.id !== site.id, 'altSiteId must be a different site in the same city');
    altSiteId = alt.id;
  }
  const altMinutes = body.altMinutes === undefined || body.altMinutes === null ? null : integer(body.altMinutes, 'altMinutes', 0, 1439);

  return {
    city: site.city, siteId: site.id, date: body.date, startMinutes, endMinutes,
    level: body.level as AdvisoryLevel, messageEn, messageHi, altSiteId, altMinutes,
  };
}

/* Shapes */

/** Live until its window is over */
export function isActive(a: Pick<StoredAdvisory, 'date' | 'endMinutes'>, now: { date: string; minutes: number }) {
  return a.date > now.date || (a.date === now.date && a.endMinutes > now.minutes);
}

export function publicAdvisory(a: StoredAdvisory): PublicAdvisory {
  const site = SITE_BY_ID.get(a.siteId);
  const alt = a.altSiteId ? SITE_BY_ID.get(a.altSiteId) : undefined;
  const hasAlt = alt || a.altMinutes !== null;
  return {
    id: a.id, city: a.city, siteId: a.siteId, siteName: site?.name ?? a.siteId, date: a.date,
    startMinutes: a.startMinutes, endMinutes: a.endMinutes,
    startTime: formatTime(a.startMinutes), endTime: formatTime(a.endMinutes % 1440),
    level: a.level, messageEn: a.messageEn, messageHi: a.messageHi,
    alternative: hasAlt
      ? {
        site: alt ? { id: alt.id, name: alt.name, title: alt.visitTitle, place: alt.name, tag: alt.tag, notes: alt.care } : null,
        time: a.altMinutes !== null ? { minutes: a.altMinutes, time: formatTime(a.altMinutes) } : null,
      }
      : null,
    publishedAt: a.createdAt,
  };
}

export function partnerAdvisory(a: StoredAdvisory): PartnerAdvisory {
  return {
    ...publicAdvisory(a),
    reach: a.reachSquads === null ? null : { squads: shownSquads(a.reachSquads), people: shownPeople(a.reachSquads, a.reachPeople ?? 0) },
  };
}

/* Storage */

export interface AdvisoryStore {
  create(input: NewAdvisory): Promise<StoredAdvisory>;
  /** Advisories not withdrawn, from `fromDate` on (or only on `date`), earliest first */
  list(filter: { city?: HeritageCity; fromDate: string; date?: string }): Promise<StoredAdvisory[]>;
  /** False when there was no such live advisory */
  withdraw(id: string): Promise<boolean>;
}

type Row = {
  id: string; city: HeritageCity; site_id: string; advisory_date: string | Date; start_minutes: number; end_minutes: number;
  level: AdvisoryLevel; message_en: string; message_hi: string; alt_site_id: string | null; alt_minutes: number | null;
  reach_squads: number | null; reach_people: number | null; created_by: string | null; created_at: Date | string;
};

const COLUMNS = `id, city, site_id, advisory_date, start_minutes, end_minutes, level, message_en, message_hi, alt_site_id, alt_minutes,
  reach_squads, reach_people, created_by, created_at`;

function fromRow(r: Row): StoredAdvisory {
  const date = r.advisory_date instanceof Date
    ? `${r.advisory_date.getFullYear()}-${String(r.advisory_date.getMonth() + 1).padStart(2, '0')}-${String(r.advisory_date.getDate()).padStart(2, '0')}`
    : String(r.advisory_date).slice(0, 10);
  return {
    id: r.id, city: r.city, siteId: r.site_id, date, startMinutes: r.start_minutes, endMinutes: r.end_minutes, level: r.level,
    messageEn: r.message_en, messageHi: r.message_hi, altSiteId: r.alt_site_id, altMinutes: r.alt_minutes,
    reachSquads: r.reach_squads, reachPeople: r.reach_people, createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(),
  };
}

export class PostgresAdvisoryStore implements AdvisoryStore {
  private db: OpsDb;

  constructor(db: OpsDb) {
    this.db = db;
  }

  async create(input: NewAdvisory) {
    const id = randomUUID();
    const { rows } = await this.db.pool.query(
      `INSERT INTO heritage_advisories (id, city, site_id, advisory_date, start_minutes, end_minutes, level, message_en, message_hi,
         alt_site_id, alt_minutes, reach_squads, reach_people, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING ${COLUMNS}`,
      [id, input.city, input.siteId, input.date, input.startMinutes, input.endMinutes, input.level, input.messageEn, input.messageHi,
        input.altSiteId, input.altMinutes, input.reachSquads, input.reachPeople, input.createdBy],
    );
    return fromRow(rows[0] as Row);
  }

  async list({ city, fromDate, date }: { city?: HeritageCity; fromDate: string; date?: string }) {
    const { rows } = await this.db.pool.query(
      `SELECT ${COLUMNS} FROM heritage_advisories
       WHERE withdrawn_at IS NULL AND advisory_date >= $1::date AND ($2::date IS NULL OR advisory_date = $2::date)
         AND ($3::text IS NULL OR city = $3)
       ORDER BY advisory_date, start_minutes, created_at LIMIT 100`,
      [fromDate, date ?? null, city ?? null],
    );
    return (rows as Row[]).map(fromRow);
  }

  async withdraw(id: string) {
    const { rowCount } = await this.db.pool.query(
      'UPDATE heritage_advisories SET withdrawn_at = now() WHERE id = $1 AND withdrawn_at IS NULL',
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

/** Without a database advisories live for as long as the server does */
export class MemoryAdvisoryStore implements AdvisoryStore {
  private items: StoredAdvisory[] = [];

  async create(input: NewAdvisory) {
    const advisory: StoredAdvisory = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.items.push(advisory);
    return advisory;
  }

  async list({ city, fromDate, date }: { city?: HeritageCity; fromDate: string; date?: string }) {
    return this.items
      .filter(a => a.date >= fromDate && (!date || a.date === date) && (!city || a.city === city))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes || a.createdAt.localeCompare(b.createdAt));
  }

  async withdraw(id: string) {
    const before = this.items.length;
    this.items = this.items.filter(a => a.id !== id);
    return this.items.length < before;
  }
}
