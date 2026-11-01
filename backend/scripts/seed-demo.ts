// Seeds a rich, live demo trip: "Mewar Mates · Udaipur", six mates, four days from today, a plan timed against the
// crowd model, a maker workshop and a farm-to-table dinner booked through their own services, pledges, expenses,
// RSVPs and photos. Backend docs: backend/docs/demo.md.
//
//   npm run seed:demo                              # for the demo account (aditi.travels@gmail.com), via the running backend
//   npm run seed:demo -- --email you@example.com   # another account becomes the organiser
//   npm run seed:demo -- --api https://ghoomates-….run.app   # a deployed server (needs ALLOW_DEV_LOGIN=true there)
//   npm run seed:demo -- --dry-run                 # print what it would create and touch nothing
//
// It talks to the same HTTP API the app uses (sign-in as the dev test accounts, trips, itinerary, makers, hospitality,
// impact, expenses), so every rule of those modules applies and nothing is written behind their backs. Safe to run
// again: the demo trip is found by name (while it has not ended), and each step only fills in what is missing.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../src/env.ts';
import {
  DEMO_EMAIL, EXPENSES, PHOTOS, PLAN, POOL, TABLE, TRIP, TRIP_DAYS, VIBE_AXES, WORKSHOP,
  addDays, dateOfDay, rsvpFor, squadFor, todayIST, type Mate, type PlanPhoto, type Vibe,
} from './demo/plan.ts';

const ASSETS = resolve(import.meta.dirname, 'demo-assets');

/* HTTP */

class ApiFail extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Json = any;

async function call(base: string, token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Json> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiFail(res.status, error?.code ?? `HTTP_${res.status}`, error?.message ?? `${method} ${path} answered ${res.status}`);
  }
  return data;
}

/* Arguments */

type Args = { email: string; name: string; api: string; dryRun: boolean; photos: boolean };

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): Args {
  const value = (flag: string) => {
    const at = argv.findIndex(a => a === flag || a.startsWith(`${flag}=`));
    if (at === -1) return undefined;
    return argv[at].includes('=') ? argv[at].slice(flag.length + 1) : argv[at + 1];
  };
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: npm run seed:demo -- [--email <organiser email>] [--name <their name>] [--api <backend url>] [--no-photos] [--dry-run]

  --email     The account that organises the demo trip (default ${DEMO_EMAIL}).
  --name      Name for that account when it does not exist yet (default: from the email).
  --api       The backend to talk to (default $BACKEND_URL, else http://127.0.0.1:$PORT from backend/.env).
  --no-photos Skip the sample photos.
  --dry-run   Print what would be created and change nothing.`);
    process.exit(0);
  }
  const email = (value('--email') ?? DEMO_EMAIL).trim().toLowerCase();
  const known = POOL.find(m => m.email === email);
  const fallbackName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const api = (value('--api') ?? env.BACKEND_URL ?? `http://127.0.0.1:${env.PORT ?? 3000}`).trim().replace(/\/+$/, '');
  return { email, name: value('--name')?.trim() || known?.name || fallbackName, api, dryRun: argv.includes('--dry-run'), photos: !argv.includes('--no-photos') };
}

/* Output */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (date: string) => {
  const at = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
};
const step = (name: string, text: string) => console.log(`  ${name.padEnd(10)} ${text}`);
const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/* Squad */

type Account = { mate: Mate; token: string; userId: string; isNew: boolean; existing: boolean };
/** An account once it is in the trip: `memberId` is its seat in the trip's expense ledger */
type Signed = Account & { memberId: string };

const isVibe = (value: unknown): value is Vibe =>
  !!value && typeof value === 'object' && VIBE_AXES.every(axis => typeof (value as Record<string, unknown>)[axis] === 'number');

/** Signs in as a dev test account (creating it the way the sign-in page does) and fills in the preferences it has none of */
async function signIn(base: string, mate: Mate, name: string): Promise<Account> {
  let login: Json;
  try {
    login = await call(base, null, 'POST', '/auth/dev/login', { email: mate.email, name });
  } catch (err) {
    if (err instanceof ApiFail && err.code.startsWith('DEV_LOGIN')) {
      throw new Error(`${err.message}\n  The seed signs in as dev test accounts. Run it against a local backend, or deploy with ALLOW_DEV_LOGIN=true and DEV_LOGIN_EMAILS listing ${mate.email}.`);
    }
    throw err;
  }
  const { user, token, isNewUser } = login as { user: { id: string; preferences?: Record<string, unknown> }; token: string; isNewUser: boolean };
  const prefs = user.preferences ?? {};
  const patch: Record<string, unknown> = {};
  if (!isVibe(prefs.vibe)) patch.vibe = mate.vibe;
  if (typeof prefs.colour !== 'string' || !prefs.colour) patch.colour = mate.colour;
  if (mate.diet && !prefs.diet) patch.diet = mate.diet;
  if (Object.keys(patch).length) await call(base, token, 'PATCH', '/auth/profile', { preferences: patch });
  // A friendly @name for a new account; an existing one keeps the one it has
  if (isNewUser && mate.username) {
    await call(base, token, 'PATCH', '/auth/profile', { username: mate.username }).catch((err) => {
      if (!(err instanceof ApiFail && err.code === 'USERNAME_TAKEN')) throw err;
    });
  }
  return { mate, token, userId: user.id, isNew: isNewUser, existing: !isNewUser };
}

/* Steps */

type Stop = { id: string; dayNumber: number; time: string; title: string; tag: string; going: string[]; myRsvp: string | null; crowd?: { label: string | null } | null };

const stopsOf = (itinerary: Json): Stop[] => (itinerary.days as { stops: Stop[] }[]).flatMap(d => d.stops);

async function planTheDays(base: string, tripId: string, owner: Account) {
  const itinerary = await call(base, owner.token, 'GET', `/api/trips/${tripId}/itinerary`);
  const have = stopsOf(itinerary).length;
  if (have > 0) return step('plan', `kept the ${have} stops already in the itinerary`);
  await call(base, owner.token, 'PUT', `/api/trips/${tripId}/itinerary`, { days: PLAN.map(d => ({ title: d.title, stops: d.stops })) });
  step('plan', `${PLAN.length} days, ${PLAN.reduce((n, d) => n + d.stops.length, 0)} stops`);
}

async function bookWorkshop(base: string, tripId: string, owner: Account, start: string, people: number) {
  const { items } = await call(base, owner.token, 'GET', `/api/makers/bookings?tripId=${tripId}`);
  if (items.length) return step('workshop', `already booked: ${items[0].workshopTitle} with ${items[0].makerName}`);
  const date = dateOfDay(start, WORKSHOP.day);
  for (const makerId of WORKSHOP.makerIds) {
    const { maker } = await call(base, null, 'GET', `/api/makers/${makerId}`);
    const slots = (await call(base, null, 'GET', `/api/makers/${makerId}/slots?date=${date}`)) as { open: boolean; slots: { time: string; available: boolean; spotsLeft: number }[] };
    if (!slots.open) continue;
    const size = Math.min(people, maker.workshop.maxPeople);
    const slot = WORKSHOP.slots.find(time => slots.slots.some(s => s.time === time && s.available && s.spotsLeft >= size));
    if (!slot) continue;
    try {
      const booking = await call(base, owner.token, 'POST', `/api/makers/${makerId}/bookings`, { tripId, date, slot, people: size, note: WORKSHOP.note });
      return step('workshop', `${booking.workshopTitle} with ${booking.makerName}, ${label(date)} ${slot}, ${size} people, ₹${booking.total.toLocaleString('en-IN')}`);
    } catch (err) {
      if (!(err instanceof ApiFail && (err.code === 'SLOT_UNAVAILABLE' || err.code === 'ALREADY_BOOKED'))) throw err;
    }
  }
  step('workshop', `skipped: no maker had a free slot on ${label(date)}`);
}

async function bookTable(base: string, tripId: string, owner: Account, start: string) {
  const { items } = await call(base, owner.token, 'GET', `/api/hospitality/reservations?tripId=${tripId}`);
  if (items.length) return step('table', `already booked: ${items[0].hostName}, ${items[0].dateLabel} ${items[0].mealLabel}`);
  const date = dateOfDay(start, TABLE.day);
  const { reservation } = await call(base, owner.token, 'POST', `/api/hospitality/hosts/${TABLE.hostId}/reservations`, {
    tripId, date, meal: TABLE.meal, time: TABLE.time, note: TABLE.note, dayNumber: TABLE.day,
  });
  const diets = [reservation.dietary.jain && `${reservation.dietary.jain} Jain`, reservation.dietary.vegan && `${reservation.dietary.vegan} vegan`].filter(Boolean).join(', ');
  step('table', `${reservation.hostName}, ${reservation.dateLabel} ${reservation.time}, ${reservation.headcount} seats${diets ? ` (${diets})` : ''}`);
}

async function tickPledges(base: string, tripId: string, owner: Account, squad: Signed[]) {
  const pledges = await call(base, owner.token, 'GET', `/api/impact/trips/${tripId}/pledges`);
  if (pledges.ticks > 0) return step('pledges', `kept the ${pledges.ticks} already ticked`);
  await Promise.all(squad.map(async (member) => {
    for (const pledgeId of member.mate.pledges) {
      await call(base, member.token, 'PUT', `/api/impact/trips/${tripId}/pledges`, { pledgeId, taken: true });
    }
  }));
  step('pledges', `${squad.reduce((n, m) => n + m.mate.pledges.length, 0)} ticks across the squad`);
}

async function addExpenses(base: string, tripId: string, squad: Signed[]) {
  const byEmail = new Map(squad.map(s => [s.mate.email, s]));
  const everyone = squad.map(s => ({ memberId: s.memberId }));
  const have = new Set((await call(base, squad[0].token, 'GET', `/api/trips/${tripId}/expenses?limit=100`)).items.map((e: { description: string }) => e.description));
  let added = 0;
  let total = 0;
  for (const [index, expense] of EXPENSES.entries()) {
    const payer = byEmail.get(expense.payer);
    if (!payer || have.has(expense.description)) continue;
    const among = expense.among ? expense.among.flatMap(email => byEmail.get(email) ?? []).map(s => ({ memberId: s.memberId })) : everyone;
    try {
      // Keyed, so even two runs at once add each spend once
      await call(base, payer.token, 'POST', `/api/trips/${tripId}/expenses`, {
        description: expense.description, amountPaise: expense.rupees * 100, payerMemberId: payer.memberId, category: expense.category,
        split: { type: 'equal', participants: among },
      }, { 'Idempotency-Key': `seed-demo-${index + 1}` });
      added++;
      total += expense.rupees * 100;
    } catch (err) {
      // The ledger can be unavailable on a server without it: the rest of the demo does not depend on it
      if (err instanceof ApiFail && (err.status === 503 || err.status === 404)) return step('expenses', `skipped: ${err.message}`);
      if (err instanceof ApiFail && err.code === 'IDEMPOTENCY_CONFLICT') continue;
      throw err;
    }
  }
  step('expenses', added ? `${added} spends, ${inr(total)}` : `kept the ${have.size} already in the ledger`);
}

async function setRsvps(base: string, tripId: string, squad: Signed[]) {
  let set = 0;
  await Promise.all(squad.map(async (member, mateIndex) => {
    const stops = stopsOf(await call(base, member.token, 'GET', `/api/trips/${tripId}/itinerary`));
    for (const [index, stop] of stops.entries()) {
      // Only what this mate has not answered yet: a changed answer is never overwritten
      if (stop.myRsvp !== null) continue;
      await call(base, member.token, 'PUT', `/api/trips/${tripId}/stops/${stop.id}/rsvp`, { rsvp: rsvpFor(stop, index, mateIndex) });
      set++;
    }
  }));
  step('rsvps', set ? `${set} answers from the squad` : 'every mate has already answered');
}

async function uploadPhotos(base: string, tripId: string, squad: Signed[], photos: PlanPhoto[]) {
  if (!photos.length) return;
  const { total } = await call(base, squad[0].token, 'GET', `/api/trips/${tripId}/photos?limit=1`);
  if (total > 0) return step('photos', `kept the ${total} already in the album`);
  const byEmail = new Map(squad.map(s => [s.mate.email, s]));
  for (const photo of photos) {
    const uploader = byEmail.get(photo.by) ?? squad[0];
    const bytes = readFileSync(resolve(ASSETS, photo.file));
    // The app's own flow: ask for a signed URL, PUT the bytes straight to storage, then register the photo
    const { key, upload } = await call(base, uploader.token, 'POST', `/api/trips/${tripId}/uploads`, { kind: 'photo', contentType: 'image/jpeg', size: bytes.length });
    const res = await fetch(upload.url.startsWith('http') ? upload.url : `${base}${upload.url}`, { method: upload.method, headers: upload.headers, body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`Uploading ${photo.file} failed (${res.status})`);
    await call(base, uploader.token, 'POST', `/api/trips/${tripId}/photos`, { photos: [{ key, width: photo.width, height: photo.height, caption: photo.caption }] });
  }
  step('photos', `${photos.length} sample photos (AI-generated, fictional friends)`);
}

/* What the demo shows */

async function summarise(base: string, tripId: string, owner: Account, today: string) {
  const [impact, summary, itinerary] = await Promise.all([
    call(base, owner.token, 'GET', `/api/impact/trips/${tripId}`),
    call(base, owner.token, 'GET', `/api/trips/${tripId}/summary`),
    call(base, owner.token, 'GET', `/api/trips/${tripId}/itinerary`),
  ]);
  const forecast = await call(base, owner.token, 'GET', `/api/ops/udaipur/forecast?date=${today}`).catch(() => null);
  const stops = stopsOf(itinerary);
  const crowd = impact.crowdSmart;
  console.log('\nWhat the demo shows');
  step('itinerary', `${stops.length} stops over ${itinerary.days.length} days (${itinerary.days.map((d: { stops: unknown[] }) => d.stops.length).join(' + ')})`);
  step('crowds', `${crowd.heritageStops} heritage visits: ${crowd.quietVisits} quiet, ${crowd.offPeakVisits - crowd.quietVisits} moderate, ${crowd.peakVisits} busy or packed; ${crowd.crowdHoursAvoided} crowd-hours avoided`);
  step('footprint', `${impact.footprint.perPersonKg} kg CO2e a person, ${impact.footprint.savedPct}% under everyone in their own cab (${impact.footprint.byMode.length} ride types)`);
  step('local', `${impact.local.sharePct}% of ${inr(impact.local.trackedPaise)} kept with local people`);
  step('score', `${impact.score.total}/100, ${impact.score.badge.name}${impact.score.badge.next ? ` (${impact.score.badge.next.toGo} to ${impact.score.badge.next.name})` : ''}; pledges ${impact.pledges.ticks}/${impact.pledges.possible}`);
  step('ledger', `${summary.expenseCount} expenses, ${inr(summary.totalSpentPaise)}, ${summary.transfers.length} transfers to settle`);
  if (forecast) {
    const busiest = forecast.kpis.busiest;
    step('ops', `${label(today)}: ${forecast.kpis.plannedVisitors ?? 'few'} planned visitors, ${forecast.kpis.hotspots} hotspots${busiest ? `, busiest ${busiest.siteName} at ${busiest.time} (${busiest.level})` : ''}`);
  }
}

/* Main */

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2), process.env);
  const today = todayIST();
  const start = today;
  const end = addDays(today, TRIP_DAYS - 1);
  const { organiser, mates } = squadFor({ email: args.email, name: args.name });

  console.log(`Ghoomates demo seed: ${TRIP.name}, ${label(start)} to ${label(end)}${args.dryRun ? ' (dry run)' : ''}`);
  console.log(`  backend    ${args.api}`);
  console.log(`  squad      ${[organiser, ...mates].map((m, i) => `${m.name}${i === 0 ? ' (organiser)' : ''}`).join(', ')}`);
  if (args.dryRun) {
    for (const [i, day] of PLAN.entries()) console.log(`  day ${i + 1}      ${label(dateOfDay(start, i + 1))}: ${day.title} (${day.stops.map(s => `${s.time} ${s.title}`).join('; ')})`);
    console.log(`  workshop   ${WORKSHOP.makerIds[0]} on day ${WORKSHOP.day}, table at ${TABLE.hostId} on day ${TABLE.day}`);
    console.log(`  expenses   ${EXPENSES.length} spends, ₹${EXPENSES.reduce((n, e) => n + e.rupees, 0).toLocaleString('en-IN')}`);
    return;
  }

  try {
    await call(args.api, null, 'GET', '/health');
  } catch {
    throw new Error(`Cannot reach the backend at ${args.api}. Start it (npm run dev) or pass --api <url>.`);
  }

  console.log('\nSetting up');
  const everyone = [organiser, ...mates];
  const signedIn = await Promise.all(everyone.map(m => signIn(args.api, m, m === organiser ? args.name : m.name)));
  const owner = signedIn[0];
  step('squad', signedIn.map(s => `${s.mate.name.split(' ')[0]}${s.existing ? '' : ' (new)'}`).join(', '));

  // The trip: the demo account's own, found by name while it has not ended; a new one otherwise
  const { items } = await call(args.api, owner.token, 'GET', '/api/trips');
  const found = (items as { id: string; name: string; createdBy: string; startDate: string | null; endDate: string | null }[])
    .find(t => t.name === TRIP.name && t.createdBy === owner.userId && (t.endDate ?? t.startDate ?? '') >= today);
  let trip: Json;
  if (found) {
    trip = await call(args.api, owner.token, 'GET', `/api/trips/${found.id}`);
    const live = (trip.startDate ?? '') <= today;
    step('trip', `${live ? 'live' : 'not started yet'}: reusing ${trip.id} (${label(trip.startDate)} to ${label(trip.endDate)})`);
  } else {
    trip = await call(args.api, owner.token, 'POST', '/api/trips', {
      name: TRIP.name, groupName: TRIP.groupName, destination: TRIP.destination, cover: TRIP.cover, budget: TRIP.budget,
      startDate: start, endDate: end, details: { tweaks: TRIP.tweaks, budgetLabel: TRIP.budget },
    });
    step('trip', `created ${trip.id} (${label(trip.startDate)} to ${label(trip.endDate)})`);
  }

  // Everyone else joins with the invite code; joining twice changes nothing
  for (const member of signedIn.slice(1)) await call(args.api, member.token, 'POST', '/api/trips/join', { code: trip.inviteCode });
  trip = await call(args.api, owner.token, 'GET', `/api/trips/${trip.id}`);
  const memberOf = new Map((trip.members as { userId: string; memberId: string }[]).map(m => [m.userId, m.memberId]));
  const squad: Signed[] = signedIn.flatMap(s => (memberOf.has(s.userId) ? [{ ...s, memberId: memberOf.get(s.userId)! }] : []));
  step('members', `${squad.length} in the trip`);

  // The base plan first: the maker workshop and the table add their own stops to it
  await planTheDays(args.api, trip.id, owner);
  await bookWorkshop(args.api, trip.id, owner, trip.startDate ?? start, squad.length);
  await bookTable(args.api, trip.id, owner, trip.startDate ?? start);
  await tickPledges(args.api, trip.id, owner, squad);
  await addExpenses(args.api, trip.id, squad);
  await setRsvps(args.api, trip.id, squad);
  if (args.photos) await uploadPhotos(args.api, trip.id, squad, PHOTOS);

  await summarise(args.api, trip.id, owner, today);

  console.log(`\nDone. Sign in as ${args.email} (the sign-in page's quick test account) and open "${TRIP.name}" on Home.`);
  console.log(`Invite link for more phones: ${trip.inviteUrl}`);
  if (args.api.includes('127.0.0.1') || args.api.includes('localhost')) console.log('Run it again any time: it only adds what is missing.');
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
