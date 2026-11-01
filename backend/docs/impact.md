# Impact module (Green Trip)

Udaipur takes millions of visitors a year, and a squad of 4–10 moves as one: one ride, one queue, one dinner bill. This module turns the plan the squad already made into numbers it can see and share: the **footprint** of getting around, the **crowd-hours** it dodged by visiting at quiet hours, and the **₹ kept with local people**. Squads pledge small promises, get three concrete swaps, and earn a badge that goes on a shareable **Squad Impact Card**.

Everything is computed on demand from the itinerary (`trip_stops`) and the expense ledger (`expenses`). The module only reads those tables; it never writes to the trips, itinerary or expenses modules.

## Pieces

| File | Role |
| --- | --- |
| `src/impact/places.ts` | Puts a stop on the map: the heritage module's `matchSite()` (19 curated sites), then ~18 extra Udaipur landmarks (OpenStreetMap coordinates), then the hotel for a check-out. Unknown stops are skipped, never guessed. |
| `src/impact/emissions.ts` | Pure maths: haversine, road factor, modes, emission factors, default mode by distance, squad vehicles, leg and footprint totals. |
| `src/impact/crowd.ts` | Crowd-hours avoided, on top of `heritage/crowd.ts` forecasts. |
| `src/impact/local.ts` | Expense classification (keyword rules, optional Gemini for leftovers) and the "kept local" share. |
| `src/impact/pledges.ts`, `score.ts` | Eight Udaipur pledges; the 0–100 score and badge ladder. |
| `src/impact/swaps.ts` | Up to three rule-based swaps with exact numbers. |
| `src/impact/ai.ts` | Gemini's two optional jobs (sort expenses, re-word swaps), both cached, time-boxed (4 s) and validated. |
| `src/impact/maps.ts` | Optional Google Routes API distances behind `GOOGLE_MAPS_API_KEY`. |
| `src/impact/report.ts` | Pure assembly of the report from plain inputs (this is what the tests pin down). |
| `src/impact/service.ts`, `app.ts` | Postgres reads and writes; the Express router. |
| `migrations/022_impact.sql` | `impact_legs`, `impact_pledges`, `impact_cache`. |

## API

All routes need `Authorization: Bearer <session token>`. Only trip members get an answer; anyone else gets the same `404` as a trip that doesn't exist.

| Route | What it does |
| --- | --- |
| `GET /api/impact/trips/:tripId` | The full report (below). |
| `PUT /api/impact/trips/:tripId/legs` | `{ fromStopId, toStopId, mode }` stores the squad's ride for the leg between two consecutive stops of a day. `mode` is `walk`, `erickshaw`, `auto`, `cab` or `boat`; `null` goes back to the default. Rejects modes that make no sense for the ride (`400`: a 9 km walk, a boat on dry land) and pairs that aren't a leg of the plan (`404`). Returns the full report. |
| `GET /api/impact/trips/:tripId/pledges` | The eight pledges with who ticked each (trip member ids), your own ticks, and the squad's progress. |
| `PUT /api/impact/trips/:tripId/pledges` | `{ pledgeId, taken }` ticks or unticks **your own** pledge. Returns `{ pledges, score }`. |

### Report

```
footprint   squadSize, totalKg, perPersonKg, baselineKg (everyone in their own cab), savedKg, savedPct, cabKmSaved,
            distanceKm, byMode[], located {stops, total}, source (estimate | routes | mixed | none),
            days[] { number, title, date, stops, kg, legs[] }
leg         index, dayNumber, fromStopId, toStopId, from/to {title, name, lat, lng}, lake, mode, defaultMode, chosen,
            distanceSource, kg, ownCabKg,
            options{walk|erickshaw|auto|cab|boat} { allowed, km, minutes, vehicles, kg }
crowdSmart  heritageStops, quietVisits, offPeakVisits, peakVisits, crowdHoursAvoided, tip,
            visits[] { stopId, siteName, time, level, label, peak, avoidedPct, hours, crowdHours, better }
local       trackedPaise, keptPaise, sharePct, byClass[], items[], estimated, byGemini, classifier
pledges     items[] { id, title, why, icon, ticks[memberId], mine }, ticks, possible, pct, mine
score       total, parts[] { id, label, points, max }, badge { level, name, blurb, next }
swaps       up to 3 { id, kind, text, savesKg, savesCrowdHours, action, actionLabel }
method      factors{}, sources[]
```

Every leg carries the whole squad's kg for **every** mode in `options`, so the app can switch a ride and re-add the totals instantly, then reconcile with the server's answer (the per-leg numbers are rounded to 4 decimals so both sums agree).

## Footprint

- **Legs** run between consecutive stops of the same day when both can be placed. Stops that can't be placed (a "Squad dinner" with no place, "Head home") are skipped and counted in `located`; the footprint covers getting around Udaipur, not the journey there.
- **Distance** = straight line × a road factor: ×1.35 for vehicles, ×1.25 on foot, ×1.1 across water. Going round Lake Pichola is taken as 3.5× the straight line across it (the Chandpol bridge detour). With `GOOGLE_MAPS_API_KEY` set, the Routes API (`computeRoutes`, `DRIVE` and `WALK`) replaces the estimate for each leg; answers are cached in `impact_cache`, and any failure (or a refusal, which silences the API for 5 minutes) falls back to the estimate.
- **Default mode** by road distance: walk under 1.2 km, an auto under 7 km, a cab beyond; a boat for a lake crossing (City Palace side ↔ Ambrai Ghat ↔ the Lake Palace island).
- **Allowed modes** keep the switcher honest: walk up to 3 km, e-rickshaw up to 12 km, auto up to 30 km, cab always, boat only across the lake.
- **Squad maths**: a squad fills as few vehicles as it can (`ceil(squad / seats)`), so six mates are two cabs, two autos or two e-rickshaws. Per-person = squad total ÷ squad size. The **baseline** is every member in their own cab for every leg.
- Everyone is assumed to go to every stop (RSVPs aren't used yet).

### Emission factors

kg CO2e per **vehicle-km**; per passenger-km at full seats is that divided by the seats.

| Mode | kg/vehicle-km | Seats | Basis |
| --- | --- | --- | --- |
| Walk | 0 | – | Nothing burnt |
| E-rickshaw | 0.0443 | 4 | 61 Wh/km for an electric three-wheeler in city driving (Saxena, Gopal & Phadke 2014) × 0.727 kg CO2/kWh Indian grid (CEA CO2 Baseline Database v20.0, 2023-24 weighted average) |
| Auto-rickshaw | 0.1135 | 3 | Petrol three-wheeler, 0.1135 kg CO2/km (India GHG Program 2015; CNG is 0.1077, diesel 0.1322) |
| Cab | 0.153 | 4 | Petrol sedan under 1600 cc, 0.142 kg CO2/km, plus the programme's 10% uplift for real-world driving (India GHG Program 2015) |
| Boat | 0.40 | 10 | **Assumption**, no published India figure: a small electric boat at 0.55 kWh/km × 0.727 |

Sources:

1. India GHG Program (WRI India, CII, TERI), *India Specific Road Transport Emission Factors*, v1.0, 2015: <https://indiaghgp.org/sites/default/files/Road%20Transport%20Technical%20Paper.pdf>
2. S. Saxena, A. Gopal, A. Phadke, *Electrical consumption of two-, three- and four-wheel light-duty electric vehicles in India*, Applied Energy 115 (2014) 582–590: <https://doi.org/10.1016/j.apenergy.2013.10.043>
3. Central Electricity Authority, *CO2 Baseline Database for the Indian Power Sector*, v20.0, December 2024 (weighted average emission factor 0.727 tCO2/MWh for 2023-24): <https://cea.nic.in/wp-content/uploads/2021/03/User_Guide_Version_20.0.pdf>

These are tailpipe (and for electricity, grid) estimates, not life-cycle figures; the app labels every number an estimate and shows these factors under "How we count".

## Crowd-hours avoided

For each **timed** stop at a heritage site (Food, Stay and Travel stops are left out, like the itinerary's crowd meter), compare the crowd at the planned time with the site's busiest hour that day (the same forecasts, weekend and festival factors as `heritage/crowd.ts`):

```
avoided share = (peak − level at the planned time) / peak          (0 when closed or at the peak)
crowd-hours   = squad size × visit hours × avoided share
```

Visit hours come from the kind of site (palace 2 h, museum 1¼ h, temple ¾ h, ghat ¾ h, garden 1¼ h, …). **Quiet visits** are stops that are "quiet" (< 40) at their time; **off-peak** also counts "moderate"; busy, packed or closed are **peak**. For each visit the module keeps the heritage module's nudge (a quieter time, or a similar quiet site) with the extra crowd-hours it would dodge, which feeds the swaps. An index, not a measurement: footprints come from curated footfall curves, not sensors.

## Kept local

Expenses are read straight from the trip's ledger group (`expenses.group_id = trips.expense_group_id`: description, amount, category). Each is classified by ordered keyword rules:

| Class | Counts as local income? | Examples |
| --- | --- | --- |
| `local-artisan` | yes | miniature painting, pottery, bandhani, "Hathi Pol" |
| `local-food` | yes | thali, kachori, chai, dhaba, "family kitchen" |
| `heritage-stay` | yes | haveli, homestay, guesthouse |
| `guide` | yes | guides, workshops, cooking classes, performers |
| `transport` | yes for autos, rickshaws, cabs, boatmen, bike hire; **no** for Ola/Uber/Rapido, trains, flights, buses, fuel | |
| `entry-fees` | **no**: shown as "supports heritage upkeep" | tickets, museum, ropeway, boat-ride tickets |
| `other` | no | big chains (Taj, Domino's…), anything unclear |

Rules that don't fire leave the expense for **Gemini** (one batched call, ≤ 25 descriptions, 4 s timeout, temperature 0, answers validated against the class list and cached by description in `impact_cache`). Without Gemini a plain meal logged under "food" in Udaipur is **assumed** local; everything else stays `other`. The report says how many expenses were estimated (`estimated`) and how many Gemini sorted (`byGemini`).

## Pledges, score and badge

Eight pledges (refill bottles because the lakes are the city's drinking water, no single-use plastic at the ghats, temple dress code, no flash on palace murals, walk or e-rickshaw in the old city, buy direct from makers, visit at quiet hours, eat at family kitchens). Each member ticks their own; the table keeps `(trip, user, pledge)`.

Score (0–100) = lighter rides 30 (saving against solo cabs, full marks at 85%) + quiet hours 20 (quiet visits full, moderate 60%) + kept local 25 (full marks at 60% of spend) + pledges 25 (ticks ÷ squad × pledges). Badges: **Ghat Visitor** (0), **Pol Walker** (30), **Lake Guardian** (55), **Mewar Steward** (80).

## Swaps

Rule-based, from the plan as it stands, best first: walk a short hop, swap an auto or cab for an e-rickshaw, cross Pichola by boat, visit a packed site at a quieter hour or swap to a quiet site (the heritage module's own nudge), and a buy-direct nudge when no crafts are logged. Each names the places, the distance and the saving, and carries an action the app can apply (`mode` for rides, `stop` to open a stop, `expense`). If Gemini is on it may re-word the three texts in GhoomMate's voice, but a re-wording is only used if it keeps every number of the original; the result is cached.

## In the app

- **Itinerary tab:** `<GreenTripCard tripId days />` (`frontend/src/pages/Impact/GreenTripCard.tsx`, one line in `ItineraryPage`) shows the three numbers (kg CO2e per person, crowd-hours avoided, ₹ kept local), the badge, and opens the page. It refetches when the plan changes.
- **`#/trip/itinerary/impact`** (`ImpactPage`, registered in `TripDetailRoutes`): the score and badge on the header, the three numbers, the footprint against solo cabs, every ride with a walk / e-rickshaw / auto / cab / boat switcher, three swaps with a one-tap action, quiet hours, where the money went, the pledges with member avatars, and "How we count". Each switcher button shows what that choice costs the squad; the totals are re-added on the spot from the leg `options` and then reconciled with the server's answer (a failed save puts the numbers back and says so).
- **Squad Impact Card:** drawn on a canvas as a 1080 × 1350 PNG (squad name, member initials, the three numbers, the badge, "Planned with Ghoomates") with the design tokens, shown on the page, and shared with `navigator.share({ files })` where the phone allows it, otherwise downloaded.
- `useImpact` is a small shared store, so the card and the page always agree.

## Fallbacks

Gemini, the Routes API, the cache table and an empty itinerary are all optional: the report is complete with rules, curated data and straight-line estimates. A Gemini or Routes failure is logged once and the module leaves that service alone for a minute (Gemini) or five (Routes). Ride and pledge edits never wait on Gemini; they use only what is already cached.

## Not covered yet

Travel to and from Udaipur; per-stop RSVPs (the whole squad is assumed everywhere); trips outside Udaipur (rides and crowd-hours need curated places, pledges and local spend still work); live traffic.
