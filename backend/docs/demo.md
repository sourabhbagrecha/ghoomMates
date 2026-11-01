# Demo data (`npm run seed:demo`)

A jury demo needs a trip that already looks lived in: six mates, a four-day Udaipur plan that is **live today**, a booked workshop and dinner, spends to settle, pledges, photos. `backend/scripts/seed-demo.ts` builds it in about twenty seconds, and builds it only once: run it again and it adds nothing that is already there.

## Run it

Start the backend first (`npm run dev` from the repo root), then from `backend/`:

```bash
npm run seed:demo                                   # for the demo account, aditi.travels@gmail.com
npm run seed:demo -- --email you@example.com        # another account organises the trip
npm run seed:demo -- --api https://ghoomates-….run.app   # a deployed server (see below)
npm run seed:demo -- --dry-run                      # print the plan, change nothing
npm run seed:demo -- --no-photos                    # skip the four sample photos
```

The script talks to the same HTTP API the app uses, so it needs a running backend (`--api`, else `$BACKEND_URL`, else `http://127.0.0.1:$PORT` from `backend/.env`). It signs in as dev test accounts (`POST /auth/dev/login`, the sign-in page's quick accounts), then calls trips, itinerary, makers, hospitality, impact and expenses exactly as the app would, so every rule of those modules applies and nothing is written behind their backs. Against a deployed server it works only where the test sign-in is on for those emails (`ALLOW_DEV_LOGIN=true` plus `DEV_LOGIN_EMAILS` listing them, see `deploy.md`).

Dates are India time (IST): day 1 is today there, whatever zone the laptop is in. The seed runs against whatever database the backend uses, which for local dev is the shared Cloud SQL one, so the deployed app shows the same trip.

## What it creates

**Mewar Mates · Udaipur**, four days from today, organised by the account you run it for:

| Part | What |
| --- | --- |
| Squad | Six mates: the organiser (default Aditi Sharma), **Kabir Mehta** (the sign-in page's second quick account, so a second phone can join the same trip in one tap), Riya Kapoor, Meera Iyer (Jain), Dev Malhotra (vegan) and Ishaan Verma. Riya, Meera, Dev and Ishaan are new dev users (`@ghoomates.test`). Every mate has a vibe-quiz result, so the squad spiderweb and persona show. An account that already exists keeps its name, picture and username and only gets the preference keys it has none of (vibe, colour, diet). |
| Plan | 17 stops: 4 + 4 + 5 + 4 across *Hello, City of Lakes*, *Palaces before the rush*, *Hidden Udaipur* and *Last chai, then home*. Ten are timed visits at heritage sites: eight at quiet hours (City Palace at its 9:30 AM opening, Moti Magri, the Ahar cenotaphs, Hathi Pol before the crowd) and two at packed ones (the Pichola sunset boat, Sajjangarh at sunset), so the Green Trip has crowd-hours to count and the app has something to nudge. Meals, the check-in and the journey home are left off the crowd meter, like in the app. |
| Maker workshop | *Paint your own Mewar miniature* with Mahendra Chitera, day 2 at 12:30 PM, all six, ₹4,500. Booked through `POST /api/makers/:id/bookings`, so it is a real booking with its own itinerary stop. If Mahendra is closed that weekday the seed tries Lalit Vyas, and says so if nobody has a slot. |
| Farm-to-table | A rooftop dinner for six at Kesar Pol Haveli, day 2 at 8:00 PM, with the Jain and the vegan thali counted from the mates' profiles. Booked through `POST /api/hospitality/hosts/:id/reservations`. |
| Green Trip | 19 pledge ticks (each mate ticks their own, the organiser leaves most open), so the squad sits at **77/100, Lake Guardian**, three points short of Mewar Steward. The e-rickshaw swap on the Ahar → Shilpgram ride (about 2.4 kg saved) tips it over, which is the demo moment. |
| Expenses | Nine spends, ₹36,660, paid by five different mates: a three-night Lal Ghat homestay, train tickets, e-rickshaws, a family-kitchen lunch, tickets, a Domino's stop that only four shared. About 64% stays with local people, and Settle up has five transfers to suggest. |
| RSVPs | A hundred answers: shared meals and check-ins are whole-squad, the rest are mostly "going" with a few "maybe" and "skip". Only unanswered stops get an answer, so a changed RSVP is never overwritten. |
| Photos | Four pictures of the six mates (golden hour on the ghat, Bagore ki Haveli's ceilings, the Pichola boat, a rooftop dinner), uploaded as different mates through the app's own signed-URL flow. **They are AI-generated pictures of fictional people** (Gemini's image model on Vertex AI, from one generated squad selfie, `backend/scripts/demo-assets/`), not real photographs. The face pipeline indexes them like any upload; **Photos → Squad Miniature** has pictures to paint. |

## Running it again

- The trip is found by its name among the account's own trips, **while it has not ended**. Found: it is reused and only the missing pieces are added (a mate who was not in the trip joins, an empty itinerary gets the plan, a missing booking is made, and so on). Not found, or ended: a new trip is created, and the old one stays as a past trip.
- A trip that is not live today is reused anyway if it is still ahead (the seed says "not started yet"). To get a trip that is live on a later day, let the old one end and run the seed again.
- `--email` picks the organiser. The squad is always six: the organiser plus five from the pool, and with an organiser outside the pool the demo account is the one left out.
- Nothing is ever deleted or overwritten, and the script does not touch other people's trips. There is no delete API for trips, so removing the demo trip takes SQL.

## What to show with it

| Screen | What the seed gives it |
| --- | --- |
| Home | The live card ("Day 1 of 4"), six avatars, ₹36,660 spent, four photos |
| Itinerary | Squad spiderweb ("The Hungry Culture Buffs", 84% vibe match), crowd-smart score, packed stops with a one-tap move or swap, the Green Trip card |
| Itinerary → Green Trip | 1.1 kg CO2e a person, 75% under solo cabs, 8 of 10 visits at quiet hours, 64% kept local, the e-rickshaw swap, 19 of 48 pledges |
| Stop detail | A crowd forecast, makers within 1.5 km of City Palace and Bagore, the booked workshop's card |
| Explore → Makers, Farm-to-table | The booking made for the squad; the table with its diets |
| Expenses | Nine spends, balances, five suggested transfers |
| Photos → Squad Miniature | Four photos of the squad to paint |
| `#/ops` | The forecast for today. The real squad is one of many, and the console follows its own privacy rule (a count of 1 or 2 squads shows as "<3"), so the numbers come from the labelled sample squads plus this one |
| `#/host` | The Kesar Pol Haveli dinner on day 2 in the seven-day demand |

An Ops advisory is deliberately **not** seeded: the presenter drafts and publishes one live from `#/ops`, then watches it appear on the squad's stop page and Explore's crowd map.

## Tests

`tests/demo/plan.test.ts` holds the plan against the real models, so a change that breaks the demo fails `npm test`: every sightseeing stop matches a heritage site, the plan has quiet and packed hours on weekdays and weekends, the workshop finds a slot on day 2 whatever the weekday, the table is a time the kitchen offers, every spend is counted by a keyword rule (no Gemini needed), most of the money stays local, and the photos exist and are small JPEGs.

## Known gaps from the QA pass

Found while walking every demo path at 393 × 852 and left alone (none blocks the demo):

- **Plain-HTTP origins.** `crypto.randomUUID()` only exists on HTTPS and `localhost`, so *Add expense* and *Settle up* throw on a page opened over `http://<laptop-ip>:5173`. Use `npm run share` (HTTPS) or the deployed URL on a phone. A two-line fallback in `src/services/tripsService.ts` and `SettleUpPage.tsx` would fix it.
- **Singular "Ghoomate".** After the rename to Ghoommates, a few strings still say "Ghoomate" (sign-in, welcome wordmark, log-out box, Help, app version).
- **Small tap targets.** Pill buttons are 30 px tall, day pills 27 px. The design guide asks for 36 px where possible.
- **Sky-blue text on white** (11–12 px links and overlines) is 3.1:1, the contrast the design guide already lists as "accents only". White initials on the amber and sky avatars are lower still.
- **Unknown routes** fall back silently (a bad `#/trip/…` shows the Itinerary, anything else Home); there is no 404 screen.
- **Ops privacy floor.** One real squad is under the "3 squads" floor, so the console's numbers come from the labelled sample squads plus this one, and the demo squad is not called out by name.
