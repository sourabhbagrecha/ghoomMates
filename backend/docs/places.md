# Places module (destination guides)

Udaipur has deep, hand-curated data spread across the heritage, experiences, makers, hospitality and events modules. Every other city used to get a generic template. The places module is a researched inventory of 25 Indian destinations (Travel + Leisure’s 2027 list), so suggestions, itineraries and GhoomMate answers draw on real places everywhere, with something for every kind of traveller.

Each guide holds 35–60 items: sights, cultural and heritage spots, hidden gems, specific eateries and dish trails, workshops, guided experiences, nature, adventure, wellness and spiritual life, evenings out, makers’ markets, neighbourhoods and day trips. Plus the city’s must-knows: best and avoid months, budget, getting there and around, where to stay, permits and practicalities, etiquette, signature dishes and festivals.

## Pieces

| File | Role |
| --- | --- |
| `src/places/types.ts` | The schema. Every field documents its rule (lengths, ranges, required stories, gem share). |
| `src/places/cities/<id>.ts` | One guide per destination, `export const guide: CityGuide`. Researched by one agent per city with sources listed in `sources`. |
| `src/places/index.ts` | `GUIDES`, `GUIDE_BY_ID`, `ITEM_BY_ID`, `guideFor(destination)` (alias match, longest first), `rankItems` (filter by kind, gems, traveller, month, cost, effort; rank by quiz-vibe fit), `guideBrief` (the itinerary prompt section), `stopTag`. Pure. |
| `src/places/app.ts` | The router, mounted at `/api/places`. Public: no user data, no database. |
| `src/voice/skills/places.ts` | GhoomMate’s `find_places` tool. |

Nothing is stored in the database; guides are code, reviewed like code.

## Guides

chettinad, orchha, majuli, hampi, udaipur, varanasi, agra, tawang, gurez, chopta-tungnath, spiti-valley, kullu-manali, leh-ladakh, rishikesh, dzukou-valley, ziro-valley, gandikota, meghalaya, rann-of-kutch, jaisalmer, lakshadweep, gokarna, goa, satpura, kaziranga.

Small places widen to their gateway town and surroundings (Dzukou includes Kohima; Gurez includes Bandipora and Wular). Goa covers the whole state, weighted to the south. The Udaipur guide consolidates the repo’s existing Udaipur data and fills the gaps; the specialised Udaipur modules (crowd curves, makers, farm-to-table) stay the source for their own features.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/places` | Every guide without its items: id, name, state, centre, summary, best months, budget, ideal days, item and gem counts. |
| GET | `/api/places/match?destination=…` | `{ guide: { id, name } \| null }` for free text like “Spiti, HP”. |
| GET | `/api/places/:id` | One guide in full (`:id` may also be free text). Filters: `kind` (comma list), `gems=1`, `traveller`, `month` (1–12), `maxCost`; pass vibe axes (`adventure=0.8&food=0.3…`) to rank items and get a `match` 0–100 on each. Unknown → 404. |

They cost nothing per call, so the generic per-IP limits cover them.

## How it plugs in

- **Itinerary, Gemini:** for any trip whose destination has a guide, the draft prompt carries `guideBrief`: the must-knows plus up to 45 in-season items ranked for the squad’s blended vibe, keeping at least one of every kind. Gemini is asked to prefer these real places and use their names as written.
- **Itinerary, no Gemini:** Udaipur keeps its crowd-smart `udaipurDraft`. Every other guided destination gets `guideDraft`: arrival, then days of morning sight, local lunch, afternoon experience, sunset spot and evening out, a gem every day, nothing repeated, and a day trip on 4+ day trips. Anything else still gets the generic template.
- **Voice:** `find_places` answers “hidden gems in Hampi?”, “where to eat in Chettinad?”, “anything for my parents in Rishikesh?” and must-knows like permits and season.

## Adding or editing a guide

1. Write `src/places/cities/<id>.ts` following `types.ts`.
2. Register it in `src/places/index.ts`.
3. `GUIDE=<id> node --test tests/places/places.test.ts` checks counts (35–60 items, a quarter gems, at least 6 food, 5 experiences or workshops, 6 sights, 2 day trips, 8 kinds), coordinates within the guide’s radius, vibe steps, text lengths and curly quotes.
