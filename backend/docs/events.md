# Events module (Mewar Utsav)

Udaipur’s living heritage is its festivals and its nightly culture: Gangaur at the ghat, the Rath Yatra chariot rolling out of Jagdish Chowk, a folk-dance show in a haveli courtyard. Visitors miss most of it, and on the days it happens the old city’s lanes and ghats overflow. A squad that knows in advance can join respectfully, or plan around the crush; one nudge moves 4–10 people at once.

This module holds a **verified calendar** from November 2026 to December 2027, makes the heritage crowd model **festival-aware** (so the map, the itinerary, the voice agent and the Heritage Ops forecast all rise on festival days at the right sites and hours), and lets a signed-in member **put an event in the trip’s itinerary**.

## Pieces

| File | Role |
| --- | --- |
| `src/events/calendar.ts` | The curated data: 17 events (festivals, fairs, rituals, processions, two nightly shows, the year-end season). Per event: id, English and Hindi names, verified runs of dates, hours, places (heritage site ids where they match), a respectful significance, how to join (etiquette, dress, photography), tips for squads, the crowd impact per affected site, and the stop it adds to a plan. |
| `src/events/lift.ts` | Pure lookups the crowd model calls inside `levelAt`: the multiplier, floor and late opening a festival gives a site at a minute of a day. Imports only the calendar, so `heritage/crowd.ts` can use it without a cycle. |
| `src/events/logic.ts` | Pure functions: which events fall in a window, each event’s crowd at the sites it touches, and “plan around it” (a quieter time, a quieter site, where else is calm). |
| `src/events/service.ts` | Adds an event to a trip’s itinerary through the trips module’s own `ItineraryService.addStop`. |
| `src/events/ask.ts` | “Ask GhoomMate about this festival”: Gemini answers from the event’s facts only; the best matching curated note answers otherwise. |
| `src/events/app.ts` | The router, mounted at `/api/events` before the catch-all `/api` ledger in `src/app.ts`, and `createPostgresEvents()` which wires the trips bridge. |
| `src/events/dates.ts` | Calendar-day maths on `YYYY-MM-DD` strings in India’s time. |
| `src/voice/skills/events.ts` | A GhoomMate voice skill, `whats_on`: “is Diwali during our trip?”, “aaj kuch special hai?” |

**No migration.** The calendar lives in code, like the heritage sites and the makers; adding to a plan writes an ordinary `trip_stops` row through the trips module.

## Endpoints

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/events?city=Udaipur&from=YYYY-MM-DD&to=YYYY-MM-DD` | Public, needs no database. Defaults to today and the next 120 days (at most 800). Returns `items` (one per run of days that touches the window, soonest first), `recurring` (the nightly shows) and `undated` (events whose dates aren’t announced yet). |
| POST | `/api/events/:id/ask` | Public. `{ question }` (at most 300 characters) → `{ answer, source: gemini \| faq, matched }`. 20 questions a minute per client, then `429`. |
| POST | `/api/events/:id/stops` | Signed-in trip member: `{ tripId, date, time?, dayNumber? }` adds the event’s stop to that day of the plan. `201` with the stop and what the crowd model says about it. |

Each item carries: dates and the `basis` that verifies them, `status` (`today`, `tomorrow`, `ongoing`, `upcoming`), places with map points, hours, significance, `join` (etiquette, dress, photography), tips, price, sources, a `tripTip` template for the itinerary, and `crowd`:

```
crowd: {
  date, label, level, headline, modelled,
  sites: [{ siteId, siteName, windowLabel, dates, note, peak, usual, forecast[], quieterTime, quieterSite }],
  calm: [{ id, name, level, label, km }]
}
```

`modelled` is true when the label comes from the heritage model; Nathdwara, Eklingji and the Gavri villages have no Udaipur site, so they use the event’s own curated intensity and note.

Adding to a plan: the date picks the day of the trip (`400 DATE_OUTSIDE_TRIP` if it falls outside; a trip without dates takes `dayNumber`, day 1 by default), the event must run that day (`400 DATE_OUTSIDE_EVENT`; nightly shows run every day), and the same stop can’t be added twice to a day (`409 ALREADY_ADDED`). A season (the year-end peak) is a heads-up, not a stop (`400`). Non-members get `404`, like the trips module. An event whose dates aren’t out yet can be added, with a note to check the dates.

## How an event moves the crowd

The heritage model gives a site a level (0–100) from its hourly curve and a day factor (weekend ×1.12, Apr–Jun ×0.65, Jul–Sep ×0.85, and the festival periods Diwali ×1.2 and the year-end holidays ×1.3). A festival adds one more factor, specific to a site and hours:

```
level(site, minute, date) = min(100, max( curve(site, minute) × dayFactor(date) × lift, floor ))
```

- **`lift`** is the event’s multiplier for that site in its window. The window eases in and out over 30 minutes either side (`RAMP_MINUTES`), so a forecast curve never has a cliff. Overlapping events don’t stack: the strongest one wins.
- **`floor`** keeps a site that is usually empty at that hour readable (Moti Magri on kite day, Gangaur Ghat for the Mewar Festival).
- **`opens`** lets a festival open a site outside its usual hours: Jagdish Temple is shut 2–4 PM except while the Rath Yatra chariot rolls, and the City Palace stays open after the museum closes for Holika Dahan in Manek Chowk. `isOpen(site, minutes, date)` and `levelAt` see it, and so do the quiet-hour and nudge logic.
- **`peakOnly`** impacts apply on the run’s main days (Diwali night, not Dhanteras), while the bazaar is lifted on all of them.
- It multiplies **on top of** the city-wide day factor (Diwali’s ×1.2), so a festival day reads busier at the touched sites than a plain festival-season day. A day with no event is exactly the model as it was: a test compares every site and quarter hour on four ordinary dates with and without the event layer.

Because the factor sits inside `levelAt`, everything that reads the model follows:

| Surface | What changes on a festival day |
| --- | --- |
| Itinerary (`crowd` on each stop) | The level, the hourly forecast and the nudge reflect the festival; `events` lists what touches the site and `dayNote` says why (“Busier than usual: it’s Rath Yatra”). A stop added from the calendar keeps the event’s own time (no “move to 9 AM” on a procession) and the stop screen shows the event’s advice instead of the site’s. |
| Live view (`GET /api/heritage/:city/live`) | Site levels, trend, quiet-at times and `events` per site; the city `dayNote`. |
| Voice (`check_crowds`) | Mentions the festival at the site. |
| Heritage Ops forecast | The baseline for every hour includes the festival, the day note names it, and the demo’s sample squads (`ops/sample.ts`) arrive in greater numbers at the touched sites. |
| Heritage Ops advisories | Drafts use the festival-aware forecast to find the calmer site and time. |

Windows, multipliers and floors are **planning estimates, not measurements**. They were set so the model says what residents and local guides say (the old city is packed from about 6 PM on Diwali night; Jagdish Chowk is very heavy from 2 to 7 PM on Rath Yatra), and would come from gate scans, Popular Times and app check-ins in production.

| Event | Site | Hours | Multiplier | Also | Days |
| --- | --- | --- | --- | --- | --- |
| Diwali | Hathi Pol Bazaar | 11 AM–9:30 PM | ×1.5 |  | every day |
| Diwali | Jagdish Temple | 4:30–10 PM | ×1.3 |  | main day |
| Diwali | Gangaur Ghat | 5–10 PM | ×1.35 |  | main day |
| Diwali | Ambrai Ghat | 5–10 PM | ×1.25 |  | main day |
| Diwali | Bagore ki Haveli | 5:30–8:15 PM | ×1.15 |  | main day |
| Kartik Purnima | Gangaur Ghat | 5:30–8:30 AM | ×1.5 | floor 42, opens the site | every day |
| Kartik Purnima | Gangaur Ghat | 5–9 PM | ×1.3 |  | every day |
| Kartik Purnima | Jagdish Temple | 5–9 AM | ×1.3 |  | every day |
| Kartik Purnima | Jagdish Temple | 5–9 PM | ×1.2 |  | every day |
| Shilpgram Utsav | Shilpgram crafts village | 11 AM–10 PM | ×2.2 | floor 60, opens the site | every day (dates not out yet) |
| Christmas–New Year peak | Fateh Sagar Lake | 5–11 PM | ×1.2 |  | main days (31 Dec, 1 Jan) |
| Christmas–New Year peak | Ambrai Ghat | 5–11 PM | ×1.2 |  | main days |
| Christmas–New Year peak | Gangaur Ghat | 5–10 PM | ×1.15 |  | main days |
| Christmas–New Year peak | Lake Pichola boat ride | 10 AM–6 PM | ×1.15 |  | every day |
| Christmas–New Year peak | City Palace | 10 AM–5:30 PM | ×1.1 |  | every day |
| Makar Sankranti kites | Moti Magri | 3–5:30 PM | ×1.7 | floor 66 | main day (14 Jan) |
| Makar Sankranti kites | Fateh Sagar Lake | 3–6:30 PM | ×1.35 |  | main day |
| Makar Sankranti kites | Gangaur Ghat | 3:30–6:30 PM | ×1.3 |  | main day |
| Makar Sankranti kites | Sajjangarh Monsoon Palace | 3–6 PM | ×1.3 |  | main day |
| Holika Dahan | City Palace | 5:30–9 PM | ×1 | floor 85, opens the site | the evening |
| Holika Dahan | Jagdish Temple | 5–8:30 PM | ×1.25 |  | the evening |
| Holika Dahan | Gangaur Ghat | 5–8:30 PM | ×1.25 |  | the evening |
| Holika Dahan | Bagore ki Haveli | 5:30–8:15 PM | ×1.2 |  | the evening |
| Holi | Gangaur Ghat | 10 AM–3 PM | ×1.4 |  | the day |
| Gangaur and the Mewar Festival | Gangaur Ghat | 3–10 PM | ×1.7 | floor 85, opens the site | all three days |
| Gangaur and the Mewar Festival | Jagdish Temple | 3–8 PM | ×1.3 |  | all three days |
| Gangaur and the Mewar Festival | Bagore ki Haveli | 4–9 PM | ×1.3 |  | all three days |
| Gangaur and the Mewar Festival | Ambrai Ghat | 5–10 PM | ×1.25 |  | all three days |
| Jagannath Rath Yatra | Jagdish Temple | 2–7:30 PM | ×1.5 | floor 90, opens the site | the day |
| Jagannath Rath Yatra | Hathi Pol Bazaar | 2–7 PM | ×1.35 |  | the day |
| Jagannath Rath Yatra | Bagore ki Haveli | 2–7 PM | ×1.25 |  | the day |
| Jagannath Rath Yatra | Gangaur Ghat | 3–7 PM | ×1.25 |  | the day |
| Jagannath Rath Yatra | City Palace | 2–5:30 PM | ×1.15 |  | the day |
| Hariyali Amavasya Mela | Fateh Sagar Lake | 12–9 PM | ×1.8 | floor 80 | the day |
| Hariyali Amavasya Mela | Saheliyon ki Bari | 11 AM–7 PM | ×1.3 | floor 70 | the day |
| Hariyali Teej | Jagdish Temple | 3–6 PM | ×1.2 |  | the day |

Events with no Udaipur site (Annakut and Janmashtami at Nathdwara, Maha Shivratri at Eklingji, Gavri in Bhil villages) carry a curated intensity and crowd note instead, and the nightly shows are measured at their own site with no extra factor (Dharohar at Bagore ki Haveli reads packed at 7 PM because the site’s curve already says so).

## Plan around it

Each touched site is measured on the day that matters for it (today if the event touches it today, else the run’s main day, else the next day it does), over each stretch of the day the event touches it (dawn and dusk for Kartik Purnima), and sites are listed busiest first, ties going to the site the event names first. `logic.ts` finds:

- **the peak** inside the window and the same minute without the festival (`usual`), plus an hourly curve with and without it;
- **a quieter time**: the nearest half hour outside the event’s window that is below “busy” and at least 20 points lower, on the same day (“50% fewer people than at 5 PM”);
- **a quieter site**: from the site’s own “same feel” list, whichever is below “busy” at the peak (Neemach Mata hilltop for the ghats);
- **calm elsewhere**: up to three other sites open and below “busy” an hour either side of the peak, preferring gems and short trips from the busiest site.

The itinerary’s existing nudge (`suggestFor`) and the Ops advisory draft use the same festival-aware levels, so a stop at Gangaur Ghat on Mewar Festival evening is offered the quieter hour or a hilltop swap.

## Ask GhoomMate

`POST /api/events/:id/ask` sends Gemini (`gemini.json`, an 8-second timeout, temperature 0.2) the event’s own facts as the only allowed source (when and where, what it is about, how to join respectfully, what to wear, photography, the crowd and where it bites, tips, the ticket) and asks for `{ answer, grounded }`. Only a grounded answer is used. If Gemini is off, slow, errors, is unsure or returns something malformed, the best matching curated note is returned (`source: "faq"`): nine questions built from the event’s own data, matched by keywords; if nothing matches, the answer points to a local guide or the hotel host. The visitor’s question is passed as quoted text and the prompt tells the model to ignore instructions inside it.

## Dates: how each was checked

Verified on 1 November 2026. **A date is only listed if a panchang (Drik Panchang, which gives tithi start and end times for India) or an official listing (Incredible India / Rajasthan Tourism, the City Palace and Eternal Mewar, the Udaipur Municipal Corporation) gives it for that year.** Everything else says “Dates announced closer to the time” and has no date.

| Event | Dates | How checked |
| --- | --- | --- |
| Diwali | Dhanteras Fri 6 – Lakshmi Puja Sun 8 Nov 2026; Wed 27 – Fri 29 Oct 2027 | [Drik Panchang 2026](https://www.drikpanchang.com/festivals/lakshmipuja/festivals-lakshmipuja-timings.html?year=2026): Amavasya from 11:27 AM on 8 Nov to 12:31 PM on 9 Nov. [2027 calendar](https://www.drikpanchang.com/diwali/diwali-puja-calendar.html?year=2027). The city-wide factor already covered 6–10 Nov. |
| Annakut at Nathdwara | Tue 10 Nov 2026; Sat 30 Oct 2027 | Drik Panchang Govardhan Puja pages ([2026](https://www.drikpanchang.com/festivals/govardhan-puja/govardhan-puja-date-time.html?geoname-id=1277333): Pratipada 12:31 PM 9 Nov to 2:00 PM 10 Nov, so it is at sunrise on the 10th; [2027](https://www.drikpanchang.com/festivals/govardhan-puja/govardhan-puja-date-time.html?year=2027)). Some US and UK calendars say Mon 9 Nov; India’s panchang says the 10th. The temple board announces its own darshan times. Custom: [Nathdwara temple site](https://nathdwara.in/annakuta.php). |
| Kartik Purnima | Tue 24 Nov 2026; Sat 13 – Sun 14 Nov 2027 | Drik Panchang ([2026](https://www.drikpanchang.com/purnima/kartik/kartik-purnima-date-time.html?year=2026): Purnima 11:42 PM 23 Nov to 8:23 PM 24 Nov; [2027](https://www.drikpanchang.com/purnima/kartik/kartik-purnima-date-time.html?year=2027): 9:55 AM 13 Nov to 8:55 AM 14 Nov, so the evening lamps may fall on the 13th and the dawn dip on the 14th). Udaipur custom: [Udaipur Times](https://udaipurtimes.com/events/devotees-celebrate-kartik-poornima/c74416-w2859-cid119629-s10700.htm). |
| Shilpgram Utsav | **none** | No 2026 announcement found. The ten-day fair opened on 21 Dec 2025 ([Udaipur Times](https://udaipurtimes.com/events/shilpgram-festival-from-dec-21/cid17922246.htm)) and guides say it usually runs 21–30 Dec; the West Zone Cultural Centre announces dates annually. Add an occurrence in `calendar.ts` when it does; the impact is already there. |
| Christmas–New Year peak | 24 Dec – 1 Jan, both years | Calendar dates. Peak: [ETV Bharat](https://etvbharat.com/en/!state/udaipur-ready-to-ring-in-new-year-christmas-hoteliers-eye-record-tourist-inflow-enn24120802513) and [Udaipur Times](https://udaipurtimes.com/travel-and-tourism/udaipur-hotels-booking-full-for-new-year-and-christmas/cid12832335.htm) on hotels booked out from Christmas to the first week of January. |
| Makar Sankranti | Thu 14 – Fri 15 Jan 2027 | [Incredible India](https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/kite-festival) lists the Rajasthan kite festival on 14 Jan 2027. The Sankranti moment is 9:14 PM IST on the 14th, so [Drik Panchang](https://www.drikpanchang.com/sankranti/makar-sankranti-date-time.html?geoname-id=1273294) keeps the 15th for the punya kaal; kites fly both days. In 2026 the tourism department ran sessions 4–5:30 PM at Fateh Sagar, Gangaur Ghat, Moti Magri and Sajjangarh ([Udaipur Times](https://udaipurtimes.com/around-town/kite-festival-at-4-tourist-spots/cid18113215.htm)); the 2027 programme isn’t out. |
| Maha Shivratri | Sat 6 Mar 2027 | [Drik Panchang](https://www.drikpanchang.com/festivals/maha-shivaratri/maha-shivaratri-date-time.html): Chaturdashi from 12:03 PM on 6 Mar, night puja just after midnight. Eklingji: [Wikipedia](https://en.wikipedia.org/wiki/Eklingji) (the Maharana rules as his Diwan), [Udaipur Times](https://udaipurtimes.com/celebrations/photos-thousands-flock-ekling-nathji-temple-on-maha-shiv/c74416-w2859-cid101123-s10699.htm) (open through the night, devotees walking), [The Mooknayak](https://en.themooknayak.com/society/udaipur-temple-bans-mobile-phones-short-clothes) (phones and short clothes banned, Dec 2024). |
| Holika Dahan at the City Palace | Sun 21 Mar 2027 | [Drik Panchang](https://www.drikpanchang.com/festivals/holi/festivals-holika-dahan-timings.html?year=2027). The ceremony (parade from the royal residence to Manek Chowk, the fire at twilight, Gair dancers): [Eternal Mewar](https://eternalmewar.in/microwebsites/holika-dahan). Procession “typically around 6 PM” and entry by pass: [Outlook](https://www.outlookindia.com/brand-studio/royal-holi-udaipur-2026-holika-dahan-ashwa-poojan-at-city-palace) (which contradicts itself on ticketing, so the app says to confirm with the palace). |
| Holi | Mon 22 Mar 2027 | Drik Panchang (same page): Rangwali Holi the day after Holika Dahan. |
| Gangaur and the Mewar Festival | Fri 9 – Sun 11 Apr 2027 | [Incredible India](https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/mewar-festival-2026) (the page’s address still says 2026 but it lists 9–11 April 2027, at Jagdish Chowk, Gangaur Ghat and Gogunda, run by the District Administration and the Tourist Reception Center). [Drik Panchang](https://www.drikpanchang.com/festivals/gangaur/gangaur-date-time.html?year=2027): Gangaur on Fri 9 Apr. What happens: [Udaipur Times 2024](https://udaipurtimes.com/celebrations/mewar-festival-celebrations-2024-in-udaipur-started/cid14127942.htm) (processions, royal boats, fireworks at Gangaur Ghat), [Udaipur Municipal Corporation](https://udaipurmc.org/pages/festivals) (the 18-day festival after Holi). |
| Jagannath Rath Yatra | Mon 5 Jul 2027 | [Drik Panchang](https://www.drikpanchang.com/festivals/ratha-yatra/jagannatha-rathayatra-date-time.html?year=2027): Ashadha Shukla Dwitiya. Udaipur: the silver chariot from Jagannath Dham and Jagdish Chowk ([Eternal Mewar](https://www.eternalmewar.in/media/newsletter/templates/2024/nl241/vol241_5.html)), about 3 PM from Jagdish Chowk in 2022 ([DNA India](https://www.dnaindia.com/india/video-jagannath-rath-yatra-to-begin-at-3-pm-in-udaipur-amid-high-security-arrangement-2965177)), route through Bada Bazaar and back for the evening aarti ([Udaipur Blog](https://udaipurblog.com/?p=21549)). 2027 timings aren’t announced. |
| Hariyali Amavasya Mela | Mon 2 Aug 2027 | [Drik Panchang](https://www.drikpanchang.com/festivals/sawan/hariyali-amavasya-date-time.html?year=2027). The Udaipur Municipal Corporation runs a two-day fair at Fateh Sagar and Saheliyon ki Bari, the second day for women and girls ([Incredible India](https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/hariyali-amavasya): 12–13 Aug 2026). Only the new-moon day is listed for 2027; the second day follows the pattern. |
| Hariyali Teej | Wed 4 Aug 2027 | [Drik Panchang](https://www.drikpanchang.com/festivals/teej/hariyali-teej-date-time.html). The Udaipur colour (processions near Jagdish Chowk, mehndi, swings) is from a single guide ([Hotel guide to Udaipur’s festivals](https://hidmc.com/blog-posts/a-guide-to-udaipurs-festivals-from-mewar-to-shilpgram)), so the copy is kept light. |
| Janmashtami at Nathdwara | Wed 25 – Thu 26 Aug 2027 | [Drik Panchang](https://www.drikpanchang.com/dashavatara/lord-krishna/krishna-janmashtami-date-time.html?year=2027): one date for both traditions, Nandotsav the next day. The temple’s rhythm (jagran darshan, hush, conch and gong at midnight): [Pushtimarg.net](https://pushti-marg.net/Janmastami.htm), [temple notice](https://www.nathdwaratemple.org/News/Darshan_Time_Shri_Krishna_Janmashthami_Mahotsav_on_25.08.2016/2016-08-25). Darshan times are announced by the temple board. |
| Gavri | 18 Aug – 26 Sep 2027 | Derived from an official rule: [Incredible India](https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/gavri) says Gavri starts the day after Raksha Bandhan and runs 40 days (its 2026 listing is 29 Aug – 7 Oct, exactly that). Raksha Bandhan 2027 is Tue 17 Aug ([Drik Panchang](https://www.drikpanchang.com/festivals/raksha-bandhan/raksha-bandhan-date-time.html)). Which village hosts on which day is set locally, so the app sends visitors through a guide. |
| Dharohar folk dance show | every evening, 7:00–8:00 PM | Bagore ki Haveli, run by the West Zone Cultural Centre ([the haveli’s site](https://sites.google.com/view/bagorekihaveli/home)); 7–8 PM, counter from about 6 PM, ₹90 for an Indian adult and ₹150 for a foreign adult, camera fee ₹150 ([Oct 2025 listing](https://tejofy.blogspot.com/2025/10/bagore-ki-haveli-udaipur-ticket-price.html)); ₹125 for an Indian adult ([Sept 2026 listing](https://www.topindianholidays.com/blog/bagore-ki-haveli-udaipur)). Listings differ, so the app says “roughly ₹90–125” and to pay at the counter. |
| Kathputli puppet show | 12 noon, 6 PM and 7:15 PM daily | [West Zone Cultural Centre](https://wzcc.nvli.in/puppetry-bharatiya-lok-kala-mandal-udaipur) and [Trawell](https://trawell.in/rajasthan/udaipur/bharatiya-lok-kala-mandal-museum); prices differ by listing (₹120–170), so the app says “roughly”. |

Things we could not pin down are said so in the app: the Nathdwara darshan times, the 2027 Rath Yatra and Gangaur procession hours, the Shilpgram dates, the kite programme. Corrections are welcome: change the data in `calendar.ts` and the `basis` line beside it.

## Without a database, Gemini or GCS

Browsing, the crowd model and “plan around it” are pure code over curated data: no database, no Gemini, no storage. Asking a question works without Gemini too, from the curated notes. Only adding to a plan needs the database (it answers `503 SERVICE_UNAVAILABLE` without one). The voice skill and the frontend degrade the same way: a failed events request just hides the Explore section, the CrowdPulse line and the itinerary tip.

## Frontend

All in `frontend/src/pages/Events/`, with the API client in `src/services/eventsService.ts`.

| Where | What |
| --- | --- |
| Explore tab → “This week in Mewar” (`EventsSection`, Udaipur trips only) | A row of the next few festivals and shows, each with its date, place, hours and a crowd chip; “Coming up in Mewar” when nothing is on this week. |
| `#/trip/explore/events[?e=<id>]` (`EventsPage`) | The upcoming list grouped by week (this week is the next seven days), with the nightly shows and the events whose dates aren’t out. Each card (`EventCard`): date, place, significance, how to join respectfully with an “Ask GhoomMate” box (`AskEvent`), a crowd warning chip, **Add to our itinerary** (`AddToTripSheet`: pick a day) and **Plan around it** (`PlanAroundSheet`: the hour-by-hour forecast with and without the festival, the quieter time and site per place, where else is calm). |
| CrowdPulse → the selected site (`FestivalLine`) | A badge and a line when a festival touches that site today or tomorrow (“Jagannath Rath Yatra: very heavy crowds at Jagdish Temple, 2–7:30 PM”), or on a day of the squad’s trip, with the quieter hour or place from the model and a link to “Plan around it”. |
| Itinerary → top of the plan (`FestivalTip`) | A GhoomMate tip when the trip’s dates overlap a festival: “Your Day 2 is Diwali. The City Palace lights up after dark, but the old-city lanes are packed from about 6 PM.” |

## Known gaps

- Impact windows and multipliers are estimates, and the sample squads in Heritage Ops are simulated (see `ops.md`).
- Eklingji and Nathdwara are not in the heritage site list, so their crowds use a curated note rather than the model.
- Only Udaipur has an events calendar.
- A trip’s date change doesn’t move a stop added from the calendar to a new festival day; the squad edits it like any stop.
