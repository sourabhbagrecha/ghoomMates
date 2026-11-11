# Hackathon additions: Heritage, Tourism & Sustainable Hospitality

Everything added to GhoomMates for the Udaipur track during the push on 1 November 2026. All of it is merged into `main`.

- 608 backend tests pass (up from 88 at the start); typecheck and the frontend build are clean.
- Lint shows only the 3 warnings that were already there.
- Size of the change: 471 files changed, about 44,000 lines added.

Every feature works for a squad (one action moves 4–10 people). Every feature also keeps working without Gemini, the database or storage, falling back to hand-written content.

## At a glance

| Feature | Track hint it answers | Where in the app |
|---|---|---|
| Maker Trail | Artisan discoverability | Explore → Makers of Udaipur; "Makers nearby" on stops |
| Kaavad Tales + Heritage Passport | Interactive storytelling | "Hear the story" on stops; Explore → Stories of Mewar |
| Green Trip | Sustainable tourism | Green trip card on the Itinerary tab |
| Heritage Ops console | Smart crowd management | Profile → Partner tools → Heritage Ops (`#/ops`); "Heads up" banners for travellers |
| Mewar Thali Table | Farm-to-table sourcing; eco-conscious hospitality operations | Explore → Farm-to-table; Profile → Host kitchen (`#/host`) |
| Mewar Utsav | Living heritage; crowd management | Explore → This week in Mewar; festival lines in Crowd pulse |
| Demo readiness | — | Trip dates from today, change dates, Udaipur Plan screens |

## Features

### 1. Maker Trail: artisans and fair prices
- **What it does:**
  - Lists 14 Udaipur crafts with a history, how each is made, how to spot the real thing, and a fair-price guide. Examples: Mewar miniature, Pichwai, Molela terracotta, Kavad, Koftgari, Thewa, Dabu print.
  - Each craft shows its GI tag only where the tag was verified.
  - 16 sample makers, with fictional names in real neighbourhoods and villages.
  - A fair-price checker says whether a quoted price is fair, a bit high or a tourist price, and suggests a counter-offer.
  - Squads book a workshop, and it lands in the itinerary.
  - Visitors can ask a question about a maker; Gemini answers from that maker's facts only.
- **Screens:**
  - `#/trip/explore/makers[?craft=&near=]`
  - `#/trip/explore/makers/<id>`, with a booking sheet
  - `<MakersNearby>` on stop details
- **Backend:** `backend/src/makers/`, `/api/makers` (list, crafts, maker, slots, price-check, ask, bookings), migration `020_makers.sql`, doc `backend/docs/makers.md`.
- **Art:** 14 craft covers generated with Gemini image on Vertex AI (`frontend/public/makers/`).

### 2. Kaavad Tales and the Heritage Passport: storytelling
- **What it does:**
  - Each heritage site's story unfolds panel by panel, like a Mewari *kaavad* shrine, with art in miniature style and narration.
  - Stories come in English and Hindi, tuned to the audience: family, friends, couple or history buffs.
  - A 3-question quiz stamps each member's Heritage Passport. The squad sees who has which stamp.
- **Content:**
  - 7 sites have hand-written stories in both languages, with art and recorded narration.
  - Other audiences are retold by Gemini, checked, and cached in the database.
- **Screens:**
  - `#/trip/explore/story/<siteId>`
  - `#/trip/explore/passport`
  - "Hear the story" on stops
  - Explore → Stories of Mewar
  - A link from Crowd pulse
- **Backend:** `backend/src/stories/`, `/api/stories` (catalogue, story, narration, stamp, passport, squad passport), migration `021_stories.sql`, doc `backend/docs/stories.md`.
- **Assets and storage:**
  - 28 images and 8 narration recordings, about 4 MB, under `frontend/public/stories/`.
  - `storage.ts` now serves audio with byte ranges, which iPhones need.

### 3. Green Trip: the squad's footprint and positive impact
- **What it measures:**
  - kg CO2e per leg and per person between itinerary stops, with a mode switcher (walk / e-rickshaw / auto / cab / boat) whose numbers update live.
  - Crowd-hours avoided by visiting at quiet hours.
  - ₹ kept with local people, from the trip's expenses sorted by keyword rules, with Gemini for the leftovers.
- **What else is on the page:**
  - 8 Udaipur pledges, ticked per member.
  - Badge levels, such as Lake Guardian.
  - Concrete swaps.
  - A shareable Squad Impact Card, drawn on a canvas.
- **Screens:** Green trip card on the Itinerary tab, and `#/trip/itinerary/impact`.
- **Backend:**
  - `backend/src/impact/`, `/api/impact/trips/:id` (report, legs, pledges), migration `022_impact.sql`.
  - Doc `backend/docs/impact.md`, with emission factors cited from the India GHG Program, Saxena et al. and CEA.
  - Optional Google Routes API distances when `GOOGLE_MAPS_API_KEY` is set.

### 4. Heritage Ops console: crowd management for site managers
- **What it does:**
  - Forecasts crowds per site and hour by adding squads' planned stops to the modelled crowd curve.
  - Shows KPIs and a sites × hours heatmap.
  - Gemini drafts a bilingual (English + Hindi) advisory with a calmer alternative, then shows a reach estimate on publish.
  - Data is aggregate-only, and counts under 3 squads show as "<3".
- **What travellers see:** a sky-blue "Heads up" banner in Crowd pulse, with a one-tap swap, and `<SiteAdvisory>` on affected stops.
- **Screens:** `#/ops`. Entry points: Profile → Partner tools, and a link on Explore's crowd map.
- **Backend:** `backend/src/ops/`, `/api/ops` (forecast, advisories, draft, reach), migration `023_heritage_ops.sql`, doc `backend/docs/ops.md`.
- **Sample squads:** labelled sample squads are mixed in so the console looks realistic. Turn them off with `OPS_SAMPLE_SQUADS=off` or `?sample=0`.

### 5. Mewar Thali Table: farm-to-table and the host kitchen
- **Traveller side:**
  - Farm-to-table kitchens (4 sample hosts) with a Green Host score, food miles and today's seasonal special.
  - "Reserve a squad thali" takes the headcount and dietary mix (Jain, vegan…) and adds a Food stop to the itinerary.
- **Host side (`#/host`):**
  - Covers for the next 7 days, including squads.
  - A procurement list grouped by partner farm, each with a "Send order on WhatsApp" link.
  - Food miles saved and waste avoided.
  - A seasonal Mewari menu drafted by Gemini.
  - A leftovers log with a trend.
- **Data:** a Mewar seasonal produce calendar, 10 dishes with ingredients per serving, and 6 sample farms in real villages around Udaipur.
- **Backend:** `backend/src/hospitality/`, `/api/hospitality` (hosts, reservations, forecast, waste, menu), migration `024_hospitality.sql`, doc `backend/docs/hospitality.md`.
- **Art:** 11 illustrations generated on Vertex AI.

### 6. Mewar Utsav: festival calendar and a festival-aware crowd model
- **What it does:**
  - Lists Udaipur festivals and nightly shows from November 2026 to December 2027. Each date is checked against a source cited in `backend/docs/events.md`; events without an announced date say so.
  - Examples: Diwali, Annakut, Shilpgram Utsav, Maha Shivratri at Eklingji, Gangaur, Rath Yatra, the Dharohar show.
  - Each event has its significance, how to join respectfully, "Add to our itinerary" and "Plan around it".
- **Crowd model:** the festival factor lives inside the heritage crowd model (`levelAt`). Crowd pulse, the itinerary and the Ops forecast all rise on festival days; other days are unchanged and tested.
- **Screens:**
  - `#/trip/explore/events`
  - Explore → This week in Mewar
  - Festival lines in Crowd pulse
  - A "Your Day 2 is Diwali" tip on the itinerary
- **Backend:** `backend/src/events/`, `/api/events` (list, add to itinerary, ask), plus a small GhoomMate skill `whats_on` in `backend/src/voice/skills/events.ts`. No migration.

### 7. Demo readiness
- The create-trip calendar starts today, pages by month, greys out past days, and allows a trip that starts today.
- Trip settings → change dates works end to end. When a trip gets shorter, stops on removed days move to the new last day. `PATCH /api/trips/:id` returns the moved stops; only the organiser can change dates.
- LIVE / day counting uses India time (`frontend/src/data/tripDates.ts`).
- The pre-trip Plan screens are now an Udaipur heritage weekend instead of Manali, with votes, bookings, an eco checklist and a ₹ budget.
- Leftover Manali text is gone from Home, Notifications and Profile.

## Platform work
- **Shared Gemini client** (`backend/src/gemini.ts`): one instance is created in `index.ts`. It covers:
  - structured JSON answers;
  - image generation, sent to Vertex AI with Application Default Credentials, because the API key has no image quota;
  - Gemini TTS, returned as a ready-to-play WAV.
- **Cloud Run deploy kit:** prepared, not deployed.
  - Root `Dockerfile`, `deploy/cloudrun.sh` (all | agent | status | pause | resume, `DRY_RUN=1`) and `deploy/secrets.sh`.
  - The backend serves the built app when `SERVE_FRONTEND_DIR` is set.
  - Production hardening: with `NODE_ENV=production`, the dev login is off unless allowed and then only for the demo accounts, `JWT_SECRET` is mandatory, and localhost CORS is refused.
  - Doc: `backend/docs/deploy.md`.
- **QA pass:** every new screen was clicked through at 393×852 against the running app. Fixes:
  - long trip titles running under the header buttons;
  - duplicate React keys;
  - "How was Day 1?" now shows the real day;
  - Profile now shows real trips;
  - avatar colours;
  - spacing of the `.env.example` sections;
  - photo credits for the Wikimedia images: `frontend/PHOTO_CREDITS.md` plus a credit line in the UI, all 142 checked.

## Demo data
`cd backend && npm run seed:demo` creates a rich live trip and is safe to re-run (flags `--email`, `--api`, `--dry-run`, `--no-photos`). It calls the running backend's API. Details are in `backend/docs/demo.md`.

It has already been run once against the shared dev database for the quick sign-in account Aditi (`aditi.travels@gmail.com`). That created **"Mewar Mates · Udaipur"**, live from 1 to 4 November 2026, with:
- 6 members, with Jain and vegan diets;
- 17 stops, 10 of them timed heritage visits (8 quiet, 2 packed);
- a miniature workshop and a haveli dinner, booked through the real routes;
- 9 expenses totalling ₹36,660, 64% of it kept local;
- pledges at 77/100 (Lake Guardian);
- AI-generated photos of fictional people.

## Google tech used
- **Gemini 3.5 Flash / Flash-Lite** (structured output): story retellings, advisories, menus, maker Q&A, festival Q&A, expense sorting, swap wording.
- **Gemini TTS:** story narration, through Vertex AI.
- **Gemini 2.5 Flash Image on Vertex AI:** craft covers, story panels, illustrations.
- **Gemini Live** (GhoomMate): the new `whats_on` festival skill.
- **Cloud SQL for PostgreSQL:** 5 new migrations.
- **Cloud Storage:** narration, ranged audio.
- **Cloud Run:** deploy kit.
- **Google Maps:** keyless links, plus the optional Routes API.

## Migrations and env vars
- **Migrations:** `020_makers`, `021_stories`, `022_impact`, `023_heritage_ops`, `024_hospitality`. They apply automatically when the backend starts and are already applied to the shared dev database.
- **New optional env vars**, all documented in `backend/.env.example`:
  - Gemini and Vertex: `GEMINI_SMART_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_TTS_MODEL`, `VERTEX_PROJECT`, `VERTEX_LOCATION`
  - Feature settings: `GOOGLE_MAPS_API_KEY`, `OPS_SAMPLE_SQUADS`
  - Deployment: `SERVE_FRONTEND_DIR`, `ALLOW_DEV_LOGIN`, `DEV_LOGIN_EMAILS`
- **For the Cloud Run deploy:** image generation and narration need `VERTEX_PROJECT` / `VERTEX_LOCATION`, and the web service's account needs the Vertex AI User role (`deploy/cloudrun.sh` grants it). Without them, those features fall back.

## Known gaps to check before the demo
- `crypto.randomUUID` breaks Add expense and Settle up on plain-HTTP origins other than localhost. Serve the demo over HTTPS.
- Some tap targets are under 36 px, and sky-blue text has 3.1:1 contrast. There is no 404 screen.
- **Speech quota:** the Gemini API key allows only 10 speech requests a day, so narration goes through Vertex AI.
  - The shipped recordings need neither.
  - Hindi narration is recorded only for Bagore ki Haveli.
- **Partner tools:** the Ops console and Host kitchen are open to any signed-in user, as a demo stub. Maker bookings are simulated, with no payment or cancel.
- **WhatsApp links:** the order link has no phone number, so it opens WhatsApp's contact picker.
- **Maps key:**
  - The Routes API is untested, because no key was available.
  - If you add `GOOGLE_MAPS_API_KEY`, restrict it, since the project's existing key is unrestricted.
- **Festival dates:** Shilpgram Utsav dates aren't announced yet, and Gavri 2027 is derived.
- **Sample data:** prices, emission factors, waste and capacity numbers are labelled estimates, with sources in each module's doc. Makers, hosts and farms are fictional sample partners.

## Not built
- **Heritage Lens** (camera identification of monuments and crafts) was stopped and removed.
- **GhoomMate voice tools** for makers, stories, impact, advisories and food were stopped before any change. Only the festival skill `whats_on` exists.
- **Pitch deck and demo script** were not prepared.
