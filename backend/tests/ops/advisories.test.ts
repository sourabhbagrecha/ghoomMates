import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import {
  MemoryAdvisoryStore, PostgresAdvisoryStore, addDays, dateLabel, isActive, isIsoDate, parseNewAdvisory, parseWindow, partnerAdvisory,
  publicAdvisory, type NewAdvisory, type OpsDb,
} from '../../src/ops/advisories.ts';

const TODAY = '2026-11-01';
const valid = {
  siteId: 'city-palace', date: '2026-11-02', startMinutes: 600, endMinutes: 720, level: 'packed',
  messageEn: 'Heads up: City Palace is expected packed 10 AM–12 PM.', messageHi: 'ध्यान दें: सिटी पैलेस में भीड़ रहेगी।',
  altSiteId: 'bagore-ki-haveli', altMinutes: 570,
};

const rejects = (input: unknown) => {
  try {
    parseNewAdvisory(input, TODAY);
  } catch (err) {
    expect(err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR').toBe(true);
    return;
  }
  throw new Error(`expected a 400 for ${JSON.stringify(input)}`);
};

const sample = (over: Partial<NewAdvisory> = {}): NewAdvisory => ({
  city: 'Udaipur', siteId: 'city-palace', date: '2026-11-02', startMinutes: 600, endMinutes: 720, level: 'packed',
  messageEn: 'Heads up', messageHi: 'ध्यान दें', altSiteId: 'bagore-ki-haveli', altMinutes: 570, reachSquads: 41, reachPeople: 225, createdBy: 'usr_1', ...over,
});

describe('validating an advisory', () => {
  test('accepts a complete one and fills in the city', () => {
    const parsed = parseNewAdvisory(valid, TODAY);
    expect(parsed.city).toBe('Udaipur');
    expect(parsed.altSiteId).toBe('bagore-ki-haveli');
    expect(parsed.altMinutes).toBe(570);
    expect(parsed.level).toBe('packed');
  });

  test('the Hindi message and the alternatives are optional', () => {
    const parsed = parseNewAdvisory({ siteId: 'city-palace', date: TODAY, startMinutes: 720, endMinutes: 1440, level: 'busy', messageEn: 'Busy day' }, TODAY);
    expect(parsed.endMinutes).toBe(1440);
    expect(parsed.messageHi).toBe('');
    expect(parsed.altSiteId).toBe(null);
    expect(parsed.altMinutes).toBe(null);
  });

  test('rejects an unknown site, a bad date, a past date and one too far ahead', () => {
    rejects({ ...valid, siteId: 'taj-mahal' });
    rejects({ ...valid, date: '2026-13-40' });
    rejects({ ...valid, date: '02/11/2026' });
    rejects({ ...valid, date: '2026-10-31' });
    rejects({ ...valid, date: addDays(TODAY, 400) });
  });

  test('rejects a backwards, empty or day-long window', () => {
    rejects({ ...valid, startMinutes: 720, endMinutes: 600 });
    rejects({ ...valid, startMinutes: 600, endMinutes: 600 });
    rejects({ ...valid, startMinutes: 0, endMinutes: 800 });
    rejects({ ...valid, startMinutes: -5 });
    rejects({ ...valid, endMinutes: 1500 });
    rejects({ ...valid, startMinutes: 600.5 });
  });

  test('rejects a level that is not busy or packed, and messages that are empty or too long', () => {
    rejects({ ...valid, level: 'calm' });
    rejects({ ...valid, level: 'closed' });
    rejects({ ...valid, messageEn: '   ' });
    rejects({ ...valid, messageEn: 'x'.repeat(301) });
    rejects({ ...valid, messageHi: 'x'.repeat(421) });
    rejects('not an object');
  });

  test('rejects an alternative that is unknown or the site itself', () => {
    rejects({ ...valid, altSiteId: 'nowhere' });
    rejects({ ...valid, altSiteId: 'city-palace' });
    rejects({ ...valid, altMinutes: 1500 });
  });

  test('windows, dates and day labels', () => {
    expect(parseWindow(600, 720)).toEqual({ startMinutes: 600, endMinutes: 720 });
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateLabel('2026-11-02')).toBe('Mon 2 Nov');
  });
});

describe('what travellers see', () => {
  const stored = { ...sample(), id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-11-01T10:00:00.000Z' };

  test('the public shape has the swap ready to apply, and no author or reach', () => {
    const pub = publicAdvisory(stored);
    expect(pub.siteName).toBe('City Palace');
    expect(pub.startTime).toBe('10:00 AM');
    expect(pub.endTime).toBe('12:00 PM');
    expect(pub.alternative?.site?.name).toBe('Bagore ki Haveli');
    expect(pub.alternative?.site?.title).toBe('Bagore ki Haveli');
    expect(pub.alternative?.site?.tag).toBe('Culture');
    expect((pub.alternative?.site?.notes ?? '').length > 0).toBe(true);
    expect(pub.alternative?.time).toEqual({ minutes: 570, time: '09:30 AM' });
    const json = JSON.stringify(pub);
    expect(json.includes('usr_1')).toBe(false);
    expect(json.includes('reach')).toBe(false);
    expect(json.includes('createdBy')).toBe(false);
  });

  test('no alternative at all gives null', () => {
    expect(publicAdvisory({ ...stored, altSiteId: null, altMinutes: null }).alternative).toBe(null);
  });

  test('partners see the reach, with small counts hidden', () => {
    expect(partnerAdvisory(stored).reach).toEqual({ squads: 41, people: 225 });
    expect(partnerAdvisory({ ...stored, reachSquads: 2, reachPeople: 9 }).reach).toEqual({ squads: '<3', people: null });
    expect(partnerAdvisory({ ...stored, reachSquads: null, reachPeople: null }).reach).toBe(null);
  });

  test('stays live until its window is over', () => {
    expect(isActive(stored, { date: '2026-11-01', minutes: 1200 })).toBe(true);
    expect(isActive(stored, { date: '2026-11-02', minutes: 700 })).toBe(true);
    expect(isActive(stored, { date: '2026-11-02', minutes: 720 })).toBe(false);
    expect(isActive(stored, { date: '2026-11-03', minutes: 0 })).toBe(false);
  });
});

describe('storage', () => {
  test('the in-memory store lists by day and time, filters, and withdraws', async () => {
    const store = new MemoryAdvisoryStore();
    const later = await store.create(sample({ date: '2026-11-03' }));
    const early = await store.create(sample({ startMinutes: 480, endMinutes: 540 }));
    const noon = await store.create(sample());
    expect((await store.list({ fromDate: '2026-11-01' })).map(a => a.id)).toEqual([early.id, noon.id, later.id]);
    expect((await store.list({ fromDate: '2026-11-01', date: '2026-11-03' })).map(a => a.id)).toEqual([later.id]);
    expect(await store.list({ fromDate: '2026-11-04' })).toHaveLength(0);
    expect(await store.withdraw(noon.id)).toBe(true);
    expect(await store.withdraw(noon.id)).toBe(false);
    expect(await store.list({ fromDate: '2026-11-01' })).toHaveLength(2);
  });

  test('the Postgres store inserts, reads back Date columns, and counts withdrawals by rows touched', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const db: OpsDb = {
      pool: {
        query: async (sql, values = []) => {
          calls.push({ sql, values });
          if (sql.startsWith('INSERT')) {
            return {
              rowCount: 1,
              rows: [{
                id: values[0], city: values[1], site_id: values[2], advisory_date: new Date(2026, 10, 2), start_minutes: values[4], end_minutes: values[5],
                level: values[6], message_en: values[7], message_hi: values[8], alt_site_id: values[9], alt_minutes: values[10],
                reach_squads: values[11], reach_people: values[12], created_by: values[13], created_at: new Date('2026-11-01T10:00:00Z'),
              }],
            };
          }
          if (sql.startsWith('UPDATE')) return { rowCount: values[0] === 'known' ? 1 : 0, rows: [] };
          return { rowCount: 0, rows: [] };
        },
      },
    };
    const store = new PostgresAdvisoryStore(db);
    const saved = await store.create(sample());
    expect(saved.date).toBe('2026-11-02');
    expect(saved.createdAt).toBe('2026-11-01T10:00:00.000Z');
    expect(saved.reachSquads).toBe(41);
    expect(await store.withdraw('known')).toBe(true);
    expect(await store.withdraw('other')).toBe(false);
    await store.list({ city: 'Udaipur', fromDate: TODAY });
    const select = calls.at(-1)!;
    expect(select.sql.includes('withdrawn_at IS NULL')).toBe(true);
    expect(select.values).toEqual([TODAY, null, 'Udaipur']);
  });
});
