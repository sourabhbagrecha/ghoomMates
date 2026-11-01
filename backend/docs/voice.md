# Voice module (GhoomMate)

A real-time voice agent on LiveKit Cloud. The user talks to GhoomMate (the octopus FAB). It drafts expenses on screen, writes them after a spoken "yes" or a tapped Confirm, reads balances and opens screens. The model is speech-to-speech `google/gemini-3.8-live` through LiveKit Inference, billed to the LiveKit project, so no Google key is needed.

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
| `reel.progress` | `reel: ReelJob` (title, music, clips, `progress` 0–1, `stages[]`, `photos[]`, cover) | Reel studio card: poster, filmstrip, progress bar, stage list. Updated in place. |
| `reel.ready` | `reel: ReelJob` | Card shows Watch reel; notice pill with Watch → `trip/photos/reel/<id>` |

Frontend → agent, RPC `ghoomate.action`, payload JSON `UiAction`: `{type:'confirm'|'cancel', draftId}`. The agent answers `{ok:true}` or `{ok:false,error}` and then speaks a short follow-up. A tap and a spoken "yes" share `commitDraft` / `cancelDraft` in `skills/expenses.ts`. The draft's idempotency key makes a repeated confirm a no-op.

## Expense rules the agent follows

- Nothing is written without an explicit yes or a tapped Confirm.
- The payer defaults to the speaker.
- The category is inferred, never asked.
- An unclear amount, description or name makes the tool throw `llm.ToolError("…")`, and the model asks that as one clarifying question (for example "Which Riya, Riya S or Riya K?").
- The equal-split preview uses the backend's `splitExpense`, so the card matches what gets saved.

## Reels

"Make a reel", "Kabir ki funny reel bana do", or Generate reel on the Photos tab (it opens GhoomMate with that prompt) → `make_reel` in `skills/reel.ts`:

1. Spoken names in `featuring` resolve like expense names (unknown or ambiguous → one clarifying question; everyone → whole squad). The model invents the title and picks the vibe; it doesn't ask about either.
2. `POST /api/trips/:id/reels` with a fresh idempotency key, then `reel.progress` puts the card on screen. No confirm step: a reel adds nothing to the ledger and can be cut again.
3. `watch()` polls `GET /reels/:id` every second in the background (the tool has already returned, so GhoomMate keeps talking) and pushes `reel.progress` each time. A newer reel takes the watch over.
4. When it's ready it pushes `reel.ready` and calls `ctx.say(...)`, so GhoomMate announces it unprompted. `ctx.say` is the hook for any background job that finishes later.

`reel_status` reports the latest reel and puts its card back on screen. The render itself is stubbed (about 11s); see `trips.md`.

## How to add a skill

`skills/reel.ts` is the most complete example (backend call, live card, background follow-up).

1. **Skill file.** Create `src/voice/skills/<name>.ts` exporting a `Skill`:
   - `instructions(ctx)` returns a short `## <Name>` section: when to use the tools and what to ask.
   - `tools(ctx)` returns `llm.tool({ name, description, parameters: z.object({...}), execute })`. `execute` calls the backend through `ctx.api`, never media work inline.
   - Throw `llm.ToolError('question to ask')` for anything unclear. For mutating calls, call `run.disallowInterruptions()`, keep a confirm step if it writes to shared data like the ledger, and pass an idempotency key.
   - Use `onAction(action, ctx)` only if the skill's card has buttons.
2. **Register.** Add it to `SKILLS` in `skills/index.ts`.
3. **UI (optional).** Add a variant to `UiEvent` (and `UiAction` if needed) in `protocol.ts`, and mirror it in the frontend `protocol.ts`. Push it with `void ctx.ui(event)`, then register a handler in the frontend `uiEvents.ts` and a card in `GhoomMateCard.tsx`.
4. **Fallback copy.** Remove any "coming soon" line for it from `skills/navigation.ts`.
5. **Backend.** If the skill needs a new endpoint, follow the usual module checklist: `src/<module>/`, a migration, the route in `src/app.ts`, and a doc.
6. **Tests.** Put pure parsing and validation in a helper and unit-test it with `node:test`, as `members.ts` is tested. Then try it by voice and by "Type instead".
