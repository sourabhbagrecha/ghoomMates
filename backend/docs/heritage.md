# Heritage module (crowd-smart Udaipur)

Udaipur's heritage core (City Palace, Jagdish Temple, the ghats on Pichola) takes millions of visitors a year, and most of them arrive at the same few hours. This module forecasts how busy each heritage site is, then nudges travel squads into quiet windows and towards lesser-known gems. One nudge moves the whole group of 4–10 people, so it spreads the load more than a nudge to a solo traveller would.

## Pieces

| File | Role |
| --- | --- |
| `src/heritage/sites.ts` | 19 Udaipur sites: coordinates, opening hours, an hourly crowd curve, aliases for matching stop titles, alternatives with the same feel, a one-line story and a "visit lightly" tip. Gems are flagged. |
| `src/heritage/crowd.ts` | Pure functions: `levelAt` (0–100 or closed), `labelFor` (quiet < 40 ≤ moderate < 65 ≤ busy < 82 ≤ packed), `suggestFor` (the nudge), `crowdForStop`, `liveCrowds`, `crowdBrief` (the Gemini prompt section). |
| `src/heritage/app.ts` | `GET /api/heritage/:city/live[?at=ISO]`: every site now (or at `at`), busiest first. Public, no user data. |

No migration: forecasts are computed, not stored.

## How it plugs in

- **Itinerary:** `GET /api/trips/:id/itinerary` adds `crowd` to each stop at a known site: level and label at the stop's time on that trip day, hourly forecast, quietest window, the story, the care tip, and a `suggestion`. Food, Stay and Travel stops are skipped.
- **Nudges:** a busy, packed or closed stop gets the nearest clearly quieter time that doesn't clash with the squad's other stops that day (`shift`), or a similar site that's quiet at the same time (`swap`). The swap wins when shifting would only reach "moderate" and the swap is clearly quieter, e.g. Sajjangarh at sunset becomes the Neemach Mata hilltop. The app applies it with the normal `PATCH /stops/:id`.
- **Gemini:** for Udaipur trips, the draft prompt includes every site's quiet and crowded windows. It also asks for one gem a day, walkable clusters, and family-run eateries and makers. Without Gemini, `udaipurDraft` is a hand-built crowd-smart plan.
- **Voice:** the `crowds` skill (`check_crowds`) answers "how busy is City Palace?" and "where's quiet now?" from the same model.

## Day factors

Weekends ×1.12, Apr–Jun ×0.65, Jul–Sep ×0.85, and festival periods (Diwali, the year-end holidays) ×1.2–1.3. Add festival periods in `FESTIVALS` in `crowd.ts`.

## Festivals at a site

On top of the day factor, a festival lifts the sites and hours it touches: the Rath Yatra fills Jagdish Chowk from 2 to 7 PM (and opens the temple through its usual 2–4 PM closure), Gangaur fills the ghat, Diwali night packs the old city from about 6 PM. The calendar, the multipliers and how `levelAt` applies them are in [events.md](events.md); a day with no festival is exactly the model above. `crowdForStop` adds `events` (what touches the site that day), `liveCrowds` adds `events` per site, and `dayNoteFor(date)` names the day for travellers (festival period, else the festivals on, else “weekend”).

## Data

The curves are hand-tuned from typical footfall patterns: the opening rush, midday tour buses, the sunset crush. The live view adds a small deterministic wobble every 5 minutes so it moves like a feed. In production the curves would come from ticket-gate scans, Google Popular Times and app check-ins.
