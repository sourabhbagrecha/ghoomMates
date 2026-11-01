import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { EVENT_BY_ID } from '../../src/events/calendar.ts';
import { addDays, daysBetween, datesBetween, isIsoDate, todayInIndia, weekdayOf } from '../../src/events/dates.ts';
import { crowdFor, defaultRange, listEvents, runsOn, windowLabel, type EventInstance } from '../../src/events/logic.ts';
import { BUSY_FROM } from '../../src/heritage/crowd.ts';

const week = (today: string, to = addDays(today, 6)) => listEvents({ from: today, to, today });
const item = (list: ReturnType<typeof listEvents>, id: string) => list.items.find(i => i.id === id) as EventInstance;

describe('dates in India', () => {
  test('whole-day maths on calendar days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
    expect(daysBetween('2026-11-08', '2026-11-01')).toBe(-7);
    expect(datesBetween('2026-11-06', '2026-11-08')).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    expect(weekdayOf('2026-11-08')).toBe(0);
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-11-1')).toBe(false);
    expect(isIsoDate(20261101)).toBe(false);
  });
  test('today rolls over at midnight in India, not in UTC', () => {
    expect(todayInIndia(new Date('2026-10-31T18:29:00Z'))).toBe('2026-10-31');
    expect(todayInIndia(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01');
  });
});

describe('clock labels', () => {
  test('say the AM or PM once when both ends agree', () => {
    expect(windowLabel(17 * 60, 22 * 60)).toBe('5–10 PM');
    expect(windowLabel(11 * 60, 21 * 60 + 30)).toBe('11 AM–9:30 PM');
    expect(windowLabel(5 * 60 + 30, 8 * 60 + 30)).toBe('5:30–8:30 AM');
    expect(windowLabel(17 * 60 + 30, 20 * 60 + 15)).toBe('5:30–8:15 PM');
    expect(windowLabel(9 * 60, 21 * 60)).toBe('9 AM–9 PM');
  });
});

describe('what is on in a window', () => {
  test('the first week of November has Diwali, the two nightly shows, and the fair with no dates yet', () => {
    const list = week('2026-11-01', '2026-11-14');
    expect(list.items.map(i => i.id)).toEqual(['diwali', 'annakut-nathdwara']);
    expect(list.recurring.map(r => r.id)).toEqual(['dharohar-show', 'puppet-show']);
    expect(list.undated.map(u => u.id)).toEqual(['shilpgram-utsav']);
    expect(list.undated[0].datesNote.startsWith('Dates announced closer to the time')).toBe(true);
    expect(list.city).toBe('Udaipur');
    expect(list.today).toBe('2026-11-01');
  });
  test('this week (seven days from today) already shows Diwali, which starts with Dhanteras on the 6th', () => {
    const list = week('2026-11-01');
    expect(list.items.map(i => i.id)).toEqual(['diwali']);
    expect(list.items[0].daysAway).toBe(5);
    expect(list.items[0].status).toBe('upcoming');
  });
  test('a window includes runs that start before it, end after it, and sit on its first or last day', () => {
    expect(week('2027-01-01', '2027-01-01').items.map(i => i.id)).toEqual(['year-end-peak']);
    expect(week('2026-12-31', '2026-12-31').items.map(i => i.id)).toEqual(['year-end-peak']);
    expect(week('2027-04-10', '2027-04-10').items.map(i => i.id)).toEqual(['gangaur-mewar-festival']);
    expect(week('2027-04-12', '2027-04-20').items).toEqual([]);
    expect(week('2027-03-01', '2027-03-31').items.map(i => i.id)).toEqual(['maha-shivratri', 'holika-dahan', 'holi']);
  });
  test('items come sorted by day, then by time of day', () => {
    const list = listEvents({ from: '2026-11-01', to: '2027-12-31', today: '2026-11-01' });
    const keys = list.items.map(i => i.from);
    expect([...keys].sort()).toEqual(keys);
    expect(list.items.length).toBe(18);
    expect(list.items[0].key).toBe('diwali@2026-11-06');
    // Two Diwalis, two Annakuts: one instance per run
    expect(list.items.filter(i => i.id === 'diwali').map(i => i.from)).toEqual(['2026-11-06', '2027-10-27']);
  });
  test('says where an event is in time', () => {
    const status = (today: string) => item(week(today, '2026-11-12'), 'diwali')?.status;
    expect(status('2026-11-05')).toBe('tomorrow');
    expect(status('2026-11-06')).toBe('today');
    expect(status('2026-11-07')).toBe('ongoing');
    expect(status('2026-11-08')).toBe('ongoing');
    expect(listEvents({ from: '2026-11-01', to: '2026-11-12', today: '2026-11-09' }).items[0].status).toBe('past');
    expect(item(week('2026-11-07', '2026-11-09'), 'diwali').daysAway).toBe(-1);
  });
  test('the default window is today and the next four months', () => {
    expect(defaultRange('2026-11-01')).toEqual({ from: '2026-11-01', to: '2027-03-01' });
  });
});

describe('the crowd an event brings', () => {
  test('Diwali: the old city is packed in the evening, with the quieter time, the quieter spot and where else is calm', () => {
    const diwali = item(week('2026-11-01'), 'diwali');
    expect(diwali.crowd.date).toBe('2026-11-08');
    expect(diwali.crowd.label).toBe('packed');
    expect(diwali.crowd.modelled).toBe(true);
    expect(diwali.crowd.sites.map(s => s.siteId).sort()).toEqual(['ambrai-ghat', 'bagore-ki-haveli', 'gangaur-ghat', 'hathi-pol', 'jagdish-temple']);
    const ghat = diwali.crowd.sites.find(s => s.siteId === 'gangaur-ghat')!;
    expect(ghat.windowLabel).toBe('5–10 PM');
    expect(ghat.peak.label).toBe('packed');
    expect(ghat.dates).toEqual(['2026-11-08']);
    expect(ghat.usual.level! < ghat.peak.level || ghat.usual.label === 'packed').toBe(true);
    // The quieter ghat story: go earlier, or a hilltop with the same feel
    expect(ghat.quieterTime!.level < BUSY_FROM).toBe(true);
    expect(ghat.quieterTime!.minutes < 17 * 60).toBe(true);
    expect(ghat.quieterSite!.id).toBe('neemach-mata');
    expect(ghat.quieterSite!.level < BUSY_FROM).toBe(true);
    // Hathi Pol is lifted on all three shopping days
    expect(diwali.crowd.sites.find(s => s.siteId === 'hathi-pol')!.dates).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    // Calm elsewhere: other sites, open and below busy around the peak
    expect(diwali.crowd.calm.length > 0 && diwali.crowd.calm.length <= 3).toBe(true);
    for (const calm of diwali.crowd.calm) {
      expect(diwali.crowd.sites.some(s => s.siteId === calm.id)).toBe(false);
      expect(calm.level < BUSY_FROM).toBe(true);
    }
    // The hourly curve carries both lines, so the card can show what the festival adds
    expect(ghat.forecast.length > 8).toBe(true);
    expect(ghat.forecast.some(p => p.level !== null && p.usual !== null && p.level > p.usual)).toBe(true);
  });
  test('sites come busiest first, and the card’s label is the busiest peak', () => {
    const rath = crowdFor(EVENT_BY_ID.get('rath-yatra')!, EVENT_BY_ID.get('rath-yatra')!.occurrences[0], '2027-07-05');
    expect(rath.sites[0].siteId).toBe('jagdish-temple');
    expect(rath.sites.map(s => s.peak.level)).toEqual([...rath.sites.map(s => s.peak.level)].sort((a, b) => b - a));
    expect(rath.label).toBe(rath.sites[0].peak.label);
    expect(rath.sites[0].windowLabel).toBe('2–7:30 PM');
    expect(rath.headline.includes('Jagdish Temple')).toBe(true);
  });
  test('an event with no site in Udaipur (Nathdwara, Eklingji, a village) uses its curated crowd note', () => {
    const list = week('2026-11-04', '2026-11-12');
    const annakut = item(list, 'annakut-nathdwara');
    expect(annakut.crowd.modelled).toBe(false);
    expect(annakut.crowd.label).toBe('packed');
    expect(annakut.crowd.level).toBe(null);
    expect(annakut.crowd.sites).toEqual([]);
    expect(annakut.places[0].lat! > 24.9).toBe(true);
    const gavri = listEvents({ from: '2027-08-18', to: '2027-08-20', today: '2027-08-18' }).items.find(i => i.id === 'gavri')!;
    expect(gavri.crowd.label).toBe('quiet');
    expect(gavri.status).toBe('today');
  });
  test('each site is measured today if the event touches it today, else on the run’s main day', () => {
    const dateOf = (today: string, siteId: string) => item(week(today), 'diwali').crowd.sites.find(s => s.siteId === siteId)!.date;
    // Two days before Diwali night: the bazaar and the ghat are both measured on the night itself
    expect(dateOf('2026-11-01', 'hathi-pol')).toBe('2026-11-08');
    expect(dateOf('2026-11-01', 'gangaur-ghat')).toBe('2026-11-08');
    expect(item(week('2026-11-01'), 'diwali').crowd.date).toBe('2026-11-08');
    // On Dhanteras the bazaar is busy today, but the ghat only fills on the 8th
    expect(dateOf('2026-11-06', 'hathi-pol')).toBe('2026-11-06');
    expect(dateOf('2026-11-06', 'gangaur-ghat')).toBe('2026-11-08');
    const festival = (today: string) => item(listEvents({ from: '2027-04-01', to: '2027-04-30', today }), 'gangaur-mewar-festival').crowd.date;
    expect(festival('2027-04-10')).toBe('2027-04-10');
    expect(festival('2027-04-01')).toBe('2027-04-09');
  });
  test('an event with two stretches in a day (dawn and dusk) shows both, and the quieter time avoids both', () => {
    const kartik = item(week('2026-11-20', '2026-11-30'), 'kartik-purnima');
    const ghat = kartik.crowd.sites.find(s => s.siteId === 'gangaur-ghat')!;
    expect(ghat.windowLabel).toBe('5:30–8:30 AM, 5–9 PM');
    expect(ghat.windows).toEqual([{ from: 330, to: 510 }, { from: 1020, to: 1260 }]);
    const quiet = ghat.quieterTime!.minutes;
    expect(ghat.windows.some(w => quiet > w.from - 30 && quiet < w.to + 30)).toBe(false);
  });
  test('the nightly shows are measured at their own site: Dharohar sells out, the puppet show is easier', () => {
    const list = week('2026-11-01');
    const dharohar = list.recurring[0];
    expect(dharohar.crowd.modelled).toBe(true);
    expect(dharohar.crowd.sites[0].siteId).toBe('bagore-ki-haveli');
    expect(dharohar.crowd.label).toBe('packed');
    expect(dharohar.price!.includes('₹')).toBe(true);
    expect(list.recurring[1].crowd.label).toBe('moderate');
  });
  test('a plain event view carries what the card shows: places with map points, the respectful way to join, sources', () => {
    const view = item(week('2026-11-01'), 'diwali');
    expect(view.places[1]).toEqual({ name: 'Gangaur Ghat', siteId: 'gangaur-ghat', lat: 24.5803, lng: 73.6823 });
    expect(view.join.etiquette.length >= 3).toBe(true);
    expect(view.tripTip!.includes('{day}')).toBe(true);
    expect(view.stop).toEqual({ title: 'Diwali evening in the old city', time: '05:30 PM', place: 'Gangaur Ghat, Udaipur' });
    expect(view.sources.length >= 2).toBe(true);
    expect(view.datesBasis.includes('Drik Panchang')).toBe(true);
  });
});

describe('which days an event runs on', () => {
  test('a run covers its days, a nightly show every day, and an event with no dates yet might be on', () => {
    expect(runsOn(EVENT_BY_ID.get('diwali')!, '2026-11-07')).toBe(true);
    expect(runsOn(EVENT_BY_ID.get('diwali')!, '2026-11-09')).toBe(false);
    expect(runsOn(EVENT_BY_ID.get('dharohar-show')!, '2030-01-01')).toBe(true);
    expect(runsOn(EVENT_BY_ID.get('shilpgram-utsav')!, '2026-12-25')).toBe(true);
  });
});
