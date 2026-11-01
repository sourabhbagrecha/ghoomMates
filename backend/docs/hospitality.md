# Hospitality module (Mewari thali table)

Udaipur's havelis, homestays and cafés buy produce from distant wholesale markets and cook buffets for unpredictable crowds, so food miles and food waste pile up while farmers around the lakes earn little. A squad knows days ahead how many people will eat where, and what they eat. This module turns that into a demand signal: travellers book a squad thali at a farm-to-table kitchen, and the kitchen sees the covers, the diets, a farm order and a menu.

Hosts, farms and dishes are **sample partners**: real places (Gangaur Ghat, Lal Ghat, Ambamata, Fateh Sagar; the villages Badgaon, Bhuwana, Eklingji, Gogunda, Kaladwas, Sisarma), fictional businesses. No real private person appears anywhere.

## Pieces

| File | Role |
| --- | --- |
| `src/hospitality/produce.ts` | 22 ingredients with their Mewar season (peak months, stored or fresh, Jain/vegan flags) and a 12-month farm calendar with a thali name per month. |
| `src/hospitality/dishes.ts` | 12 Mewari dishes: story, portion in grams, Jain/vegan swaps, a zero-waste tip. `thaliFor(month)` picks the six that make a thali (starter, main, two sabzis, side, sweet). |
| `src/hospitality/partners.ts` | 4 hosts (haveli, homestay, two cafés) and 6 farms, with coordinates, practices and road-distance estimates. |
| `src/hospitality/plan.ts` | Pure maths: walk-in baseline, day forecast, procurement list by farm, food miles, waste avoided, the WhatsApp order text. |
| `src/hospitality/green.ts` | The Green Host score. |
| `src/hospitality/menu.ts` | The curated menu, the Gemini prompt/schema, and validation of what Gemini returns. |
| `src/hospitality/store.ts` | `PgStore` (reservations and leftover logs) and `MemoryStore` (no database, tests); diets read from profiles. |
| `src/hospitality/views.ts`, `app.ts` | API shaping and the router. |
| `migrations/024_hospitality.sql` | `hospitality_reservations`, `hospitality_waste_logs`. Everything else is curated in code. |

## Endpoints (`/api/hospitality`)

| Route | Who | What |
| --- | --- | --- |
| `GET /hosts` | public | The four hosts, greenest first: Green Host score and tier, food miles, this month's special, plus the month's farm notes and `today` (the date in India, which the app uses to offer table dates whatever the phone's clock says). |
| `GET /hosts/:id` | public | One host: story, partner farms and what each supplies this month, the month's thali, directions. |
| `POST /hosts/:id/reservations` | trip member | `{ tripId, date, meal, time?, headcount?, dietary?, note?, dayNumber? }`. Headcount defaults to the trip's member count and the diet mix to what their profiles say. Saves the table and adds a **Food** stop to the itinerary. Booking the same host, day and meal again updates it. |
| `GET /reservations?tripId=` | trip member | The squad's tables, plus `squad`: how many people are in the trip and which diets their profiles mention (what a new booking starts from). |
| `DELETE /reservations/:id` | trip member | Cancels the table and removes its stop. |
| `GET /hosts/:id/forecast?days=7` | signed in | Covers per day (bookings + modelled walk-ins), diets, the menu plan, the procurement list grouped by farm with a `wa.me` link each, food miles, waste avoided, Green Host score. |
| `GET/POST /hosts/:id/waste` | signed in | The leftover trend (7 days by default) and logging a day's leftovers in kg. |
| `POST /menu` | signed in | `{ hostId, date?, covers?, dietary? }` returns a seasonal farm-to-table menu from Gemini, or the curated one. |

Hosts, forecast, waste and menu work **without a database**; reservations need the trips database and answer `503` without it. The host tools are open to any signed-in user so the demo can switch between hosts; a real deployment would tie each host to an owner account.

## Screens (frontend/src/pages/Hospitality)

- **Explore → Farm-to-table** (`FarmToTableSection`, Udaipur trips): a row of kitchen cards with the Green Host badge and food miles. `See all` opens `#/trip/explore/food`.
- **`#/trip/explore/food`**: what is on the farms this month and the four kitchens, greenest first.
- **`#/trip/explore/food/<hostId>`**: the Green Host score breakdown, sourcing story, food-miles bars, partner farms (what each has fresh or stored this month), the month's thali, the squad's own tables with Cancel, and the **Reserve a squad thali** sheet (day, meal, time, guests, Jain and vegan counts). Booking adds the Food stop and refreshes the itinerary.
- **`#/host[/<hostId>]`** (Profile → Host kitchen): a kitchen picker, four numbers for the week, the seven-day demand bars with the squads behind a day, farm orders with the WhatsApp links, the Gemini menu and the leftover log. It refreshes itself every 30 seconds, so a booking made on another phone shows up.
- Pictures are generated illustrations (Gemini image model on Vertex AI), under `frontend/public/hospitality/`; a missing picture falls back to a soft tile.

## How it plugs in

- **Trips:** the reservation uses `TripService.access` (404 for non-members) and `ItineraryService.addStop` / `updateStop` / `deleteStop`, so the Food stop behaves like any other (RSVPs, ordering, no crowd meter). A date outside the trip's dates is still booked, just without a stop. Deleting the stop from the itinerary leaves the table booked (`ON DELETE SET NULL`), because saving a whole new plan replaces every stop.
- **Profiles:** a member's diet is `preferences.diet`, else what they told GhoomMate ("I'm Jain", "vegan"); everyone else eats the standard vegetarian thali.
- **Heritage:** the walk-in baseline reuses `dayFactor` (weekends ×1.12, Apr–Jun ×0.65, Jul–Sep ×0.85, Diwali and year-end ×1.2–1.3).
- **Gemini:** the smart model picks dishes from an enum of real dish ids in season and writes the stories, title and zero-waste tip. Quantities, farms and distances always come from our own data. If the smart model is busy or answers badly the lite model gets one try, then the curated menu answers. Output is validated (unknown, repeated or out-of-season dishes dropped, main and sweet restored, over-long text replaced). Menus are cached for 10 minutes and a user gets 10 per minute.

## The model

- **Covers** = squad bookings (real) + a modelled walk-in baseline per host, meal and day, capped by the seats the squads left. The baseline is hand-tuned, not measured.
- **Thali** = the six dishes of the month. One portion is about 0.85 kg of raw ingredients (flour, dal, ghee, produce; spices and salt are bought separately and left out).
- **Procurement** = covers × portions, per ingredient, assigned to the nearest partner farm that grows it and has it this month (fresh, or a stored harvest such as flour or dried ker-sangri). The rest goes to the market with the reason (out of season, no partner, pantry). Jain and vegan guests use each dish's swap (potato → paneer in the vada, ghee → oil) or skip a dish that cannot be adapted.
- **% local** = kilos from partner farms ÷ total kilos.

### Estimates and where they come from

Every impact number on screen is an estimate. The constants are in `plan.ts`.

| Assumption | Value | Basis |
| --- | --- | --- |
| Wholesale food miles | 250 km average | Our assumption for produce reaching Udaipur kitchens through the mandi chain (onions from Maharashtra, potatoes from UP/Punjab, greens and tomatoes from Gujarat/MP). Not measured. |
| Road-freight emissions | 0.08 kg CO₂e per tonne-km | GLEC Framework general road-freight default (Smart Freight Centre; see the India defaults below). |
| Farm road distance | straight line × 1.2–1.55 | Highway villages barely wind, Gogunda's hill road does. Eklingji ≈ 22 km and Gogunda ≈ 38 km match published road distances. |
| Surplus on an open buffet | 22% of prepared food left over | Midpoint of the 15–30% usually quoted for buffets; our assumption. |
| Surplus cooking to a known head-count | 6% | Our assumption (small safety margin). |
| Spoilage of perishable produce | 6% bought in bulk, 2% ordered twice a week to a forecast | Assumption. WRAP finds spoilage is 21% of hospitality food waste. |

**Waste avoided** = squad kilos × (22% − 6%) + perishable kilos from partner farms × (6% − 2%). The first part is the pre-booked-covers-versus-buffet comparison (≈ 0.14 kg per squad cover); the second is the effect of ordering fresh to the forecast. The dashboard shows both parts.

### Green Host score (0–100)

Local sourcing 40 (full marks at 95% of the food from partner farms) + waste per cover 30 (full marks at 0.05 kg, none at 0.25 kg; the host's own log replaces the reported figure after three logged days) + plastic-free 15 + water refill 15. Tiers: Gold 85+, Silver 70+, Bronze 55+. The weights are a judgment call, not a standard.

## Sources

- UNEP Food Waste Index Report 2024: about 19% of food available to consumers was wasted in 2022. https://www.unep.org/resources/publication/unep-food-waste-index-report-2024
- WRAP, Overview of Waste in the UK Hospitality and Food Service Sector (2013): 21% of waste is spoilage, 45% preparation, 34% plate waste; about 75% is avoidable. https://www.wrap.org.uk/content/overview-waste-hospitality-and-food-service-sector
- Smart Freight Centre, India default GHG emission values (GLEC Framework). https://smart-freight-centre-media.s3.amazonaws.com/documents/India_Default_GHG_Emission_Values_SFC_INDIA_v1_2.pdf
- ICAR-CRIDA district contingency plan for Udaipur: maize is the largest kharif crop (about 193,000 ha) and wheat the largest rabi crop; rainfed kharif sowing runs from late June to mid-July. https://icar-crida.res.in/CP/Rajastan/MPUA&T,%20Udaipur/RAJ22-Udaipur-9.3.2012.pdf
- Sangri pods are picked green in April and sun-dried; ker berries in March to May. https://site.outlookindia.com/traveller/rajasthan/sangri-the-soul-food-of-rajasthan/ and https://www.downtoearth.org.in/food/a-fruitful-journey-57031
- Village positions: Badgaon tehsil, Bhuwana, Eklingji, Gogunda and Ambamata Temple on Wikipedia; Kaladwas and Sisarma are approximate centres. Gangaur Ghat reuses the heritage module's coordinates.
- Jain food avoids onion, garlic and root vegetables. https://en.wikipedia.org/wiki/Jain_vegetarianism
- WhatsApp click-to-chat help page. The number-less form `https://wa.me/?text=…` opens WhatsApp's contact picker with the message prefilled (described by third-party guides such as https://www.unipile.com/es/?p=275019; worth a quick test on the demo phone). https://faq.whatsapp.com/5913398998672934

## Notes

- **WhatsApp orders:** the farm's group has a `https://wa.me/?text=…` link with the order prefilled and no phone number (the farms are fictional), so the host picks the contact in WhatsApp. We never send anything ourselves.
- **Leftover trend:** days without a log show an estimate from the kitchen's reported waste per cover, marked as an estimate, so the chart never has holes.
- **Dates** are India time (IST), whatever the server's clock says.
- **Not built:** real host accounts, farm-side ordering and confirmation, non-vegetarian menus, the voice agent.
