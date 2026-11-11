# Makers module (Makers of Udaipur)

Visitors struggle to find genuine artisans. Touts and machine-made “handicrafts” take the tourist rupee, and the makers (many in villages around Udaipur) lose income while the crafts fade. A squad is the right unit to fix this: 4–10 people make a full, worthwhile workshop for a maker, and one fair-price nudge protects the whole group's wallet. This module curates 14 living crafts and 16 sample makers, checks quotes against a fair-price guide, and lets a squad book a workshop that lands in the trip's itinerary.

## Pieces

| File | Role |
| --- | --- |
| `src/makers/crafts.ts` | 14 crafts: history, how it is made, GI tag (only where verified), handmade vs machine-made signs, a fair-price band per size, care. |
| `src/makers/makers.ts` | 16 **fictional** sample makers in real areas: story, generation, languages, women-led flag, a workshop offer (duration, ₹ per person, min/max group, weekly slots) and a few FAQs. |
| `src/makers/logic.ts` | Pure functions: `haversineKm`, `listMakers` (craft filter, nearest-to-a-site sort), `fairPriceCheck`, `availabilityFor` (slots for a date), the FAQ matcher and the facts Gemini may use. |
| `src/makers/ask.ts` | `POST /:id/ask`: Gemini answers from the maker's and craft's facts only; the best curated FAQ answer otherwise. |
| `src/makers/service.ts` | Booking: validates, checks the slot, saves the booking, adds the itinerary stop through the trips module. |
| `src/makers/store.ts` | `MakersStore` interface and the MongoDB store (`maker_bookings`, plus the `maker_slots` seat counters). |
| `src/makers/app.ts` | The router, mounted at `/api/makers`, and `createMongoMakers()` which wires the store and the trips bridge. |
| `src/schema.ts` | Indexes for `maker_bookings` and `maker_slots`. Crafts and makers live in code, not the database. |

Browsing, the price checker, slots and the ask box need **no sign-in and no database**. Booking needs both (a signed-in trip member), and answers `503 SERVICE_UNAVAILABLE` without a database.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/makers` | Makers. `?craft=<craftId>` filters; `?near=<siteId>` sorts nearest first and adds `fromSite` (km, walk or drive minutes); `?maxKm=1.5` keeps those within that straight-line distance |
| GET | `/api/makers/crafts` | The 14 crafts with `makerCount` |
| GET | `/api/makers/:id` | One maker: story, workshop with its weekly slots, the craft explainers (`craftDetails`), suggested questions, closed dates. `?near=<siteId>` adds `fromSite` |
| GET | `/api/makers/:id/slots?date=YYYY-MM-DD` | Sessions that day, places left, and why one can't be booked (`past`, `full`) |
| POST | `/api/makers/price-check` | `{ craftId, size: small \| medium \| large, quoted, antique? }` → verdict, fair range, counter-offer |
| POST | `/api/makers/:id/ask` | `{ question }` (≤ 300 characters) → `{ answer, source: gemini \| faq, matched }`. 20 questions a minute per client, then `429` |
| POST | `/api/makers/:id/bookings` | Signed-in trip member: `{ tripId, date, slot, people, note? }` → saves the booking and adds an itinerary stop. `201` |
| GET | `/api/makers/bookings?tripId=` | Your squad's confirmed workshops for the trip, soonest first |

Errors use the shared `{ "error": { "code", "message" } }` envelope. Booking errors: `400 DATE_OUTSIDE_TRIP`, `409 SLOT_UNAVAILABLE` (closed day, no such session, started or too soon, not enough places), `409 ALREADY_BOOKED`, `404` for a trip you aren't in.

## Fair-price check

Each craft has a ₹ range per size for a handmade piece bought from the maker (**estimates, not a price list**). The verdict compares the quote with the top of the range:

| Quote | Verdict |
| --- | --- |
| below 60% of the bottom | `too-low`: probably printed, moulded or machine-made |
| up to 110% of the top | `fair` |
| up to 130% of the top | `a-bit-high`: offer 60% of the way up the range, settle at the top |
| above 130% | `tourist-price`: offer 40% of the way up the range, walk away above the top |

The demo case: a ₹2,500 “antique” medium (A4) Mewar miniature is 1.4× the top of ₹800–₹1,800, so it is a tourist price, with a counter of ₹1,200. With `antique: true` the answer adds the legal point that anything over 100 years old needs ASI clearance to leave India (Antiquities and Art Treasures Act, 1972, [WIPO Lex](https://www.wipo.int/wipolex/en/legislation/details/14946)), so an “antique” at a bazaar price is new work aged with tea.

## Booking and the itinerary stop

1. The trip is checked with `TripService.access` (non-members get 404).
2. The date becomes a day number of the trip (`400 DATE_OUTSIDE_TRIP` if it falls outside; trips without dates take `dayNumber` or day 1).
3. The slot must exist that weekday, not be a closed date (Diwali, 8 Nov 2026, is closed for every maker), start at least three hours from now, and have room: every session takes up to the maker's maximum group, and a group needs at least the minimum.
4. The booking is written in a transaction that first adds its people to the slot's `maker_slots` counter (`$inc`, `_id` = maker, date and slot) and refuses if the total passes the maximum group. Two squads booking at once write-conflict on that counter and the loser retries against the new total, so they can't both take the last places. Cancelling gives the places back.
5. The stop is added with the trips module's own `ItineraryService.addStop`, tagged Culture, with the cost, the maker and what you take away in the notes. The `place` text deliberately avoids heritage-site names so the itinerary doesn't attach a crowd forecast (and a “move to a quieter time” nudge) to a workshop. If the stop can't be added, the booking is cancelled, so nobody is booked into a session that isn't in the plan.

Payment is not handled: the stop says to pay the maker directly (UPI or cash). Booking is simulated for the sample makers.

## Ask a maker

`POST /:id/ask` sends Gemini (`gemini.json`, an 8-second timeout, temperature 0.2) the maker's and craft's facts as the only allowed source, and asks for `{ answer, grounded }`. Only a grounded answer is used. If Gemini is off, slow, errors, is unsure or returns something malformed, the best matching curated FAQ answer is returned (`source: "faq"`); if nothing matches, the answer points to the workshop. The question is passed as quoted text and the prompt tells the model to ignore instructions inside it.

## Data and sources

Everything is hand-written from the sources below. **Makers are fictional**: the names, families and stories are invented sample partners; the places, crafts and facts about them are real. Coordinates are approximate (to the lane). Walking time is 1.3× the straight line at 80 m a minute, driving 1.3× the straight line at 50 km/h plus 8 minutes. Village makers (Molela, Nathdwara, Akola) are measured from the City Palace.

### GI tags

A craft carries `gi` only if the Geographical Indications Registry, or a source that cites it, confirms it. Five are tagged:

| Craft | Registered as | Source |
| --- | --- | --- |
| Pichwai | Nathdwara Pichhwai Painting, application 748, registered 2023 | [GI Registry](https://search.ipindia.gov.in/GIRPublicSearch/Application/Details/748), [NABARD](https://www.nabard.org/GI/GIProductDetails.aspx?Id=56) |
| Koftgari | Udaipur Koftgari Metal Craft, 2023 | [NABARD](https://www.nabard.org/GI/GIProductDetails.aspx?Id=68), [Udaipur Times, 10 Aug 2023](https://udaipurtimes.com/news/udaipur-koftgiri-art-got-gi-tag/cid11884763.htm) |
| Molela terracotta | Molela Clay Work, 2008 (logo registration 2016–17) | [Outlook Traveller](https://www.outlooktraveller.com/explore/culture/the-gi-tagged-molela-clay-art-of-rajasthan), [list of Indian GIs](https://en.wikipedia.org/wiki/List_of_geographical_indications_in_India) |
| Kathputli | Kathputlis of Rajasthan, application 68 (sources differ on the year: 2006 filing, 2008 registration, so the app shows no year) | [NABARD](https://www.nabard.org/GI/kathputlis-of-rajasthan.aspx), [list of Indian GIs](https://en.wikipedia.org/wiki/List_of_geographical_indications_in_India) |
| Thewa | Thewa Art Work, application 244, certificate 31 March 2014 | [Business Standard, June 2014](https://www.business-standard.com/article/pti-stories/rajasthan-s-thawa-art-gets-gi-tag-114061601200_1.html), [application](https://www.origin-gi.com/wp-content/uploads/2017/01/182-thewa-art-work.pdf) |

Deliberately **not** tagged: Mewar miniature painting, Kavad (the Kavdi Maal GI is Tuljapur, Maharashtra), Bandhej (the registered GI is *Jodhpur* Bandhej Craft, 2023, which doesn't cover Udaipur's), Meenakari (Banaras Gulabi Meenakari is Uttar Pradesh), Dabu (“Aakola Dabu Prints” is application 845, status pre-examination per [IP India](https://search.ipindia.gov.in/GIRPublicSearch/Application/Details/845)), silver jewellery, stone carving (*Makrana Marble*, 2014–15, is a GI for the stone, not for carving), wooden toys (the registered toy GI is Chitrakoot, Uttar Pradesh), hand-stitched leather.

### Craft facts

- Pichwai: Shrinathji's image reached Nathdwara in 1672; hand-painted cloth backdrops ([Nathdwara painting](https://en.wikipedia.org/wiki/Nathdwara_painting)).
- Molela: flat-relief terracotta plaques made only in Molela village, Rajsamand, on the Banas river, about 45–50 km from Udaipur ([Outlook Traveller](https://www.outlooktraveller.com/explore/culture/the-gi-tagged-molela-clay-art-of-rajasthan)).
- Koftgari: gold or silver wire inlaid in steel by the Sikligar and Gadi Lohar communities ([NABARD](https://www.nabard.org/GI/GIProductDetails.aspx?Id=68)).
- Thewa: gold fused onto coloured glass in Pratapgarh since the 1760s, kept within a few families ([Business Standard](https://www.business-standard.com/article/pti-stories/rajasthan-s-thawa-art-gets-gi-tag-114061601200_1.html)).
- Dabu: mud, lime and gum resist printed with carved blocks, sawdust, indigo vat, by Chhipa families of Akola ([Dabu printing](https://en.wikipedia.org/wiki/Dabu_printing), [Gaatha](https://gaatha.com/dabu-print-akola/)).
- Kathputli: made and played by the Nat and Bhat communities ([NABARD](https://www.nabard.org/GI/kathputlis-of-rajasthan.aspx)).
- Wooden toys: soft doodhia wood, lacquered and polished ([Arty and Crafty in Udaipur](https://www.bindugopalrao.com/arty-and-crafty-in-udaipur/)); lac sticks pressed on the turning wood so friction smears the lac, with Udaipur named as a centre ([Global Inch](https://globalinch.org/craft/wooden-lacquerware-of-rajasthan/)); shops around Hathi Pol and Ghantaghar ([Udaipur Times](https://udaipurtimes.com/shopping-our-lifestyle/shopping-wooden-toys/c74416-w2859-cid131456-s10806.htm)).
- Leather: royal patronage and the hand-stitched, vegetable-tanned journals made in the lanes around Jagdish Temple ([Global Voices](https://globalvoices.org/2024/10/19/photo-essay-from-royal-patronage-to-modern-artisans-udaipur-indias-rich-leather-legacy/)).
- Miniature, Kavad, Bandhej, Meenakari and silver: general craft knowledge (the Mewar school from the early 1600s, kavad doors that open onto a story, tied dots resisting dye, enamel fired onto metal, sterling silver stamped 925).

### Estimates

The fair-price bands, workshop prices, workshop durations and drive times are **estimates** written for the demo, not quotes. Silver and gold change daily: the app tells visitors to ask for the weight and today's rate.

## Cover art

`frontend/public/makers/<craftId>.jpg` (900 px wide, under 150 KB each) was generated once with `gemini.image()` (Vertex AI, `gemini-2.5-flash-image`, 4:3) from one prompt per craft: a warm documentary photograph of hands at work, with no text and no faces. Where the model put a stray face at the edge of the frame, the picture was cropped. The prompts live in `scripts/makers-covers.ts` (`node scripts/makers-covers.ts <outDir> [craftId ...]`, then crop and compress with `sips`).

## Frontend

All in `frontend/src/pages/Makers/`, with the API client in `src/services/makersService.ts`. Three entry points reach it:

| Where | What |
| --- | --- |
| Explore tab → “Makers of Udaipur” (`MakersSection`, Udaipur trips only) | A row of the 14 craft cards (cover art, Hindi name, maker count, GI badge). A card opens the list filtered to that craft. |
| `#/trip/explore/makers[?craft=<id>&near=<siteId>]` (`MakersListPage`) | Craft filter chips and a “Near <your next heritage stop>” sort (or “Our picks”). Measured from the `near` site, else the next heritage stop in the itinerary, else City Palace. |
| `#/trip/explore/makers/<id>` (`MakerDetailPage`) | Hero art, story, the craft explainer (steps, GI note), how to spot the real thing, the fair-price checker (`PriceChecker`), the workshop, an ask box (`AskMaker`), a Google Maps directions link, and the booking sheet (`BookingSheet`: day, time, headcount defaulting to the squad size, total in ₹). Booking shows a toast, and the new stop is in the itinerary. |
| Stop screen (`MakersNearby`, one line in `StopDetailPage`) | For a stop at a heritage site: the makers within 1.5 km, nearest first, opening the maker page with the stop to come back to. For the stop a booking created: a “Your workshop is booked” card with studio directions. |

The pages use the craft cover as hero art. Back goes to wherever the screen was opened from (`?from=trip/itinerary/stop/<id>`), and the booking sheet starts on the day of that stop. Loading, error and empty states use the shared `Skeleton`, `ErrorState` and `EmptyState`; the Explore row hides itself if the crafts can't load.

## Known gaps

- Bookings are simulated for the sample makers and can't be cancelled from the app (delete the stop to drop it from the plan; the places stay counted).
- Prices aren't added to the trip's expenses automatically.
- Slot availability counts bookings made through the app only.
