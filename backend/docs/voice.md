# Voice module (GhoomMate)

A real-time voice agent on LiveKit Cloud. The user talks to GhoomMate (the octopus FAB). It drafts expenses on screen, writes them after a spoken "yes" or a tapped Confirm, reads balances, recommends local guide experiences that fit the user's personality, plans a day out of them (added to the itinerary after a yes), tells them how crowded Udaipur's heritage sites are and when they're quiet, and opens screens. The model is speech-to-speech `google/gemini-3.8-live` through LiveKit Inference, billed to the LiveKit project, so no Google key is needed.

## Flow

```
Frontend overlay ──POST /api/voice/session {tripId} (user JWT)──▶ backend (src/voice/app.ts)
   ◀── {serverUrl, participantToken, roomName, participantIdentity}
   │   token dispatches agent "ghoomate" with metadata {tripId, userId, userName, authToken}
   ▼
LiveKit Cloud room ◀──────▶ agent worker (src/voice/agent.ts, separate process)
   mic / agent audio            │ tools call our HTTP API as the user (Bearer authToken)
   transcripts (built-in)       │ → GET /api/trips/:id, POST /api/trips/:id/expenses, /summary …
   RPC "ghoomate.ui"  ◀─────────┘ agent → frontend: draft card, added, balances, navigate
   RPC "ghoomate.action" ──────▶  frontend → agent: tapped Confirm / Cancel
```

The worker is a pure API client of our backend. Auth, membership, validation, splitting and idempotency all stay in `TripService`. The agent gets its own 2-hour API JWT (minted by `agentToken` in `src/index.ts`) through dispatch metadata, so the user's 7-day session token never leaves the browser. Dispatch metadata is embedded in the user's LiveKit token, so never put anything there the user must not see.

## Running

- **Use your own agent name in dev.** Set `GHOOMATE_AGENT_NAME` in `backend/.env`. Otherwise your sessions can go to a teammate's worker (running their code), and you'll see no `received job request` in your agent log.

- `npm run dev` from the repo root starts api + web + agent.
- To run the worker on its own: `npm --prefix backend run agent` (`node src/voice/agent.ts dev`). It logs "registered worker" once it's connected to `LIVEKIT_URL`.
- The worker reaches the API at `BACKEND_URL`, so the API must be running too.

## Start-up speed

- **The worker keeps one job process warm** (`GHOOMATE_IDLE_PROCESSES`). A new chat doesn't wait for a Node process to spawn and import the agent.
- **One call loads everything.** `GET /api/voice/context?tripId` returns the trip, the caller's profile preferences (their memory) and the latest history together, instead of three separate requests.
- **The model session opens before the trip loads.** The job starts `session.start` with a short stub agent while the context call is in flight, then swaps in the real instructions and tools with `agent.updateInstructions` / `updateTools`. The handshake with the model no longer waits on the trip.
- **The greeting needs only the user's name** (it arrives in the job metadata), so it goes out as soon as the session is up, without the trip name. If the context fails to load, the agent apologises instead.
- **The browser opens the mic in parallel.** It starts while the session token and room connection are set up, then publishes the track once connected.
- **Messages can go in early.** Anything typed, or a tapped suggestion, before GhoomMate is listening is held and sent the moment it is.
- **No early voice capture.** The Node agents SDK (1.9.x) has no pre-connect audio buffer, so speech before the agent joins isn't captured.

## Env keys (`backend/.env`)

| Key | Default | Purpose |
| --- | --- | --- |
| `LIVEKIT_URL` | — | `wss://<project>.livekit.cloud`. If it's missing, `/api/voice/session` returns 503 `VOICE_DISABLED`. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | — | Token minting, worker registration and Inference billing |
| `GHOOMATE_MODEL` | `google/gemini-3.8-live` | Any LiveKit Inference realtime model |
| `GHOOMATE_VOICE` | `Puck` | Voice name |
| `GHOOMATE_AGENT_NAME` | `ghoomate` | Worker name that sessions dispatch to. LiveKit shares a project's sessions across every worker with the same name, so in dev set your own (e.g. `ghoomate-animesh`). The API and the worker both read it, so your app only reaches your worker. The deployed app keeps the default. |
| `GHOOMATE_IDLE_PROCESSES` | `1` | Job processes kept started and loaded, so a chat starts without spawning Node and importing the agent (about 1–2 s). `0` turns it off, which you may want while editing the agent: the warm process runs the code from when it started, so an edit applies from the chat after next. |
| `BACKEND_URL` | `http://127.0.0.1:$PORT` | Where the worker calls the API |
| `VOICE_AGENT_URL` | — | Cloud Run only (`deploy/cloudrun.sh` sets it): the worker's own scale-to-zero service. `POST /api/voice/session` wakes it and waits up to 25 s for the worker to register with LiveKit (else 503 `VOICE_AGENT_WAKING`), because LiveKit drops a dispatch that finds no worker. During a call the overlay calls `POST /api/voice/keepalive` every minute so Cloud Run keeps that instance up. Unset in dev: no waking. See `backend/docs/deploy.md`. |

## Files

| File | Role |
| --- | --- |
| `protocol.ts` | Shared contract: agent name, RPC methods, `UiEvent` / `UiAction`, `DispatchMetadata`. The frontend mirrors it in `frontend/src/components/voice/protocol.ts`. |
| `agent.ts` | Worker entry: loads the trip, builds the persona and the skills, starts the session, handles `ghoomate.action`, greets the user |
| `backendClient.ts` | `fetch` wrapper: Bearer token, JSON, `Idempotency-Key`, and turns `{error:{code,message}}` into a thrown `BackendError` |
| `ui.ts` | `createUiPusher(room, identity)`: ordered, fire-and-forget `ghoomate.ui` RPCs. Failures are only logged. |
| `members.ts` | Pure helpers: spoken names → member ids, rupees → paise, equal-split preview (tested in `tests/voice/members.test.ts`) |
| `history.ts` | Chat history: the background recorder that saves each turn, and the latest turns as context for the next chat (tested in `tests/voice/history.test.ts`) |
| `memory.ts` | What GhoomMate remembers about a person across chats (notes plus the rules they carry), saved on their profile as `preferences.ghoomate` (tested in `tests/voice/memory.test.ts`) |
| `experiences.ts` | Agent-side copy of the guide-experience catalogue (ids, prices, weekly schedules, vibe weights) and the pure helpers: IST schedule, ranking, varied picks and day planning (tested in `tests/voice/experiences.test.ts`) |
| `skills/` | One file per capability, plus the registry in `skills/index.ts` |

## UI event protocol

Agent → frontend, RPC `ghoomate.ui`, payload JSON `UiEvent`:

| `type` | Payload | Frontend |
| --- | --- | --- |
| `expense.draft` | `draft: ExpenseDraft` (amount, payer, shares) | Draft card with Confirm / Cancel |
| `expense.added` | `expense: AddedExpense` (has `draftId`) | Card flips to "Added"; money refreshes |
| `expense.cancelled` | `draftId` | Card dismissed |
| `balances` | `currency, balances[{memberId,name,balancePaise}], transfers[{from,to,amountPaise}]` (`from`/`to` are display names) | Who-owes-whom card |
| `navigate` | `screen` (route in `SCREEN_ROUTES`) | Navigates; the session stays alive |
| `experiences.recommended` | `city, basis ('you'\|'squad'\|'mood'\|'rating'), picks[{experienceId, matchPercent, reason, why, when, fits}]` | Picks card: hero pick with Join, two alternatives, a quiz prompt for mood / rating picks |
| `experience.open` | `experienceId` | Navigates to `trip/explore/guide/<id>` |
| `day.plan` | `plan: DayPlan` (dayLabel, dayNumber or null, stops[{experienceId, start, end, matchPercent}]) | Day-plan card with Add to Day N / Not this |
| `day.plan.added` | `planId, dayNumber, count` | Card flips to added; itinerary reloads; notice with View |
| `day.plan.cancelled` | `planId` | Card dismissed |
| `working` | `label` or `null` | Shown as GhoomMate's status (sheet and pill) while a tool runs; sent automatically for tools listed in their skill's `working` map |
| `notice` | `message` | The notice pill, e.g. "I'll remember: vegetarian" |

Frontend → agent, RPC `ghoomate.action`, payload JSON `UiAction`: `{type:'confirm'|'cancel', draftId}` for expense drafts, `{type:'plan.add'|'plan.cancel', planId}` for day plans, `{type:'experience.join', experienceId}` after a tapped Join. The agent answers `{ok:true}` or `{ok:false,error}` and then speaks a short follow-up. A tap and a spoken "yes" share `commitDraft` / `cancelDraft` in `skills/expenses.ts`. The draft's idempotency key makes a repeated confirm a no-op.

## Expense rules the agent follows

- Nothing is written without an explicit yes or a tapped Confirm.
- The payer defaults to the speaker.
- The category is inferred, never asked.
- An unclear amount, description or name makes the tool throw `llm.ToolError("…")`, and the model asks that as one clarifying question (for example "Which Riya, Riya S or Riya K?").
- The equal-split preview uses the backend's `splitExpense`, so the card matches what gets saved.

## Experience recommendations and day plans

`skills/experiences.ts` gives the model five tools:

- **`recommend_experiences({for_whom, city?, tag?, when?, likes?, avoid?})`** shows the top 3 picks as a card. It also returns them to the model, with the personality traits behind each one, so GhoomMate can say why a pick suits you.
- **`plan_day({for_whom, day, day_number?, city?, likes?, avoid?})`** builds up to three experiences on one day. They don't overlap and leave 45 minutes to get between them. Nothing is saved yet.
- **`add_day_plan()` / `cancel_day_plan()`** add the plan's stops to the itinerary after a spoken yes, or drop it. A tapped Add or Not this (`plan.add` / `plan.cancel`) takes the same path. Adding is idempotent per plan. If it fails partway, a retry only adds the stops that weren't saved.
- **`open_experience({experience_id})`** opens the detail screen. Joining stays a tap on Join (on the card or the screen). The card tells the agent with `experience.join`, so it can reply and stop recommending that experience this session.

**Whose personality**

- **Quiz results.** The vibe comes from the personality quiz (`users.preferences.vibe`: 0–1 for adventure, food, nightlife, culture, chill and shops). It reaches the agent on each member in `GET /api/trips/:id`. The app saves a quiz taken before sign-up to the profile on the next sign-in (`syncVibeToProfile`).
- **`for_whom: 'me'`** uses the speaker's vibe and falls back to the squad's blend. Squad picks also carry each quiz-taker's own fit.
- **What they ask for.** `likes` / `avoid` are what the user says they're in the mood for. They lift or drop those axes on top of the quiz, or build a vibe from a neutral middle when there's no quiz (basis `mood`).
- **No quiz results and no mood.** The tool doesn't fall back to generic picks. It tells the model to ask one quick question ("Adventure or something chill? Big foodie?"). `likes: []` means anything goes, which ranks by rating.

**Ranking**

- **Match.** The match is the weighted mean of the person's scores over the axes each experience speaks to.
- **Solo.** Solo plans get a small boost for groups of 10 or fewer.
- **Variety.** Picks are varied: each pick that repeats an earlier pick's main axis loses 8 points.

**Schedules**

- **Weekly days.** Experiences run on weekly days (for example the Anjuna flea on Wednesdays), so they never go stale.
- **Time.** Times are IST. Anything starting within 30 minutes, or already started, is left out. `when` narrows to today, tonight (from 5 PM) or tomorrow.

**Itinerary day**

- **With trip dates.** `plan_day` maps the date onto the trip: day 1 is `startDate`, and a trip with no `endDate` is one day long, as in the backend.
- **Outside the trip.** For a date outside the trip, the plan is shown but can't be added (`dayNumber: null`).
- **Without trip dates.** The model asks for a `day_number` instead.

**Two catalogues**

The cards look up each experience's photo, price and host from the frontend catalogue (`frontend/src/pages/Explore/experiencesData.ts`). The frontend works out the next date in `experienceSchedule.ts`. When you add or change an experience, update both catalogues. The test `the agent catalogue matches the frontend one` fails if their ids, cities, prices, days, start times or group sizes drift apart.

## Chat history

Every turn (spoken or typed) is saved per person per trip in the `ghoomate_messages` collection (indexes in `src/schema.ts`). Only that person can read it.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/voice/context?tripId=&limit=` | What the agent needs to start a chat: `{ trip, preferences, history }` (404 for non-members) |
| GET | `/api/voice/history?tripId=&limit=` | Your messages in the trip, oldest first: the latest `limit` (default 50, max 200) |
| POST | `/api/voice/history` | `{ tripId, messages: [{ role: user\|agent, text }] }`, 1–50 at a time; the agent saves turns as the chat goes |
| DELETE | `/api/voice/history?tripId=` | Clears your history in the trip |

- **Saving.** The agent listens for `conversation_item_added` and saves user and assistant messages in small background batches (`createHistoryRecorder`). It saves what's left when the job shuts down. A failed save is logged and dropped, never shown to the user.
- **Recalling.** At start, the agent loads the latest 40 messages alongside the trip. It puts them in its instructions as "Earlier chats", capped at about 3,000 characters, so it can pick up where you left off ("that place you suggested").
- **In the app.** The voice sheet has **Chat history** (grouped by day, with Clear history) and **What I remember** links.

## Memory

`skills/memory.ts` lets GhoomMate remember lasting things the speaker says about themselves ("vegetarian", "not a morning person", "keep it under ₹1,500", "love history"):

- **Saving.** `remember_preference` saves a short note on the speaker's own profile (`PATCH /auth/profile` with `preferences.ghoomate`, which leaves the quiz vibe and other keys alone) and shows a notice. `forget_preference` drops one.
- **Rules.** A note can carry a rule: `no_early_starts` (nothing before 8 AM), `max_price_rupees`, and vibes it `likes` or `avoid`s. Recommendations and day plans follow these automatically. Remembered likes also stand in for the quiz, so no mood question is needed. Squad picks follow the speaker's limits and dislikes, but not their personal likes.
- **Loading.** The agent loads the memory from `GET /auth/me` while it joins, and lists it in its instructions. It keeps at most 12 notes, newest last.
- **What it ignores.** One-off moods and anything about other people.
- **The memory screen.** You can see, edit, add and remove notes yourself at **Profile → What GhoomMate remembers** (`#/profile/ghoomate`). The screen and the agent save the same shape.
- **Edits mid-chat are safe.** The agent re-reads your latest memory before each change, so an edit made on the screen during a chat isn't overwritten.

## Working status and filler

GhoomMate says two or three words ("One sec…") before a tool that looks something up, saves or plans. Meanwhile the sheet shows what it's doing: "Checking balances…", "Planning your day…". A skill lists those labels in its `working` map. `buildAgentConfig` wraps each such tool to send `working` with the label when it starts and `null` when it ends.

## How to add a skill (example: "make a reel from my photos")

1. **Skill file.** Create `src/voice/skills/reel.ts` exporting a `Skill`:
   - `instructions(ctx)` returns a short `## Reels` section: when to use the tools and what to ask.
   - `tools(ctx)` returns `llm.tool({ name: 'make_reel', description, parameters: z.object({...}), execute })`. `execute` calls the backend through `ctx.api`, never media work inline. For example `POST /api/trips/:id/reels` enqueues a render on the cloud function.
   - Throw `llm.ToolError('question to ask')` for anything unclear. For mutating calls, call `run.disallowInterruptions()`, keep a confirm step if it writes, and pass an idempotency key.
   - Use `onAction(action, ctx)` only if the skill's card has buttons.
2. **Register.** Add `reel` to `SKILLS` in `skills/index.ts`.
3. **UI (optional).** Add a variant such as `{ type: 'reel.started'; jobId }` to `UiEvent` (and `UiAction` if needed) in `protocol.ts`, and mirror it in the frontend `protocol.ts`. Push it with `void ctx.ui(event)`, then register a renderer in the frontend `uiEvents.ts`.
4. **Fallback copy.** Remove the "reel is coming soon" line from `skills/navigation.ts`.
5. **Backend.** If the skill needs a new endpoint, follow the usual module checklist: `src/<module>/`, its collections and indexes in `src/schema.ts`, the route in `src/app.ts`, and a doc.
6. **Tests.** Put pure parsing and validation in a helper and unit-test it with `node:test`, as `members.ts` is tested. Then try it by voice and by "Type instead".
