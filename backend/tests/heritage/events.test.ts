import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { EVENTS } from '../../src/events/calendar.ts';
import { datesBetween } from '../../src/events/dates.ts';
import { RAMP_MINUTES, eventForStop, eventLift, eventReason, impactsOn, siteEvents } from '../../src/events/lift.ts';
import { BUSY_FROM, PACKED_FROM, bestWindow, crowdForStop, dayFactor, dayNoteFor, isOpen, labelFor, levelAt, liveCrowds, suggestFor } from '../../src/heritage/crowd.ts';
import { SITE_BY_ID, SITES } from '../../src/heritage/sites.ts';
import { baselineFor } from '../../src/ops/forecast.ts';
import { sampleStops } from '../../src/ops/sample.ts';

const site = (id: string) => SITE_BY_ID.get(id)!;
const at = (hour: number, minute = 0) => hour * 60 + minute;
const ORDINARY = '2026-11-12';
const DIWALI = '2026-11-08';
const RATH_YATRA = '2027-07-05';
const GANGAUR = '2027-04-09';

describe('a day with no festival', () => {
  test('is exactly the model as it was: every site, every half hour', () => {
    for (const date of [ORDINARY, '2026-11-14', '2027-05-12', '2027-02-02']) {
      for (const s of SITES) {
        for (let m = 0; m < 24 * 60; m += 15) {
          expect(levelAt(s, m, date)).toBe(levelAt(s, m, date, false));
          expect(eventLift(s.id, m, date).factor).toBe(1);
        }
      }
    }
  });
  test('names no festival and opens no site late', () => {
    expect(eventReason(ORDINARY)).toBe(null);
    expect(dayNoteFor(ORDINARY)).toBe(null);
    expect(siteEvents('jagdish-temple', ORDINARY)).toEqual([]);
    expect(isOpen(site('jagdish-temple'), at(15), ORDINARY)).toBe(false);
  });
});

describe('a festival lifts the crowd at the sites and hours it touches', () => {
  test('Diwali evening fills the ghats and the temple from five or six, the bazaar all day', () => {
    for (const id of ['gangaur-ghat', 'ambrai-ghat', 'jagdish-temple']) {
      expect(levelAt(site(id), at(19), DIWALI)! >= PACKED_FROM).toBe(true);
    }
    // The Dhanteras rush: Hathi Pol is far busier at noon than on a plain day with the same city-wide Diwali factor
    expect(levelAt(site('hathi-pol'), at(12), DIWALI)! > levelAt(site('hathi-pol'), at(12), DIWALI, false)! + 15).toBe(true);
    // ...and Sajjangarh, which no Diwali impact touches, is the same with or without the event layer
    expect(levelAt(site('sajjangarh'), at(17), DIWALI)).toBe(levelAt(site('sajjangarh'), at(17), DIWALI, false));
  });
  test('only the main day lifts the ghats; the shopping days before it only lift the bazaar', () => {
    const dhanteras = '2026-11-06';
    expect(eventLift('gangaur-ghat', at(19), dhanteras).factor).toBe(1);
    expect(eventLift('hathi-pol', at(14), dhanteras).factor).toBe(1.5);
    expect(eventLift('gangaur-ghat', at(19), DIWALI).factor).toBe(1.35);
    const run = EVENTS.find(e => e.id === 'diwali')!;
    expect(impactsOn(run, run.occurrences[0], dhanteras).map(i => i.siteId)).toEqual(['hathi-pol']);
  });
  test('the effect eases in and out over half an hour instead of a cliff', () => {
    const from = at(17);
    expect(eventLift('gangaur-ghat', from - RAMP_MINUTES, DIWALI).factor).toBe(1);
    const halfway = eventLift('gangaur-ghat', from - RAMP_MINUTES / 2, DIWALI).factor;
    expect(halfway > 1 && halfway < 1.35).toBe(true);
    expect(eventLift('gangaur-ghat', from, DIWALI).factor).toBe(1.35);
    expect(eventLift('gangaur-ghat', at(22), DIWALI).factor).toBe(1.35);
    expect(eventLift('gangaur-ghat', at(22) + RAMP_MINUTES, DIWALI).factor).toBe(1);
    // No jump of more than a few points between neighbouring quarter hours
    const levels = Array.from({ length: 24 * 4 }, (_, i) => levelAt(site('gangaur-ghat'), i * 15, DIWALI));
    for (let i = 1; i < levels.length; i++) if (levels[i] !== null && levels[i - 1] !== null) expect(Math.abs(levels[i]! - levels[i - 1]!) <= 20).toBe(true);
  });
  test('the level never passes 100 and a floor keeps a quiet site readable', () => {
    for (const e of EVENTS) {
      for (const o of e.occurrences) {
        for (const date of datesBetween(o.from, o.to)) {
          for (const i of e.impacts) {
            const level = levelAt(site(i.siteId), Math.round((i.from + i.to) / 2), date);
            if (level !== null) expect(level >= 0 && level <= 100).toBe(true);
          }
        }
      }
    }
    expect(levelAt(site('moti-magri'), at(16), '2027-01-14')! >= 66).toBe(true);
  });
});

describe('a festival can open a site outside its usual hours', () => {
  test('Jagdish Temple is shut from 2 to 4 PM, except while the Rath Yatra chariot rolls', () => {
    expect(isOpen(site('jagdish-temple'), at(15), RATH_YATRA)).toBe(true);
    expect(isOpen(site('jagdish-temple'), at(15))).toBe(false);
    expect(levelAt(site('jagdish-temple'), at(15), '2027-07-06')).toBe(null);
    expect(labelFor(levelAt(site('jagdish-temple'), at(15), RATH_YATRA))).toBe('packed');
    expect(baselineFor(site('jagdish-temple'), 15, RATH_YATRA)! >= 90).toBe(true);
  });
  test('Holika Dahan keeps the City Palace open after the museum closes', () => {
    expect(levelAt(site('city-palace'), at(19), '2027-03-20')).toBe(null);
    expect(labelFor(levelAt(site('city-palace'), at(19), '2027-03-21'))).toBe('packed');
  });
  test('the quiet-time and nudge logic sees the new hours', () => {
    expect(bestWindow(site('jagdish-temple'), RATH_YATRA)!.minutes).toBe(bestWindow(site('jagdish-temple'), '2027-07-06')!.minutes);
    const nudge = suggestFor(site('gangaur-ghat'), at(18), GANGAUR);
    expect(nudge !== null).toBe(true);
    if (nudge) expect(nudge.level < BUSY_FROM).toBe(true);
  });
});

describe('how a stop reads on a festival day', () => {
  test('lists the festival at the site, with its hours, and says why it is busier', () => {
    const crowd = crowdForStop({ title: 'Evening at Jagdish Temple', place: '', minutes: at(15) }, { city: 'Udaipur', date: RATH_YATRA })!;
    expect(crowd.label).toBe('packed');
    expect(crowd.events.map(e => e.id)).toEqual(['rath-yatra']);
    expect(crowd.events[0].from).toBe(at(14));
    expect(crowd.dayNote).toBe('Busier than usual: it’s Rath Yatra');
    // A site the festival doesn't touch carries no note
    const quiet = crowdForStop({ title: 'Badi Lake', place: '', minutes: at(16) }, { city: 'Udaipur', date: RATH_YATRA })!;
    expect(quiet.events).toEqual([]);
    expect(quiet.dayNote).toBe(null);
    // Diwali still reads as Diwali for the whole city
    expect(crowdForStop({ title: 'Badi Lake', place: '', minutes: at(16) }, { city: 'Udaipur', date: DIWALI })!.dayNote).toBe('Busier than usual: it’s Diwali');
  });
  test('a stop added from the calendar keeps the event’s time: no nudge to move it, and its own advice', () => {
    const show = crowdForStop({ title: 'Dharohar folk dance show', place: 'Bagore ki Haveli, Gangaur Ghat', minutes: at(19) }, { city: 'Udaipur', date: ORDINARY })!;
    expect(show.label).toBe('packed');
    expect(show.suggestion).toBe(null);
    expect(show.care.includes('send one of you ahead')).toBe(true);
    // The same site as an ordinary stop still gets its nudge and its own care line
    const plain = crowdForStop({ title: 'Bagore ki Haveli', place: '', minutes: at(19) }, { city: 'Udaipur', date: ORDINARY })!;
    expect(plain.suggestion !== null).toBe(true);
    expect(plain.care).toBe(site('bagore-ki-haveli').care);
    expect(eventForStop('  DHAROHAR folk dance show ')!.id).toBe('dharohar-show');
    expect(eventForStop('Dharohar')).toBe(null);
  });
  test('a flexible event stop (the crafts fair) still gets a nudge to the quiet hours', () => {
    const fair = crowdForStop({ title: 'Hariyali Amavasya fair at Fateh Sagar', place: 'Fateh Sagar Lake, Udaipur', minutes: at(17) }, { city: 'Udaipur', date: '2027-08-02' })!;
    expect(fair.label).toBe('packed');
    expect(fair.suggestion !== null).toBe(true);
  });
});

describe('the day and the live view', () => {
  test('festival periods keep their name, festivals name the day, weekends stay weekends', () => {
    expect(dayFactor(DIWALI).reason).toBe('Diwali');
    expect(dayNoteFor(DIWALI)).toBe('Diwali');
    expect(dayNoteFor('2027-10-29')).toBe('Diwali');
    expect(dayNoteFor(RATH_YATRA)).toBe('Rath Yatra');
    expect(dayNoteFor('2026-11-24')).toBe('Kartik Purnima');
    // 21 March 2027 is a Sunday: the festival is the better answer than "weekend"
    expect(dayFactor('2027-03-21').reason).toBe('weekend');
    expect(dayNoteFor('2027-03-21')).toBe('Holika Dahan');
    expect(dayNoteFor('2026-11-14')).toBe('weekend');
    expect(dayNoteFor(ORDINARY)).toBe(null);
    expect(dayNoteFor(null)).toBe(null);
    // The year-end holidays now cover the next year too
    expect(dayFactor('2027-12-28').factor > dayFactor('2027-12-14').factor).toBe(true);
  });
  test('the live view puts the Rath Yatra crowd at Jagdish Temple at the top, with the festival attached', () => {
    // 3:30 PM in India
    const live = liveCrowds('Udaipur', new Date('2027-07-05T10:00:00Z'));
    expect(live.time).toBe('03:30 PM');
    expect(live.dayNote).toBe('Rath Yatra');
    const temple = live.sites.find(s => s.id === 'jagdish-temple')!;
    expect(temple.label).toBe('packed');
    expect(temple.events.map(e => e.id)).toEqual(['rath-yatra']);
    expect(live.sites[0].level! >= temple.level!).toBe(true);
    expect(live.sites.find(s => s.id === 'badi-lake')!.events).toEqual([]);
  });
});

describe('Heritage Ops follows the festival', () => {
  test('the sample squads turn up for the Rath Yatra when the temple is usually closed', () => {
    const squadsAt = (date: string) => sampleStops('Udaipur', date).filter(s => s.siteId === 'jagdish-temple' && s.minutes >= at(14) && s.minutes < at(16)).length;
    expect(squadsAt(RATH_YATRA) > 0).toBe(true);
    expect(squadsAt('2027-07-06')).toBe(0);
  });
  test('an ordinary day’s sample is untouched by the event layer', () => {
    const stops = sampleStops('Udaipur', ORDINARY);
    expect(stops.filter(s => s.siteId === 'city-palace' && s.minutes >= at(10) && s.minutes < at(12)).length > 30).toBe(true);
  });
});
