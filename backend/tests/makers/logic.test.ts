import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { CRAFT_BY_ID, CRAFTS, ITEM_SIZES } from '../../src/makers/crafts.ts';
import { MAKER_BY_ID, MAKERS } from '../../src/makers/makers.ts';
import {
  availabilityFor, bestFaq, driveMinutes, fairPriceCheck, faqFor, groundingFacts, haversineKm, indiaNow, inr, isIsoDate,
  listMakers, nearestRoute, niceRound, normaliseSlot, routeFrom, slotMinutes, stopNotes, summarise, tagsFor, walkMinutes,
} from '../../src/makers/logic.ts';
import { matchSite } from '../../src/heritage/crowd.ts';
import { SITE_BY_ID } from '../../src/heritage/sites.ts';

const maker = (id: string) => MAKER_BY_ID.get(id)!;
// Sun 1 Nov 2026, 11:30 AM IST
const NOW = new Date('2026-11-01T06:00:00Z');

describe('the curated catalogue', () => {
  test('14 crafts and 16 makers, with unique ids', () => {
    expect(CRAFTS).toHaveLength(14);
    expect(MAKERS).toHaveLength(16);
    expect(new Set(CRAFTS.map(c => c.id)).size).toBe(14);
    expect(new Set(MAKERS.map(m => m.id)).size).toBe(16);
  });

  test('every craft explains itself and has three rising price bands', () => {
    for (const craft of CRAFTS) {
      expect(craft.steps.length >= 4).toBe(true);
      expect(craft.authentic.length >= 3).toBe(true);
      expect(craft.machineMade.length >= 3).toBe(true);
      expect(craft.hindi.length > 0).toBe(true);
      expect(craft.cover).toBe(`/makers/${craft.id}.jpg`);
      expect(craft.prices.map(p => p.size)).toEqual([...ITEM_SIZES]);
      for (const band of craft.prices) expect(band.min > 0 && band.max > band.min).toBe(true);
      // A bigger piece never costs less than a smaller one
      for (let i = 1; i < 3; i++) expect(craft.prices[i].min >= craft.prices[i - 1].max * 0.9).toBe(true);
    }
  });

  test('only the five crafts verified in the GI Registry carry a tag, each with a source', () => {
    const tagged = CRAFTS.filter(c => c.gi).map(c => c.id).sort();
    expect(tagged).toEqual(['kathputli', 'koftgari', 'molela', 'pichwai', 'thewa']);
    for (const craft of CRAFTS) if (craft.gi) expect(craft.gi.source.startsWith('https://')).toBe(true);
  });

  test('every maker points at real crafts, has a sensible workshop and sits in the Udaipur region', () => {
    for (const m of MAKERS) {
      for (const id of m.craftIds) expect(CRAFT_BY_ID.has(id)).toBe(true);
      expect(m.workshop.minPeople >= 2 && m.workshop.maxPeople >= m.workshop.minPeople).toBe(true);
      expect(m.workshop.pricePerPerson > 0 && m.workshop.durationMin >= 60).toBe(true);
      expect(m.languages.length > 0 && m.faq.length >= 2).toBe(true);
      expect(m.lat > 24.4 && m.lat < 25.1 && m.lng > 73.5 && m.lng < 74.4).toBe(true);
      for (const week of m.workshop.weekly) for (const time of week.times) expect(normaliseSlot(time)).toBe(time);
    }
    expect(MAKERS.filter(m => m.womenLed).length >= 4).toBe(true);
  });

  test('a workshop stop never reads as a heritage site, so it never gets a crowd forecast of its own', () => {
    for (const m of MAKERS) {
      const notes = stopNotes(m, m.workshop.minPeople, m.workshop.minPeople * m.workshop.pricePerPerson, '');
      expect(notes.length < 2000).toBe(true);
      expect(`${m.workshop.title} with ${m.name.split(' ')[0]}`.length < 200).toBe(true);
      expect(matchSite(`${m.workshop.title} with ${m.name.split(' ')[0]}`, m.stopPlace, 'Udaipur')).toBe(null);
    }
  });
});

describe('distance and getting there', () => {
  test('haversine matches the heritage data: City Palace to Jagdish Temple is about 370 m', () => {
    const km = haversineKm(SITE_BY_ID.get('city-palace')!, SITE_BY_ID.get('jagdish-temple')!);
    expect(km > 0.35 && km < 0.39).toBe(true);
  });

  test('walking and driving times', () => {
    expect(walkMinutes(0.34)).toBe(6);
    expect(walkMinutes(0)).toBe(1);
    expect(driveMinutes(42.7)).toBe(75);
    expect(driveMinutes(1) % 5).toBe(0);
  });

  test('the demo maker is a 6-minute walk from City Palace', () => {
    const route = routeFrom(maker('mahendra-chitera'), 'city-palace');
    expect(route.mode).toBe('walk');
    expect(route.minutes).toBe(6);
  });

  test('a studio near a site is measured from that site; a village from City Palace', () => {
    expect(nearestRoute(maker('rafiq-ahmed')).siteId).toBe('jagdish-temple');
    expect(nearestRoute(maker('ramprasad-jangid')).siteId).toBe('shilpgram');
    const village = nearestRoute(maker('geeta-prajapat'));
    expect(village.siteId).toBe('city-palace');
    expect(village.mode).toBe('drive');
    expect(tagsFor(maker('geeta-prajapat')).includes('Day trip')).toBe(true);
    expect(tagsFor(maker('mahendra-chitera')).includes('Day trip')).toBe(false);
    expect(tagsFor(maker('mahendra-chitera'))[0]).toBe('4th generation');
  });
});

describe('listing makers', () => {
  test('filters by craft and keeps makers with a second craft', () => {
    const miniature = listMakers({ craft: 'miniature' }).map(m => m.id).sort();
    expect(miniature).toEqual(['dwarkesh-bhatt', 'kavita-sharma', 'lalit-vyas', 'mahendra-chitera']);
    expect(listMakers({ craft: 'silver' }).map(m => m.id).sort()).toEqual(['naresh-sonigara', 'sarita-soni']);
    expect(listMakers({ craft: 'nope' })).toHaveLength(0);
    expect(listMakers()).toHaveLength(16);
  });

  test('near a site, the closest makers come first and each carries its distance', () => {
    const list = listMakers({ near: 'city-palace' });
    expect(list[0].id).toBe('mahendra-chitera');
    const km = list.map(m => m.fromSite!.km);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
    // Village makers sort last
    expect(list.slice(-3).every(m => m.fromSite!.mode === 'drive' && m.tags.includes('Day trip'))).toBe(true);
  });

  test('near plus a craft, and a radius for the “makers nearby” strip', () => {
    expect(listMakers({ craft: 'miniature', near: 'city-palace' })[0].id).toBe('mahendra-chitera');
    const close = listMakers({ near: 'city-palace', maxKm: 1.5 });
    expect(close.length >= 8 && close.every(m => m.fromSite!.km <= 1.5)).toBe(true);
    expect(close.some(m => m.id === 'geeta-prajapat')).toBe(false);
  });

  test('a summary carries what a card needs', () => {
    const s = summarise(maker('pushpa-chhipa'), 'city-palace');
    expect(s.crafts[0].name).toBe('Dabu mud-resist print');
    expect(s.workshop.pricePerPerson).toBe(850);
    expect(s.womenLed).toBe(true);
    expect(s.fromSite?.siteName).toBe('City Palace');
  });
});

describe('fair price check', () => {
  test('the ₹2,500 “antique” miniature is a tourist price for a small or a medium piece', () => {
    for (const size of ['small', 'medium'] as const) {
      const check = fairPriceCheck('miniature', size, 2500, { antique: true });
      expect(check.verdict).toBe('tourist-price');
      expect(check.headline).toBe('Tourist price');
      expect(check.antiqueNote?.includes('ASI')).toBe(true);
      expect(check.counter !== null && check.counter >= check.fair.min && check.counter < 2500).toBe(true);
      expect(check.walkAway).toBe(check.fair.max);
      expect(check.overBy).toBe(2500 - check.fair.max);
    }
    expect(fairPriceCheck('miniature', 'small', 2500).multiple).toBe(3.1);
  });

  test('the same quote is fair for a large, finely detailed piece', () => {
    const check = fairPriceCheck('miniature', 'large', 2500);
    expect(check.verdict).toBe('fair');
    expect(check.counter).toBe(null);
    expect(check.antiqueNote).toBe(null);
  });

  test('verdict thresholds: fair up to 10% over, a bit high up to 30% over, then a tourist price', () => {
    // Medium miniature: ₹800 to ₹1,800
    expect(fairPriceCheck('miniature', 'medium', 1800).verdict).toBe('fair');
    expect(fairPriceCheck('miniature', 'medium', 1980).verdict).toBe('fair');
    expect(fairPriceCheck('miniature', 'medium', 1981).verdict).toBe('a-bit-high');
    expect(fairPriceCheck('miniature', 'medium', 2340).verdict).toBe('a-bit-high');
    expect(fairPriceCheck('miniature', 'medium', 2341).verdict).toBe('tourist-price');
  });

  test('a suspiciously low price is flagged as probably not handmade', () => {
    const check = fairPriceCheck('miniature', 'small', 100);
    expect(check.verdict).toBe('too-low');
    expect(check.counter).toBe(null);
    expect(fairPriceCheck('miniature', 'small', 180).verdict).toBe('fair');
  });

  test('the counter-offer sits inside the fair range and below the quote, for every craft and size', () => {
    for (const craft of CRAFTS) {
      for (const band of craft.prices) {
        const check = fairPriceCheck(craft.id, band.size, band.max * 4);
        expect(check.verdict).toBe('tourist-price');
        expect(check.counter !== null && check.counter >= band.min && check.counter <= band.max).toBe(true);
        expect(fairPriceCheck(craft.id, band.size, Math.round((band.min + band.max) / 2)).verdict).toBe('fair');
      }
    }
  });

  test('rejects things that are not a craft, a size or a price', () => {
    expect(() => fairPriceCheck('nope', 'small', 100)).toThrow();
    expect(() => fairPriceCheck('miniature', 'huge' as never, 100)).toThrow();
    expect(() => fairPriceCheck('miniature', 'small', 0)).toThrow();
  });

  test('rounding and rupee formatting', () => {
    expect(niceRound(1234)).toBe(1250);
    expect(niceRound(437)).toBe(440);
    expect(niceRound(12345)).toBe(12300);
    expect(niceRound(48750)).toBe(49000);
    expect(inr(124500)).toBe('₹1,24,500');
  });
});

describe('workshop slots', () => {
  const mahendra = maker('mahendra-chitera');

  test('open on a working day with his three sessions, in time order', () => {
    const day = availabilityFor(mahendra, '2026-11-12', {}, NOW);
    expect(day.open).toBe(true);
    expect(day.slots.map(s => s.time)).toEqual(['10:30 AM', '12:30 PM', '04:00 PM']);
    expect(day.slots.every(s => s.available && s.spotsLeft === 8)).toBe(true);
  });

  test('closed on his weekly day off and on Diwali', () => {
    const sunday = availabilityFor(mahendra, '2026-11-15', {}, NOW);
    expect(sunday.open).toBe(false);
    expect(sunday.closedReason).toBe('Closed on Sundays');
    const diwali = availabilityFor(mahendra, '2026-11-08', {}, NOW);
    expect(diwali.open).toBe(false);
    expect(diwali.closedReason?.startsWith('Diwali')).toBe(true);
  });

  test('other squads’ bookings use up spots, and a slot too small for the minimum group is full', () => {
    const day = availabilityFor(mahendra, '2026-11-12', { '10:30 AM': 5, '12:30 PM': 7 }, NOW);
    expect(day.slots[0]).toEqual({ time: '10:30 AM', spotsLeft: 3, available: true, reason: null });
    // 1 spot left, but the minimum group is 2
    expect(day.slots[1]).toEqual({ time: '12:30 PM', spotsLeft: 1, available: false, reason: 'full' });
  });

  test('past days and sessions starting within three hours are closed', () => {
    expect(availabilityFor(mahendra, '2026-10-30', {}, NOW).slots.every(s => s.reason === 'past')).toBe(true);
    // Mon 2 Nov 2026, 9:00 AM IST: the 10:30 session is 90 minutes away, the 12:30 one is 3.5 hours away
    const monday = availabilityFor(mahendra, '2026-11-02', {}, new Date('2026-11-02T03:30:00Z'));
    expect(monday.slots.map(s => s.available)).toEqual([false, true, true]);
    expect(monday.slots[0].reason).toBe('past');
  });

  test('times and dates are parsed strictly', () => {
    expect(normaliseSlot('10:30 am')).toBe('10:30 AM');
    expect(normaliseSlot('4:00 PM')).toBe('04:00 PM');
    expect(normaliseSlot('16:00')).toBe(null);
    expect(normaliseSlot('13:00 PM')).toBe(null);
    expect(normaliseSlot(5)).toBe(null);
    expect(slotMinutes('04:00 PM')).toBe(16 * 60);
    expect(slotMinutes('12:30 AM')).toBe(30);
    expect(isIsoDate('2026-11-12')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('12/11/2026')).toBe(false);
    expect(indiaNow(NOW)).toEqual({ date: '2026-11-01', minutes: 11 * 60 + 30 });
  });
});

describe('answering questions from the facts', () => {
  const mahendra = maker('mahendra-chitera');

  test('picks the matching curated answer', () => {
    expect(bestFaq(mahendra, 'Is it okay for kids?')?.q).toBe('Can children join?');
    expect(bestFaq(mahendra, 'how do I spot a fake one')?.q).toBe('How do I spot the real thing?');
    expect(bestFaq(mahendra, 'what will it cost for 6 of us')?.q).toBe('What does it cost?');
    expect(bestFaq(mahendra, 'is it GI tagged?')?.q).toBe('Does it have a GI tag?');
    expect(bestFaq(mahendra, 'Do we need to know how to draw?')?.q).toBe('Do we need to know how to draw?');
  });

  test('says nothing when nothing matches', () => {
    expect(bestFaq(mahendra, 'does the studio have wifi')).toBe(null);
    expect(bestFaq(mahendra, '   ')).toBe(null);
  });

  test('every maker has answers to the basics, with their real numbers in them', () => {
    for (const m of MAKERS) {
      const faq = faqFor(m);
      expect(faq.find(f => f.q === 'What does it cost?')!.a.includes(inr(m.workshop.pricePerPerson))).toBe(true);
      expect(faq.find(f => f.q === 'How many people can come?')!.a).toBe(`${m.workshop.minPeople} to ${m.workshop.maxPeople} people per session.`);
      expect(faq.every(f => f.a.trim().length > 0 && !f.a.includes('undefined'))).toBe(true);
    }
  });

  test('the facts handed to Gemini carry the maker, the craft and the workshop', () => {
    const facts = groundingFacts(mahendra);
    expect(facts.includes('Mahendra Chitera')).toBe(true);
    expect(facts.includes('Mewar miniature painting')).toBe(true);
    expect(facts.includes('₹750 per person')).toBe(true);
    expect(facts.includes('undefined')).toBe(false);
  });
});
