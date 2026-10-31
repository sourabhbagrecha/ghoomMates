# Voice module (GhoomMate)

A real-time voice agent on LiveKit Cloud. The user talks to GhoomMate (the octopus FAB). It drafts expenses on screen, writes them after a spoken "yes" or a tapped Confirm, reads balances, recommends local guide experiences that fit the user's personality, and opens screens. The model is speech-to-speech `google/gemini-3.8-live` through LiveKit Inference, billed to the LiveKit project, so no Google key is needed.

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

- `npm run dev` from the repo root starts api + web + agent.
- To run the worker on its own: `npm --prefix backend run agent` (`node src/voice/agent.ts dev`). It logs "registered worker" once it's connected to `LIVEKIT_URL`.
- The worker reaches the API at `BACKEND_URL`, so the API must be running too.

## Env keys (`backend/.env`)

| Key | Default | Purpose |
| --- | --- | --- |
| `LIVEKIT_URL` | — | `wss://<project>.livekit.cloud`. If it's missing, `/api/voice/session` returns 503 `VOICE_DISABLED`. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | — | Token minting, worker registration and Inference billing |
| `GHOOMATE_MODEL` | `google/gemini-3.8-live` | Any LiveKit Inference realtime model |
| `GHOOMATE_VOICE` | `Puck` | Voice name |
| `BACKEND_URL` | `http://127.0.0.1:$PORT` | Where the worker calls the API |

## Files

| File | Role |
| --- | --- |
| `protocol.ts` | Shared contract: agent name, RPC methods, `UiEvent` / `UiAction`, `DispatchMetadata`. The frontend mirrors it in `frontend/src/components/voice/protocol.ts`. |
| `agent.ts` | Worker entry: loads the trip, builds the persona and the skills, starts the session, handles `ghoomate.action`, greets the user |
| `backendClient.ts` | `fetch` wrapper: Bearer token, JSON, `Idempotency-Key`, and turns `{error:{code,message}}` into a thrown `BackendError` |
| `ui.ts` | `createUiPusher(room, identity)`: ordered, fire-and-forget `ghoomate.ui` RPCs. Failures are only logged. |
| `members.ts` | Pure helpers: spoken names → member ids, rupees → paise, equal-split preview (tested in `tests/voice/members.test.ts`) |
| `experiences.ts` | Agent-side copy of the guide-experience catalogue (ids, prices, vibe weights) and the pure ranking helpers (tested in `tests/voice/experiences.test.ts`) |
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
| `experiences.recommended` | `city, basis ('you'\|'squad'\|'rating'), picks[{experienceId, matchPercent, reason}]` | Picks card; tapping a pick opens it |
| `experience.open` | `experienceId` | Navigates to `trip/explore/guide/<id>` |

Frontend → agent, RPC `ghoomate.action`, payload JSON `UiAction`: `{type:'confirm'|'cancel', draftId}`. The agent answers `{ok:true}` or `{ok:false,error}` and then speaks a short follow-up. A tap and a spoken "yes" share `commitDraft` / `cancelDraft` in `skills/expenses.ts`. The draft's idempotency key makes a repeated confirm a no-op.

## Expense rules the agent follows

- Nothing is written without an explicit yes or a tapped Confirm.
- The payer defaults to the speaker.
- The category is inferred, never asked.
- An unclear amount, description or name makes the tool throw `llm.ToolError("…")`, and the model asks that as one clarifying question (for example "Which Riya, Riya S or Riya K?").
- The equal-split preview uses the backend's `splitExpense`, so the card matches what gets saved.

## Experience recommendations

`skills/experiences.ts` gives the model two tools:

- **`recommend_experiences({for_whom, city?, tag?})`** ranks the guide trips in the trip's city (or a city the user names) and pushes the top 3 as a card. It also returns them to the model, with the personality traits behind each pick, so GhoomMate can say why one suits you.
- **`open_experience({experience_id})`** opens that experience's detail screen. Booking stays a tap on Join; the agent never books.

How the ranking works:

- **Personality.** It uses the vibe from the personality quiz (`users.preferences.vibe`: 0–1 for adventure, food, nightlife, culture, chill and shops). The vibe reaches the agent on each member in `GET /api/trips/:id`.
- **Whose vibe.** `for_whom: 'me'` uses the speaker's own vibe. If they haven't taken the quiz, it falls back to the squad's blended vibe. If nobody has, it ranks by rating, and GhoomMate suggests taking the quiz.
- **Match score.** Each experience has vibe weights. The match is the weighted mean of the person's scores over those axes, and ties go to the higher rating.
- **Cities.** Destinations other than Goa or Udaipur get a clarifying question about which city they mean.

The card looks up each experience's photo, price and date from the frontend catalogue (`frontend/src/pages/Explore/experiencesData.ts`). When you add or change an experience, update both files. The test `the agent catalogue matches the frontend one` fails if their ids, cities or prices drift apart.

## How to add a skill (example: "make a reel from my photos")

1. **Skill file.** Create `src/voice/skills/reel.ts` exporting a `Skill`:
   - `instructions(ctx)` returns a short `## Reels` section: when to use the tools and what to ask.
   - `tools(ctx)` returns `llm.tool({ name: 'make_reel', description, parameters: z.object({...}), execute })`. `execute` calls the backend through `ctx.api`, never media work inline. For example `POST /api/trips/:id/reels` enqueues a render on the cloud function.
   - Throw `llm.ToolError('question to ask')` for anything unclear. For mutating calls, call `run.disallowInterruptions()`, keep a confirm step if it writes, and pass an idempotency key.
   - Use `onAction(action, ctx)` only if the skill's card has buttons.
2. **Register.** Add `reel` to `SKILLS` in `skills/index.ts`.
3. **UI (optional).** Add a variant such as `{ type: 'reel.started'; jobId }` to `UiEvent` (and `UiAction` if needed) in `protocol.ts`, and mirror it in the frontend `protocol.ts`. Push it with `void ctx.ui(event)`, then register a renderer in the frontend `uiEvents.ts`.
4. **Fallback copy.** Remove the "reel is coming soon" line from `skills/navigation.ts`.
5. **Backend.** If the skill needs a new endpoint, follow the usual module checklist: `src/<module>/`, a migration, the route in `src/app.ts`, and a doc.
6. **Tests.** Put pure parsing and validation in a helper and unit-test it with `node:test`, as `members.ts` is tested. Then try it by voice and by "Type instead".
