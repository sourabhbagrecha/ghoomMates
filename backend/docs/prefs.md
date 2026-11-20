# Prefs module (Vibe Swipe)

Vibe Swipe is the travel-style quiz: a dating-app-style deck of cards you swipe or tap through. The answers build a **taste**, which holds Beta evidence on the six interest axes, style votes (pace, mornings, budget, crowds, walking, together, eco), tags, deal-breakers and diet. The taste feeds the persona, the itinerary and the squad maths in the trips module. The **core** deck is the same for everyone and can run before sign-up. Each trip also has a **trip deck** of real things to do in its city, where you can see which mates liked or loved each card.

## Pieces

| File | Role |
| --- | --- |
| `src/prefs/taste.ts` | The taste model: card and answer types, scoring (`applyAnswer`, `scoreAnswers`), the read-outs (`vibeOf`, `confidenceOf`, `personaFor`, …). **Byte-identical** to `frontend/src/data/taste.ts`, so the app scores live with the same maths (`tests/prefs/parity.test.ts`). Edit one, copy it to the other. |
| `src/prefs/contract.ts` | The API shapes and the `pref_answers` document. Shared with the frontend and the trips module. |
| `src/prefs/decks/core.ts` | The 17-card core deck. It uses every format: swipe, this-or-that, pick, multi, best-worst and spectrum. |
| `src/prefs/decks/city.ts` | The Udaipur and Goa decks. They are built from the guide catalogue (`voice/experiences.ts`), with four maker workshops (`makers/`) and one farm-to-table thali (`hospitality/`) added for Udaipur. |
| `src/prefs/decks/generic.ts` | 18 illustrated activity cards (`gen:*`) for trips anywhere else. |
| `src/prefs/registry.ts` | All the decks, `CARDS` by id, a trip's city and deck, the card's axes and tags, and the answer snapshot. |
| `src/prefs/order.ts` | The adaptive order of a trip deck. It is a pure function. |
| `src/prefs/validate.ts` | Checks each answer against its card. |
| `src/prefs/service.ts` | Storage, re-scoring and the trip deck with fans. |
| `src/prefs/app.ts` | The router, mounted at `/api/prefs`. |

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/prefs/deck/core` | **Public.** `{ deck: { scope: 'core', cards } }` |
| GET | `/api/prefs/trips/:tripId/deck` | For trip members only. Returns `{ deck: { scope: 'trip', tripId, city, cards, answered, total } }`. Unanswered cards come first, in adaptive order, followed by the cards you have answered, in deck order. Each card has a `fans` list of mates who liked or loved it: `{ name (first name), colour?, verdict }`. |
| GET | `/api/prefs/me` | `{ taste, summary, answers: { core } }`. `taste` and `summary` are null until your first save. |
| POST | `/api/prefs/answers` | Body: `{ scope: 'core', answers }` or `{ scope: 'trip', tripId, answers }`. Returns `{ taste, summary }`. |
| POST | `/api/prefs/reset` | Body: `{ scope: 'core' }`. Retakes the quiz: your core answers are deleted, then your taste is re-scored. Returns `{ taste, summary }` (null when nothing is left). |

Everything except the core deck needs a signed-in user and the database. Without a database these routes answer `503 SERVICE_UNAVAILABLE`, and without a token they answer `401`. Errors use the shared `{ "error": { "code", "message" } }` envelope.

A trip you are not in, an unknown trip id or a malformed trip id all get `404 NOT_FOUND`, like the trips module, so trip ids don't leak.

The routes cost nothing per call, so the generic per-IP and per-client limits cover them (see [limits.md](limits.md)).

## Answers

`answers` is a list of 1–60 `{ cardId, reply, ms }` items. Each must be a card in the scope's deck:

- core: the core deck.
- trip: the deck for that trip's city, so a core card or another city's card gets a 400.

`reply` must fit the card:

| Reply | Allowed on | Rules |
| --- | --- | --- |
| `{ kind: 'swipe', verdict: nope \| like \| love }` | swipe cards | |
| `{ kind: 'choose', optionIds }` | this-or-that, pick and spectrum | exactly one option |
| `{ kind: 'choose', optionIds }` | multi | one or more options, none repeated; an `exclusive` option (“None of these”) must be alone |
| `{ kind: 'best-worst', best, worst }` | best-worst cards | two different options |
| `{ kind: 'skip' }` | any card | |

`ms` is the time taken to answer. It is clamped to 0–600,000 and rounded. If one request answers the same card twice, the last answer wins.

Each answer is upserted into `pref_answers` (unique on `user_id + scope + card_id`; scope is `'core'` or the trip id). Skips are stored too, so a skipped card counts as answered and doesn't come back to the front of the deck.

Every stored answer also carries a **card snapshot**: `title`, `kind` (style, experience, maker or archetype), the card's `axes` and `tags`, plus `city` and `place` for trip cards. This lets the trips module do squad maths without importing the decks.

### Re-scoring

After every save and every reset, **all** of your answers (core first, then each trip) are replayed from scratch with `scoreAnswers`. The results are written with dot paths, so `preferences.colour` and anything else you have set stays as it is:

- `preferences.taste`: the full taste plus `updatedAt`.
- `preferences.vibe` and `preferences.persona` (the persona name), which the older screens still read.
- `preferences.diet`, but only when an answer sets it.

Two edge cases decide what is written:

- **Only skips so far.** If the taste has no evidence yet (`answered === 0`), `vibe` and `persona` are not written. A vibe from the older setup flow is not flattened to 0.5 everywhere.
- **Nothing left after a reset.** If a reset leaves nothing to score (`answered === 0`, so only skips or no answers at all), `preferences.taste` is unset, and `vibe`, `persona` and `diet` are kept.

## Decks

| Deck | Cards | Built from |
| --- | --- | --- |
| core | 17 | Hand-written style questions. Ids are `core:*`. |
| Udaipur | 22 | 17 guide experiences (`exp:*`), 4 maker workshops (`maker:*`) and the Kesar Pol Haveli farm-to-table thali (`host:*`). |
| Goa | 14 | The 14 Goa guide experiences. |
| generic | 18 | Illustrated activity cards (`gen:*`) for any other city. |

A trip's city comes from its `destination`, or from its `name` if the destination doesn't match (`cityForDestination`).

Experience cards get their axes from the catalogue `vibe`. Their style hints come from the facts:

- `mornings`: 1 for a start before 8 AM, 0 for a start at 9 PM or later.
- `budget`: 0.2 up to ₹800, 0.5 up to ₹1,500, 0.8 above that.
- `crowds`: 0 for anything tagged “Hidden gems”.

The app shows the catalogue photo for each experience. Maker and host cards use the AI-generated cover art in `frontend/public`, credited as an “AI-generated illustration”.

Card copy follows the house style: sentence case, curly quotes, ₹ with Indian grouping, and option labels of 1–4 words. Option icons need `icon-<name>-primary.svg` and illustrated art icons need `icon-<name>-white.svg` in `frontend/src/assets/icons`. `tests/prefs/decks.test.ts` checks all of this.

## Adaptive order

The unanswered cards in a trip deck are sorted by

`priority = 0.5 · uncertainty + 0.3 · squadSplit + 0.2 · novelty`

highest first, with ties broken by id. The three terms:

- **uncertainty**: how little we know about you on the axes the card speaks to, Σ v·(1 − confidence) / Σ v.
- **squadSplit**: 1 when the mates who answered are split evenly between like and no, 0 when they agree, and 0.5 before anyone has answered.
- **novelty**: 1 when none of the card's tags is in your taste yet.

The sort is then adjusted for variety. Two cards in a row never share their strongest axis if another card within 0.1 priority of the best remaining one leans on a different axis.

The function is pure and deterministic, and it only sees counts. Who said what never reaches it.

## Privacy: nobody sees a no

Who said no is never revealed. In detail:

- `fans` lists only likes and loves from other members, never your own.
- Nopes and skips count only towards the squad-split numbers.
- No route returns another member's nope, or the list of members who answered.
- Your own nopes appear only in your own `answered` list.
