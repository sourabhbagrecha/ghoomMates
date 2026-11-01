# Heritage Ops module (smart crowd management for site managers)

The heritage module models how busy each site is on a typical day. Ghoomates also knows where squads **plan** to be: every itinerary stop with a time. Adding the two gives a site manager a forecast before the crowd forms, and an advisory they publish reaches every squad planned into the crunch. One advisory moves 4–10 people per squad, so it eases a site far more than a nudge to a solo traveller would.

Everything a partner sees is an aggregate. The console is a demo-grade control room: it works without a database, Gemini or GCS, and degrades to curated content.

## Pieces

| File | Role |
| --- | --- |
| `src/ops/forecast.ts` | Pure functions: the sites × hours forecast (`buildForecast`), KPIs, hotspot windows, best alternative hour, reach, and the calmer site and time for an advisory. |
| `src/ops/sample.ts` | A deterministic, clearly flagged layer of simulated squads for the demo (see below). |
| `src/ops/demand.ts` | Reads planned heritage stops from `trip_stops` for a city and day. |
| `src/ops/advisories.ts` | Validation, the public shape travellers see, and the stores (Postgres, or in memory without a database). |
| `src/ops/draft.ts`, `src/ops/hindi.ts` | The bilingual draft: Gemini polishes a hand-written baseline, the template is the fallback. Hindi site names and time phrasing. |
| `src/ops/app.ts` | The router, mounted at `/api/ops` (before the catch-all `/api` ledger in `src/app.ts`). |
| `migrations/023_heritage_ops.sql` | `heritage_advisories` (idempotent). The forecast itself is computed, not stored. |

## Endpoints

All need a signed-in user except the public advisory list.

| Route | What it does |
| --- | --- |
| `GET /api/ops/:city/forecast?date=YYYY-MM-DD[&sample=0]` | For every site and hour 6 AM–9 PM: modelled baseline, level points the squads add, projected level 0–100 with its label, squads and people arriving. Per site: peak hour, best alternative hour and the hotspot window. Also KPIs, `byHour` (squads arriving across the city) and the top hotspots. `meta` says whether planned stops came from the trips and whether sample squads are included. |
| `GET /api/ops/advisories?city=&date=` | Public. Active advisories (not withdrawn, window not over), with the swap ready to apply to a stop. `reach=1` plus a valid token adds how many squads each reached. |
| `POST /api/ops/advisories/draft` | `{ siteId, date, startMinutes?, endMinutes?, sample? }`. Proposes the window (the site's hotspot unless given), the level, a calmer site and a calmer time, and writes the English and Hindi messages. Nothing is saved. |
| `POST /api/ops/advisories/reach` | Who an advisory for a site and window would reach right now; the composer calls it as the manager adjusts the window. |
| `POST /api/ops/advisories` | Publishes. Returns the advisory and the reach estimate. |
| `DELETE /api/ops/advisories/:id` | Withdraws it; travellers stop seeing it at once. |

## The forecast

For each site and hour column:

```
present(site, hour)   = Σ over planned stops of  people × (share of that hour the squad is still at the site)
uplift(site, hour)    = present ÷ CAPACITY_PER_HOUR[site kind] × 100          (level points)
projected(site, hour) = min(100, modelled baseline + uplift)
```

- **Modelled baseline** is `heritage/crowd.ts` (the hand-tuned curve × the day factor for weekends, festivals and season, × the festival factor at the sites and hours a festival touches: see [events.md](events.md)). On Rath Yatra day the forecast shows Jagdish Temple open and packed through its usual 2–4 PM closure, and the day note names the festival.
- **A planned stop** is an itinerary stop with a time, on that date (trip start date + day number), in a trip to the city, at a site `matchSite()` recognises. Food, Stay and Travel stops are skipped, like the itinerary does. People = the trip's member count.
- **Dwell:** a squad arrives at the stop's time and stays `DWELL_MINUTES[kind]` (palace 120, museum, bazaar and crafts 75, haveli, ghat, lake, garden and viewpoint 60, temple 45), so it loads every hour it overlaps.
- **Capacity** (people an hour before a site feels full): palace 340, ghat 380, garden 320, temple 300, lake 220, viewpoint 200, museum and crafts 170, haveli 150, bazaar 480.

The capacities, dwell times and the 30% pick-up below are **planning estimates, not measurements**. They are set so a few dozen squads visibly move a site, which is what the demo needs. In production they would come from ticket-gate scans, Google Popular Times and app check-ins, as the heritage curves would.

**Hotspot:** the first two hours of the run of "busy" (65+) hours that the most squads arrive into (at least 3 squads). Warning at the front of the crunch is what lets squads change plans in time. Hotspots lead the heatmap, busiest first.

**Best alternative hour:** the lowest projected level for the site, nearest the peak on a tie, starting at the first minute the site is open (City Palace opens at 9:30).

**KPIs:** planned visitors (people in squads with at least one stop, each squad once), squads, the busiest site and hour, and the share of planned visits that are off-peak (arrival hour projected below "busy").

## Privacy

Aggregates only. Any count of 1 or 2 squads is returned as `"<3"` and its people as `null`; totals follow the same rule. Trip ids, trip names and members never leave the module (the trip id is only a handle to count a squad once). Advisories keep who published them (`created_by`) for audit, but the public shape and the partner shape leave it out. The partner-only reach on each advisory is shown only to a signed-in caller who asks for `reach=1`.

## Sample squads (the demo layer)

Real planned stops are a handful while the app is young, so the console layers a **simulated** sample on top: the same city and day always give the same squads, shaped by each site's own crowd curve (squads arrive about half a stay before a site peaks, and herd onto the famous hours). They are flagged `sample: true`, always labelled in the console ("Live plans + sample squads"), reported separately in `meta.sampleSquads`, and can be switched off:

- per request: `?sample=0` (the console has a switch for it);
- server-wide default: `OPS_SAMPLE_SQUADS=off`.

On a festival day the sample draws more squads to the sites the festival touches, in its hours. On a normal weekday the sample puts about 40 squads into City Palace between 10 AM and noon, which is the demo moment: the baseline calls that window moderate-then-busy, and the squads tip it to packed. Real plans are always counted on top.

## Advisories

A site manager picks a site and a window (the console proposes the hotspot), the level (busy or packed), English and Hindi messages, and a calmer option: another site that stays calm through the whole window and is worth the walk (nearby, the site's own "same feel" alternatives and lesser-known gems preferred) and/or a calmer time at the same site. Publishing stores the advisory with a snapshot of its reach (squads and people with a stop at that site starting inside the window, plus an estimate that if 3 in 10 squads take the swap, about that many people leave the crunch).

**Drafting.** The numbers (window, level, alternatives) always come from the forecast. Gemini (`models.lite`, 12 s timeout, about a second in practice) is given the facts and a hand-written baseline in both languages and asked to polish the wording: warm and calm, "expected" not stated as fact, no greetings, no dates. The answer is validated (length, English has no Devanagari, Hindi is Devanagari without English sentences, nothing tied to "today" or "tomorrow"), and anything that fails, or no Gemini at all, gives the template: "Heads up: City Palace is expected packed 10 AM–12 PM. Gulab Bagh is calm then, or come at 9:30 AM for a quieter visit." with its Hindi twin. The manager edits both before publishing.

**On the traveller's side** (frontend): an info banner on Explore's crowd map and a card on the stop page, sky blue and never red, shown in the traveller's app language with a switch. If the squad has a stop at that site and day inside the window, the banner and the stop page offer a one-tap swap to the calmer site, or a move to the calmer time, through the normal stop update.

## Partner access (demo stub)

There is no partner role yet: **any signed-in user can open the console, publish and withdraw**. The console says "Partner preview". A real version would add a partner flag on the user and scope each partner to the sites they manage.

## Without a database, Gemini or GCS

- No database: the forecast is the modelled baseline plus the sample squads (add `?sample=0` for the baseline alone), and advisories live in memory for as long as the server does. A failing planned-stops query degrades to the same.
- A failing advisory store never breaks a traveller's screen: the public list just comes back empty.
- No Gemini key, or a bad answer: the template draft.

## Env

`OPS_SAMPLE_SQUADS=off` turns the simulated squads off by default (see `backend/.env.example`). The existing `GEMINI_API_KEY` / `GEMINI_MODEL` drive the draft.

## Next

- A partner role, and advisories scoped to the sites a partner manages.
- Push the advisory to squads' phones (it is read on open today), and let GhoomMate say it by voice.
- Feed real gate counts into the capacities, and let the forecast show the relief once squads take swaps.
