import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { listEvents } from '../../src/events/logic.ts';
// The Mewar Utsav screens' helpers are plain TypeScript with no React or CSS, so the backend tests can run them too
import {
  crowdPhrase, dateTile, exploreRow, festivalForSite, festivalLine, groupByWeek, isInstance, isRecurring, pickableDays, relativeLabel,
  startingDay, tipText, tripOverlaps, weekStart, whenLabel,
} from '../../../frontend/src/pages/Events/eventsLogic.ts';
import type { EventList } from '../../../frontend/src/services/eventsService.ts';

// What the API sends, as the app receives it (JSON round trip)
const fetchList = (from: string, to: string, today: string) => JSON.parse(JSON.stringify(listEvents({ from, to, today }))) as EventList;
const ALL = fetchList('2026-11-01', '2028-01-01', '2026-11-01');
const ids = (xs: { id: string }[]) => xs.map(x => x.id);

describe('weeks', () => {
  test('start on Monday', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
  test('the next seven days are this week, the seven after next week, then calendar weeks', () => {
    const groups = groupByWeek(ALL.items, '2026-11-01');
    expect(groups.map(g => g.label).slice(0, 4)).toEqual(['This week', 'Next week', 'Mon 23 – Sun 29 Nov', 'Mon 21 – Sun 27 Dec']);
    // Diwali starts with Dhanteras on the 6th: five days away, so it is this week
    expect(ids(groups[0].items)).toEqual(['diwali']);
    expect(ids(groups[1].items)).toEqual(['annakut-nathdwara']);
    // Soonest week first, and nothing lost
    expect(groups.flatMap(g => g.items).length).toBe(ALL.items.length);
    expect(groups.map(g => g.key)).toEqual([...groups.map(g => g.key)].sort());
  });
  test('a run already under way is this week', () => {
    const groups = groupByWeek(fetchList('2026-12-28', '2027-01-20', '2026-12-28').items, '2026-12-28');
    expect(groups[0].label).toBe('This week');
    expect(ids(groups[0].items)).toEqual(['year-end-peak']);
  });
});

describe('dates', () => {
  test('say the day, or the run', () => {
    expect(whenLabel('2026-11-08', '2026-11-08')).toBe('Sun, 8 Nov');
    expect(whenLabel('2026-11-06', '2026-11-08')).toBe('Fri 6 – Sun 8 Nov');
  });
  test('the calendar tile shows the day, a short run’s days, or where a long run starts', () => {
    expect(dateTile('2026-11-08', '2026-11-08')).toEqual({ top: 'Sun', big: '8', bottom: 'Nov' });
    expect(dateTile('2026-11-06', '2026-11-08')).toEqual({ top: 'Fri–Sun', big: '6–8', bottom: 'Nov' });
    expect(dateTile('2027-04-09', '2027-04-11')).toEqual({ top: 'Fri–Sun', big: '9–11', bottom: 'Apr' });
    expect(dateTile('2027-08-18', '2027-09-26')).toEqual({ top: 'From', big: '18', bottom: 'Aug' });
  });
  test('how soon, in words', () => {
    expect(relativeLabel({ status: 'today', daysAway: 0 })).toEqual({ text: 'Today', soon: true });
    expect(relativeLabel({ status: 'tomorrow', daysAway: 1 })).toEqual({ text: 'Tomorrow', soon: true });
    expect(relativeLabel({ status: 'ongoing', daysAway: -2 })).toEqual({ text: 'On now', soon: true });
    expect(relativeLabel({ status: 'upcoming', daysAway: 5 })).toEqual({ text: 'In 5 days', soon: true });
    expect(relativeLabel({ status: 'upcoming', daysAway: 23 })).toEqual({ text: 'In 23 days', soon: false });
    expect(relativeLabel({ status: 'upcoming', daysAway: 140 })).toEqual({ text: 'In 5 months', soon: false });
  });
  test('type guards tell the three lists apart', () => {
    expect(isInstance(ALL.items[0])).toBe(true);
    expect(isRecurring(ALL.recurring[0])).toBe(true);
    expect(isInstance(ALL.undated[0]) || isRecurring(ALL.undated[0])).toBe(false);
  });
});

describe('the Explore row', () => {
  test('this week: Diwali, then the nightly shows', () => {
    const row = exploreRow(ALL, '2026-11-01');
    expect(row.title).toBe('This week in Mewar');
    expect(ids(row.instances)).toEqual(['diwali']);
    expect(ids(row.recurring)).toEqual(['dharohar-show', 'puppet-show']);
  });
  test('when nothing starts this week it looks ahead instead of going empty', () => {
    const row = exploreRow(fetchList('2027-05-01', '2028-01-01', '2027-05-01'), '2027-05-01');
    expect(row.title).toBe('Coming up in Mewar');
    expect(ids(row.instances)).toEqual(['rath-yatra', 'hariyali-amavasya', 'hariyali-teej']);
  });
  test('a run that is on now leads the week', () => {
    const row = exploreRow(fetchList('2027-08-20', '2028-01-01', '2027-08-20'), '2027-08-20');
    expect(row.title).toBe('This week in Mewar');
    // Gavri is under way, and Janmashtami is five days off
    expect(ids(row.instances)).toEqual(['gavri', 'janmashtami-nathdwara']);
  });
});

describe('a trip meeting the festivals', () => {
  const trip = { startDate: '2026-11-07', endDate: '2026-11-09' };

  test('finds the festival on the trip day, preferring its main day', () => {
    const overlaps = tripOverlaps(ALL.items, trip);
    // Annakut on the 10th is a day after the trip ends
    expect(overlaps.map(o => [o.item.id, o.dayNumber, o.date])).toEqual([['diwali', 2, '2026-11-08']]);
    expect(tripOverlaps(ALL.items, { startDate: null, endDate: null })).toEqual([]);
    // A trip that stops before the festival doesn't overlap it
    expect(tripOverlaps(ALL.items, { startDate: '2026-11-03', endDate: '2026-11-05' })).toEqual([]);
  });
  test('says it in GhoomMate’s words with the day filled in', () => {
    const diwali = ALL.items[0];
    expect(tipText(diwali.tripTip!, 2).startsWith('Your Day 2 is Diwali.')).toBe(true);
    expect(tipText(diwali.tripTip!, 2).includes('{day}')).toBe(false);
  });
  test('offers the trip’s days, and switches off the days a festival is not on', () => {
    const diwali = ALL.items[0];
    const days = pickableDays(diwali, trip);
    expect(days.map(d => [d.dayNumber, d.enabled])).toEqual([[1, true], [2, true], [3, false]]);
    expect(days[1].label).toBe('Day 2 · Sun, 8 Nov');
    expect(days[2].note).toBe('Not on');
    expect(startingDay(diwali, days)!.dayNumber).toBe(2);
    // A nightly show can go on any day, and starts on the first
    const days2 = pickableDays(ALL.recurring[0], trip);
    expect(days2.every(d => d.enabled)).toBe(true);
    expect(startingDay(ALL.recurring[0], days2)!.dayNumber).toBe(1);
    // A festival the trip misses has nowhere to go
    expect(startingDay(ALL.items[1], pickableDays(ALL.items[1], trip))).toBe(null);
  });
  test('a trip without dates offers numbered days', () => {
    const days = pickableDays(ALL.recurring[0], { startDate: null, endDate: null, flexibleDays: 4 });
    expect(days.map(d => d.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4']);
    expect(days.every(d => d.date === null && d.enabled)).toBe(true);
    expect(pickableDays(ALL.recurring[0], { startDate: null, endDate: null })).toHaveLength(3);
  });
});

describe('the line on CrowdPulse', () => {
  const rath = fetchList('2027-07-01', '2027-07-31', '2027-07-04').items;

  test('puts the crowd in words', () => {
    expect(crowdPhrase('packed')).toBe('very heavy crowds');
    expect(crowdPhrase('busy')).toBe('heavy crowds');
    expect(crowdPhrase('moderate')).toBe('busier than usual');
  });
  test('names the festival, the crowd, the place and the hours', () => {
    const found = festivalForSite(rath, 'jagdish-temple', '2027-07-05', null)!;
    expect(found.when).toBe('today');
    expect(festivalLine(found.item.name, found.site)).toBe('Jagannath Rath Yatra: very heavy crowds at Jagdish Temple, 2–7:30 PM');
  });
  test('looks at today, then tomorrow, then days of the squad’s trip', () => {
    expect(festivalForSite(rath, 'jagdish-temple', '2027-07-05', null)!.when).toBe('today');
    expect(festivalForSite(rath, 'jagdish-temple', '2027-07-04', null)!.when).toBe('tomorrow');
    expect(festivalForSite(rath, 'jagdish-temple', '2027-07-01', null)).toBe(null);
    const trip = { startDate: '2027-07-04', endDate: '2027-07-06' };
    const onTrip = festivalForSite(rath, 'jagdish-temple', '2027-07-01', trip)!;
    expect(onTrip.when).toBe('trip');
    expect(onTrip.dayNumber).toBe(2);
    // A site the festival doesn't touch has no line
    expect(festivalForSite(rath, 'badi-lake', '2027-07-05', null)).toBe(null);
  });
  test('only the days the festival really touches that site count', () => {
    // Diwali lifts the ghat on the main day only: the shopping day before it gets no line for the ghat, but does for the bazaar
    const diwali = fetchList('2026-11-01', '2026-11-12', '2026-11-06').items;
    expect(festivalForSite(diwali, 'gangaur-ghat', '2026-11-06', null)).toBe(null);
    expect(festivalForSite(diwali, 'hathi-pol', '2026-11-06', null)!.when).toBe('today');
    expect(festivalForSite(diwali, 'gangaur-ghat', '2026-11-07', null)!.when).toBe('tomorrow');
  });
});
