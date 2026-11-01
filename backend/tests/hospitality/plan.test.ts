import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { DISHES, resolve, SLOT_ORDER, specialFor, thaliFor } from '../../src/hospitality/dishes.ts';
import { greenScore, tierFor } from '../../src/hospitality/green.ts';
import { FARMS, HOST_BY_ID, HOSTS, farmsOf, haversineKm, roadKm } from '../../src/hospitality/partners.ts';
import {
  addDays, buildProcurement, dateLabel, daysBetween, dishNeeds, foodMiles, forecastDay, istDate, normaliseMix, orderKgFor, orderMessage, supplierFor,
  walkInBaseline, wasteAvoided, whatsappLink, WHOLESALE_KM, type Booking,
} from '../../src/hospitality/plan.ts';
import { greensName, ingredient, INGREDIENTS, isAvailable, isFresh, MONTH_NOTES } from '../../src/hospitality/produce.ts';
import { dietOf, squadFrom } from '../../src/hospitality/store.ts';
import { describeMix, splitMix } from '../../src/hospitality/types.ts';

const haveli = HOST_BY_ID.get('kesar-pol-haveli')!;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', hostId: haveli.id, tripId: 't1', group: 'Goa Gang', date: '2026-11-02', meal: 'dinner', time: '08:00 PM',
  headcount: 6, dietary: { veg: 4, jain: 2, vegan: 0 }, note: '', ...over,
});

describe('the produce calendar', () => {
  test('stored harvests are available all year, fresh produce only in its season, dairy always, oil never from a farm', () => {
    expect(isAvailable('makki', 6)).toBe(true);
    expect(isFresh('makki', 6)).toBe(false);
    expect(isFresh('makki', 10)).toBe(true);
    expect(isAvailable('tinda', 12)).toBe(false);
    expect(isAvailable('tinda', 6)).toBe(true);
    expect(isAvailable('dahi', 12)).toBe(true);
    expect(isAvailable('oil', 6)).toBe(false);
  });
  test('greens change with the season', () => {
    expect(greensName(12)).toBe('Methi, palak & bathua');
    expect(greensName(8)).toBe('Chaulai & lal saag');
    expect(greensName(5)).toBe('Seasonal greens');
  });
  test('every month has a note and a thali name', () => {
    for (const month of MONTHS) expect(Boolean(MONTH_NOTES[month]?.note && MONTH_NOTES[month].thali)).toBe(true);
  });
  test('Jain and vegan flags follow the food: onion, garlic, potato are not Jain, dairy is not vegan', () => {
    expect([ingredient('onion').jain, ingredient('garlic').jain, ingredient('potato').jain]).toEqual([false, false, false]);
    expect([ingredient('ghee').vegan, ingredient('dahi').vegan, ingredient('paneer').vegan]).toEqual([false, false, false]);
    expect(INGREDIENTS.length > 15).toBe(true);
  });
});

describe('dishes and the monthly thali', () => {
  test('every month gets six in-season dishes in thali order, with the main and a sweet', () => {
    for (const month of MONTHS) {
      const thali = thaliFor(month);
      expect(thali.map(d => d.slot)).toEqual(SLOT_ORDER);
      for (const dish of thali) expect(dish.months.includes(month)).toBe(true);
      expect(thali.some(d => d.id === 'dal-baati-churma')).toBe(true);
      expect(thali.some(d => d.id === 'lapsi')).toBe(true);
      expect(new Set(thali.map(d => d.id)).size).toBe(6);
    }
  });
  test('the thali follows the farms: makki ki raab in November, tinda in June, no winter saag in the heat', () => {
    expect(thaliFor(11).some(d => d.id === 'makki-ki-raab')).toBe(true);
    expect(thaliFor(6).some(d => d.id === 'tinda-masala')).toBe(true);
    expect(thaliFor(6).some(d => d.id === 'makki-roti-saag')).toBe(false);
  });
  test('each month’s special is in season, at its peak, and in that month’s thali or on offer', () => {
    for (const month of MONTHS) {
      const special = specialFor(month);
      expect(special.months.includes(month)).toBe(true);
      expect(special.peak.includes(month)).toBe(true);
    }
  });
  test('there are a dozen dishes, each with a story, a tip and a portion of ingredients', () => {
    expect(DISHES.length).toBe(12);
    for (const dish of DISHES) {
      expect(dish.story.length > 30 && dish.zeroWaste.length > 20).toBe(true);
      expect(dish.serving.length > 1).toBe(true);
    }
  });
  test('Jain guests get paneer in the mirchi vada and no garlic in the dal; vegans skip kadhi', () => {
    const vada = DISHES.find(d => d.id === 'mirchi-vada')!;
    const jain = resolve(vada, 'jain');
    expect(jain.ok && jain.serving.some(s => s.ingredient === 'paneer') && !jain.serving.some(s => s.ingredient === 'potato')).toBe(true);
    const dbc = resolve(DISHES.find(d => d.id === 'dal-baati-churma')!, 'jain');
    expect(dbc.ok && !dbc.serving.some(s => s.ingredient === 'garlic')).toBe(true);
    expect(resolve(DISHES.find(d => d.id === 'rajasthani-kadhi')!, 'vegan').ok).toBe(false);
  });
  test('whatever a diet is served never contains an ingredient that diet can’t eat', () => {
    for (const dish of DISHES) {
      for (const diet of ['jain', 'vegan'] as const) {
        const served = resolve(dish, diet);
        if (served.ok) for (const s of served.serving) expect(ingredient(s.ingredient)[diet]).toBe(true);
      }
    }
  });
});

describe('partners', () => {
  test('there are four hosts and six farms in real places, and every host farm exists', () => {
    expect(HOSTS.length).toBe(4);
    expect(FARMS.length).toBe(6);
    for (const host of HOSTS) for (const id of host.farmIds) expect(FARMS.some(f => f.id === id)).toBe(true);
    expect(FARMS.map(f => f.village)).toEqual(['Badgaon', 'Bhuwana', 'Eklingji', 'Gogunda', 'Kaladwas', 'Sisarma']);
    expect(HOSTS.map(h => h.area)).toEqual(['Gangaur Ghat', 'Lal Ghat', 'Ambamata', 'Fateh Sagar']);
  });
  test('distances are sensible road estimates: the highway village is near, the hill village far', () => {
    const km = Object.fromEntries(farmsOf(haveli).map(f => [f.farm.village, f.km]));
    expect(km.Bhuwana < km.Badgaon && km.Badgaon < km.Eklingji && km.Eklingji < km.Gogunda).toBe(true);
    expect(km.Eklingji >= 20 && km.Eklingji <= 26).toBe(true);
    expect(km.Gogunda >= 33 && km.Gogunda <= 45).toBe(true);
    expect(Math.round(haversineKm(0, 0, 0, 1))).toBe(111);
    expect(roadKm(haveli, FARMS[0]) >= 1).toBe(true);
  });
  test('the nearest partner that grows an ingredient in season supplies it', () => {
    expect(supplierFor(haveli, 'makki', 11)?.farm.village).toBe('Badgaon');
    expect(supplierFor(haveli, 'wheat', 6)?.farm.village).toBe('Bhuwana');
    expect(supplierFor(haveli, 'tinda', 12)).toBe(null);
    expect(supplierFor(haveli, 'jaggery', 11)).toBe(null);
    // Pal Rasoi has no Badgaon farm, so its makki comes through the market
    expect(supplierFor(HOST_BY_ID.get('pal-rasoi')!, 'makki', 11)).toBe(null);
  });
});

describe('dates', () => {
  test('the date in India: 8 PM UTC on 31 Oct is already 1 Nov', () => {
    expect(istDate(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01');
    expect(istDate(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01');
  });
  test('add days, count days, label', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02');
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(dateLabel('2026-11-02')).toBe('Mon, 2 Nov');
  });
});

describe('demand', () => {
  test('the walk-in baseline is steady for a day, never negative, and dimmer in the summer heat', () => {
    expect(walkInBaseline(haveli, '2026-11-03', 'dinner')).toBe(walkInBaseline(haveli, '2026-11-03', 'dinner'));
    const days = (from: string) => Array.from({ length: 28 }, (_, i) => addDays(from, i));
    const sum = (dates: string[]) => dates.reduce((s, d) => s + walkInBaseline(haveli, d, 'dinner') + walkInBaseline(haveli, d, 'lunch'), 0);
    expect(sum(days('2026-05-04')) < sum(days('2026-11-23'))).toBe(true);
    expect(days('2026-11-01').every(d => walkInBaseline(haveli, d, 'lunch') >= 0)).toBe(true);
  });
  test('a squad’s booking adds its covers on top of the baseline and shows its diets', () => {
    const without = forecastDay(haveli, '2026-11-02', []);
    const withSquad = forecastDay(haveli, '2026-11-02', [booking()]);
    expect(withSquad.booked).toBe(6);
    expect(withSquad.covers - without.covers).toBe(6);
    expect(withSquad.meals.dinner.bookings).toHaveLength(1);
    expect(withSquad.diets.booked).toEqual({ veg: 4, jain: 2, vegan: 0 });
    expect(withSquad.diets.total.jain >= 2).toBe(true);
    expect(withSquad.diets.walkIn.veg + withSquad.diets.walkIn.jain + withSquad.diets.walkIn.vegan).toBe(withSquad.walkIn);
  });
  test('walk-ins only fill the seats the squads left', () => {
    const full = forecastDay(haveli, '2026-11-02', [booking({ headcount: 38 })]);
    expect(full.meals.dinner.covers).toBe(haveli.capacity);
    expect(full.meals.dinner.walkIn).toBe(2);
  });
  test('diet counts always add up to the headcount, capped sensibly', () => {
    expect(normaliseMix({ jain: 2 }, 6)).toEqual({ veg: 4, jain: 2, vegan: 0 });
    expect(normaliseMix({ jain: 9, vegan: 9 }, 6)).toEqual({ veg: 0, jain: 6, vegan: 0 });
    expect(normaliseMix(undefined, 5)).toEqual({ veg: 5, jain: 0, vegan: 0 });
    expect(normaliseMix({ jain: -3, vegan: 1.9 }, 4)).toEqual({ veg: 3, jain: 0, vegan: 1 });
  });
  test('splitMix keeps whole people and the total', () => {
    const mix = splitMix(40, { veg: 0.9, jain: 0.07, vegan: 0.03 });
    expect(mix.veg + mix.jain + mix.vegan).toBe(40);
    expect(describeMix({ veg: 3, jain: 2, vegan: 1 })).toBe('2 Jain · 1 vegan');
    expect(describeMix({ veg: 3, jain: 0, vegan: 0 })).toBe('');
  });
});

describe('the procurement list', () => {
  const mix = { veg: 36, jain: 2, vegan: 2 };
  const days = (extra = { veg: 0, jain: 0, vegan: 0 }) => [{ month: 11, total: { veg: mix.veg + extra.veg, jain: mix.jain + extra.jain, vegan: mix.vegan + extra.vegan }, booked: extra }];

  test('kilos follow the thali: 40 covers of November need about a kilo each', () => {
    const plan = buildProcurement(haveli, days());
    expect(plan.covers).toBe(40);
    expect(plan.totalKg > 30 && plan.totalKg < 45).toBe(true);
    const needs = dishNeeds(thaliFor(11), mix);
    const sum = [...needs.values()].reduce((s, kg) => s + kg, 0);
    expect(Math.abs(sum - plan.totalKg) < 0.5).toBe(true);
  });
  test('every item sits with a farm that grows it in season, grouped nearest first', () => {
    const plan = buildProcurement(haveli, days());
    expect(plan.farms.length >= 4).toBe(true);
    const kms = plan.farms.map(f => f.km);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    for (const order of plan.farms) {
      const farm = FARMS.find(f => f.id === order.farmId)!;
      for (const item of order.items) {
        expect(farm.produce.includes(item.ingredientId)).toBe(true);
        expect(isAvailable(item.ingredientId, 11)).toBe(true);
      }
    }
    const badgaon = plan.farms.find(f => f.village === 'Badgaon')!;
    expect(badgaon.items.some(i => i.ingredientId === 'makki') && badgaon.items.some(i => i.ingredientId === 'greens')).toBe(true);
  });
  test('what no partner supplies goes to the market with the reason', () => {
    const plan = buildProcurement(haveli, days());
    expect(plan.market.find(i => i.ingredientId === 'jaggery')?.reason).toBe('no-partner');
    const summer = buildProcurement(haveli, [{ month: 6, total: mix, booked: { veg: 0, jain: 0, vegan: 0 } }]);
    expect(summer.market.find(i => i.ingredientId === 'greens' || i.ingredientId === 'green-chilli')?.reason).toBe('out-of-season');
    // Vegan guests need oil, which no farm sells
    expect(plan.market.find(i => i.ingredientId === 'oil')?.reason).toBe('pantry');
  });
  test('a squad’s booking grows the list and is counted as squad kilos', () => {
    const before = buildProcurement(haveli, days());
    const after = buildProcurement(haveli, [{ month: 11, total: { veg: 40, jain: 4, vegan: 2 }, booked: { veg: 4, jain: 2, vegan: 0 } }]);
    expect(after.totalKg > before.totalKg).toBe(true);
    expect(before.squadKg).toBe(0);
    expect(after.squadKg > 4).toBe(true);
  });
  test('Jain guests swap potato for paneer in the vada, so paneer shows up in a summer plan', () => {
    const jainPlan = buildProcurement(haveli, [{ month: 8, total: { veg: 0, jain: 10, vegan: 0 }, booked: { veg: 0, jain: 0, vegan: 0 } }]);
    const all = [...jainPlan.farms.flatMap(f => f.items), ...jainPlan.market].map(i => i.ingredientId);
    expect(all.includes('paneer') && !all.includes('potato') && !all.includes('garlic')).toBe(true);
  });
  test('orders round up to the next half kilo', () => {
    expect(orderKgFor(2.1)).toBe(2.5);
    expect(orderKgFor(2)).toBe(2);
    expect(orderKgFor(0.1)).toBe(0.5);
  });
  test('the local share is a fraction, and a host with no partners buys everything at the market', () => {
    const plan = buildProcurement(haveli, days());
    expect(plan.localShare > 0.6 && plan.localShare <= 1).toBe(true);
    const bare = buildProcurement({ ...haveli, farmIds: [] }, days());
    expect(bare.localShare).toBe(0);
    expect(bare.farms).toHaveLength(0);
    expect(foodMiles(bare).savedPercent).toBe(0);
  });
});

describe('food miles and waste', () => {
  const plan = buildProcurement(haveli, [{ month: 11, total: { veg: 250, jain: 15, vegan: 5 }, booked: { veg: 4, jain: 2, vegan: 0 } }]);

  test('farm-direct food travels a fraction of the wholesale distance', () => {
    const miles = foodMiles(plan);
    expect(miles.baselineKm).toBe(WHOLESALE_KM);
    expect(miles.avgKm > 5 && miles.avgKm < WHOLESALE_KM / 3).toBe(true);
    expect(miles.savedPercent > 60 && miles.savedPercent < 100).toBe(true);
    expect(miles.savedTonneKm > 0 && miles.co2eSavedKg > 0).toBe(true);
  });
  test('waste avoided comes from cooking squads to count and ordering produce to the forecast', () => {
    const none = wasteAvoided({ ...plan, squadKg: 0 }, 0, 11);
    expect(none.overproductionKg).toBe(0);
    expect(none.spoilageKg > 0).toBe(true);
    const some = wasteAvoided(plan, 6, 11);
    expect(some.overproductionKg > 0).toBe(true);
    expect(some.avoidedKg).toBe(Math.round((some.overproductionKg + some.spoilageKg) * 10) / 10);
    const more = wasteAvoided({ ...plan, squadKg: plan.squadKg * 10 }, 60, 11);
    expect(more.avoidedKg > some.avoidedKg).toBe(true);
    // Roughly a seventh of a kilo per squad cover: a ~0.9 kg thali × (22% − 6%)
    expect(some.kgPerBookedCover > 0.1 && some.kgPerBookedCover < 0.2).toBe(true);
  });
});

describe('orders on WhatsApp', () => {
  test('the message names the kitchen, the dates and each ingredient in kilos, and the link only pre-fills it', () => {
    const plan = buildProcurement(haveli, [{ month: 11, total: { veg: 40, jain: 0, vegan: 0 }, booked: { veg: 6, jain: 0, vegan: 0 } }]);
    const order = plan.farms.find(f => f.village === 'Badgaon')!;
    const text = orderMessage(haveli, order, { from: '2026-11-02', to: '2026-11-08' }, 280, 6);
    expect(text.includes('Namaste Hariyali Dhani')).toBe(true);
    expect(text.includes('Kesar Pol Haveli, Gangaur Ghat')).toBe(true);
    expect(text.includes('Mon, 2 Nov to Sun, 8 Nov')).toBe(true);
    expect(text.includes('Makki (maize flour):')).toBe(true);
    expect(text.includes('including 6 from squads')).toBe(true);
    const link = whatsappLink(text);
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe(text);
  });
});

describe('the Green Host score', () => {
  const perfect = { ...haveli, practices: { plasticFree: 'full', waterRefill: 'free', composts: true, wasteKgPerCover: 0.05 } } as typeof haveli;

  test('four parts add up to the score, and a perfect kitchen scores 100', () => {
    const green = greenScore(perfect, 0.95);
    expect(green.score).toBe(100);
    expect(green.tier).toBe('Gold');
    expect(green.parts.map(p => p.max)).toEqual([40, 30, 15, 15]);
    expect(green.parts.reduce((s, p) => s + p.points, 0)).toBe(100);
    expect(green.nextStep).toBe(null);
  });
  test('the sample hosts spread across the tiers this month and always score 0–100', () => {
    const scores = HOSTS.map(h => greenScore(h, buildProcurement(h, [{ month: 11, total: { veg: 100, jain: 0, vegan: 0 }, booked: { veg: 0, jain: 0, vegan: 0 } }]).localShare));
    for (const g of scores) expect(g.score >= 0 && g.score <= 100).toBe(true);
    expect(scores[0].score > scores[3].score).toBe(true);
    expect(new Set(scores.map(s => s.tier)).size >= 3).toBe(true);
  });
  test('tiers', () => {
    expect([tierFor(90), tierFor(75), tierFor(60), tierFor(30)]).toEqual(['Gold', 'Silver', 'Bronze', 'Starter']);
  });
  test('the next step is the part with the most points left', () => {
    const plastic = greenScore({ ...perfect, practices: { ...perfect.practices, plasticFree: 'no', waterRefill: 'free' } } as typeof haveli, 0.95);
    expect(plastic.nextStep?.part).toBe('plastic');
    expect(plastic.nextStep?.points).toBe(15);
  });
  test('logged leftovers replace the reported figure, once there are three days of them', () => {
    const reported = greenScore(perfect, 0.95);
    expect(greenScore(perfect, 0.95, { perCoverKg: 0.2, days: 2 }).score).toBe(reported.score);
    const logged = greenScore(perfect, 0.95, { perCoverKg: 0.2, days: 5 });
    expect(logged.score < reported.score).toBe(true);
    expect(logged.parts[1].detail.includes('logged over 5 days')).toBe(true);
  });
});

describe('diets from profiles', () => {
  test('an explicit diet, or what the member told GhoomMate, wins; everyone else is vegetarian', () => {
    expect(dietOf({ diet: 'Jain' })).toBe('jain');
    expect(dietOf({ ghoomate: { notes: [{ text: 'vegetarian' }, { text: 'I am Jain' }] } })).toBe('jain');
    expect(dietOf({ ghoomate: { notes: [{ text: 'vegan, no dairy' }] } })).toBe('vegan');
    expect(dietOf({ ghoomate: { notes: [{ text: 'not a morning person' }] } })).toBe('veg');
    expect(dietOf(null)).toBe('veg');
    expect(dietOf({ diet: 42, ghoomate: { notes: 'x' } })).toBe('veg');
  });
  test('a squad is the count of its members’ diets', () => {
    expect(squadFrom([{ diet: 'jain' }, {}, { ghoomate: { notes: [{ text: 'vegan' }] } }, {}])).toEqual({ members: 4, diets: { veg: 2, jain: 1, vegan: 1 } });
  });
});
