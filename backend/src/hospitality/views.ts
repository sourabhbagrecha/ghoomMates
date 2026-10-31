// Shapes the module's data into API responses: host cards and detail for travellers, the forecast and waste trend
// for the host's dashboard. Pure; the router fetches reservations and logs and passes them in.
import { DISH_BY_ID, specialFor, type Dish } from './dishes.ts';
import { greenScore, type Green, type MeasuredWaste } from './green.ts';
import { curatedMenu } from './menu.ts';
import { farmsOf, HOST_KIND_LABEL, roadKm, type Farm, type Host } from './partners.ts';
import {
  addDays, buildProcurement, dateLabel, foodMiles, forecastDay, forecastDays, monthOf, orderMessage, supplierFor, thaliKg, typicalPlan, wasteAvoided,
  whatsappLink, OPEN_BUFFET_SURPLUS, WHOLESALE_KM, type Booking, type DayForecast,
} from './plan.ts';
import { ingredient, ingredientName, isAvailable, isFresh, MONTH_NAMES, MONTH_NOTES } from './produce.ts';
import { addMix, emptyMix, MEAL_INFO, MEALS, mixTotal } from './types.ts';
import type { WasteLog } from './store.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The seasonal ingredient a dish is known for this month, and the partner farm it comes from */
function keySupply(host: Host, dish: Dish, month: number) {
  const candidates = dish.serving.map(s => s.ingredient);
  const id = candidates.find(c => isFresh(c, month) && ingredient(c).group !== 'dairy' && supplierFor(host, c, month))
    ?? candidates.find(c => supplierFor(host, c, month));
  const supplier = id && supplierFor(host, id, month);
  return id && supplier ? { ingredient: ingredientName(id, month), farm: supplier.farm.name, village: supplier.farm.village, km: supplier.km } : null;
}

export function measuredWaste(logs: WasteLog[]): MeasuredWaste | null {
  const counted = logs.filter(l => l.covers > 0);
  if (!counted.length) return null;
  const covers = counted.reduce((sum, l) => sum + l.covers, 0);
  return { perCoverKg: round2(counted.reduce((sum, l) => sum + l.leftoverKg, 0) / covers), days: counted.length };
}

export function hostCard(host: Host, month: number, logs: WasteLog[] = []) {
  const typical = typicalPlan(host, month);
  const localShare = typical.localShare;
  const special = specialFor(month);
  return {
    id: host.id,
    name: host.name,
    kind: host.kind,
    kindLabel: HOST_KIND_LABEL[host.kind],
    area: host.area,
    lat: host.lat,
    lng: host.lng,
    tagline: host.tagline,
    image: host.image,
    pricePerThali: host.pricePerThali,
    meals: host.meals,
    green: greenScore(host, localShare, measuredWaste(logs)),
    sourcing: {
      farms: farmsOf(host).length,
      localShare: round2(localShare),
      avgKm: foodMiles(typical).avgKm,
      wholesaleKm: WHOLESALE_KM,
    },
    special: { id: special.id, name: special.name, hindi: special.hindi, supply: keySupply(host, special, month) },
  };
}

export type HostCard = ReturnType<typeof hostCard>;

function farmView(host: Host, farm: Farm, month: number) {
  return {
    id: farm.id, name: farm.name, village: farm.village, km: roadKm(host, farm), organic: farm.organic, practice: farm.practice, story: farm.story, image: farm.image,
    produce: farm.produce.map(id => ({
      id, name: ingredientName(id, month),
      // fresh = coming off the fields this month; stored = last harvest kept; off = not available this month
      status: isFresh(id, month) ? 'fresh' as const : isAvailable(id, month) ? 'stored' as const : 'off' as const,
    })),
  };
}

export function hostDetail(host: Host, month: number, logs: WasteLog[] = []) {
  const menu = curatedMenu(host, { date: '', month, covers: 1, mix: { veg: 1, jain: 0, vegan: 0 } });
  return {
    ...hostCard(host, month, logs),
    story: host.story,
    highlights: host.highlights,
    squadNote: host.squadNote,
    capacity: host.capacity,
    mealOptions: host.meals.map(id => ({ id, ...MEAL_INFO[id] })),
    practices: host.practices,
    farms: farmsOf(host).map(({ farm }) => farmView(host, farm, month)),
    season: { month, monthName: MONTH_NAMES[month - 1], ...MONTH_NOTES[month] },
    thali: {
      title: MONTH_NOTES[month].thali,
      dishes: menu.dishes.map(d => ({
        id: d.id, name: d.name, hindi: d.hindi, slot: d.slot, peak: d.peak, story: d.story,
        supply: keySupply(host, DISH_BY_ID.get(d.id)!, month),
      })),
      zeroWasteTip: menu.zeroWasteTip,
    },
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${host.lat},${host.lng}&travelmode=walking`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${host.lat},${host.lng}`,
  };
}

/* Forecast */

const bookingView = (b: Booking) => ({ id: b.id, group: b.group, headcount: b.headcount, meal: b.meal, time: b.time, dietary: b.dietary, note: b.note });

function dayView(day: DayForecast) {
  return {
    date: day.date, weekday: day.weekday, label: day.label, dayNote: day.dayNote,
    booked: day.booked, walkIn: day.walkIn, covers: day.covers,
    meals: Object.fromEntries(MEALS.map(m => [m, { booked: day.meals[m].booked, walkIn: day.meals[m].walkIn, covers: day.meals[m].covers, bookings: day.meals[m].bookings.map(bookingView) }])),
    diets: day.diets,
  };
}

export function forecastView(host: Host, from: string, days: number, bookings: Booking[], logs: WasteLog[] = []) {
  const forecast = forecastDays(host, from, days, bookings);
  const to = forecast[forecast.length - 1].date;
  const plan = buildProcurement(host, forecast.map(d => ({ month: d.month, total: d.diets.total, booked: d.diets.booked })));
  const covers = forecast.reduce((sum, d) => sum + d.covers, 0);
  const booked = forecast.reduce((sum, d) => sum + d.booked, 0);
  const totalMix = forecast.reduce((mix, d) => addMix(mix, d.diets.total), emptyMix());
  const month = monthOf(from);
  const miles = foodMiles(plan);
  const waste = wasteAvoided(plan, booked, month);
  const squads = new Set(bookings.filter(b => b.date >= from && b.date <= to).map(b => b.id)).size;

  return {
    host: { id: host.id, name: host.name, area: host.area, kind: host.kind, capacity: host.capacity, image: host.image },
    from, to,
    days: forecast.map(dayView),
    totals: { covers, booked, walkIn: covers - booked, squads, diets: totalMix },
    menu: (() => {
      const menu = curatedMenu(host, { date: from, month, covers: Math.max(1, mixTotal(totalMix)), mix: mixTotal(totalMix) ? totalMix : { veg: 1, jain: 0, vegan: 0 } });
      return { title: menu.title, intro: menu.intro, season: menu.season, dishes: menu.dishes.map(d => ({ id: d.id, name: d.name, hindi: d.hindi, slot: d.slot, peak: d.peak })), zeroWasteTip: menu.zeroWasteTip };
    })(),
    procurement: {
      totalKg: plan.totalKg,
      localKg: plan.localKg,
      localShare: round2(plan.localShare),
      farms: plan.farms.map(o => {
        const text = orderMessage(host, o, { from, to }, covers, booked);
        return { ...o, whatsapp: { text, url: whatsappLink(text) } };
      }),
      market: plan.market,
    },
    foodMiles: miles,
    waste: { ...waste, assumptions: { openBuffetSurplus: OPEN_BUFFET_SURPLUS } },
    green: greenScore(host, plan.localShare, measuredWaste(logs)),
  };
}

/* Waste trend */

export type WasteDay = { date: string; label: string; leftoverKg: number; covers: number; perCoverKg: number; source: 'logged' | 'estimate' };

/**
 * The last `days` days of leftovers ending on `today`: what the host logged, and for days with no log an estimate
 * from the kitchen's own reported waste per cover so the chart never has holes.
 */
export function wasteTrend(host: Host, today: string, days: number, logs: WasteLog[], bookings: Booking[]) {
  const byDate = new Map(logs.map(l => [l.date, l]));
  const trend: WasteDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1);
    const logged = byDate.get(date);
    if (logged) {
      return { date, label: dateLabel(date), leftoverKg: round2(logged.leftoverKg), covers: logged.covers, perCoverKg: logged.covers ? round2(logged.leftoverKg / logged.covers) : 0, source: 'logged' };
    }
    const covers = forecastDay(host, date, bookings).covers;
    return { date, label: dateLabel(date), leftoverKg: round2(covers * host.practices.wasteKgPerCover), covers, perCoverKg: host.practices.wasteKgPerCover, source: 'estimate' };
  });
  const logged = trend.filter(d => d.source === 'logged');
  const loggedCovers = logged.reduce((sum, d) => sum + d.covers, 0);
  const buffetPerCover = round2(thaliKg(monthOf(today)) * OPEN_BUFFET_SURPLUS);
  return {
    hostId: host.id,
    days: trend,
    summary: {
      loggedDays: logged.length,
      totalLoggedKg: round1(logged.reduce((sum, d) => sum + d.leftoverKg, 0)),
      avgPerCoverKg: loggedCovers ? round2(logged.reduce((sum, d) => sum + d.leftoverKg, 0) / loggedCovers) : null,
      reportedPerCoverKg: host.practices.wasteKgPerCover,
      buffetPerCoverKg: buffetPerCover,
      savedVsBufferKg: round1(Math.max(0, logged.reduce((sum, d) => sum + d.covers * buffetPerCover - d.leftoverKg, 0))),
    },
  };
}

