# Reels module (Reel studio)

A squad member types what reel they want ("30s of our beach day, chill vibe", "Kabir's funniest moments with a fast beat") and gets a vertical reel cut from the trip's photos. Gemini does the editing (Claude when Gemini fails): it looks at the photos, picks and orders the ones that fit, and writes captions, timing, camera moves and transitions. The app plays that plan with [Remotion](https://www.remotion.dev/) (`@remotion/player`) and renders the MP4 on the device (`@remotion/web-renderer`), so the backend never touches video.

## Endpoints

Mounted at `/api/reels`, signed-in trip members only (non-members get 404, like the rest of the trip API).

| Route | Does |
| --- | --- |
| `POST /api/reels/trips/:tripId` `{ prompt, photoIds? }` | Cuts a reel. `photoIds` narrows it to photos picked with "Add to reel" in the viewer. Returns 201 with the reel. 5 to 20 seconds with Gemini. |
| `GET /api/reels/trips/:tripId` | The squad's last 20 reels, newest first, and where map tiles come from: `{ items, mapTiles: 'carto' \| 'esri' }`. |
| `GET /api/reels/tiles/carto/:style/:z/:x/:y.png` | A retina CARTO basemap tile (`voyager`, `light_all`, `dark_all`), fetched with `CARTO_API_KEY`. Only mounted when the key is set. No sign-in, since `<img>` can't send the token. |

A reel is `{ id, prompt, plan, seconds, source, createdAt, createdBy }`, where `plan` is `{ title, tagline, style, scenes, facts? }` and `source` is `gemini`, `claude` or `template`. Each scene is `{ kind, photos: [{ id, url }], caption, seconds, motion, transition, stickers, effect, layout?, places? }` (see Scenes below). Photo `url`s are fresh signed read links; a photo deleted since the reel was cut drops out of it, and a photo scene left with none is skipped. Reels saved before scene kinds existed (one `photoId` per scene) are upgraded when read (`upgradeScene()`).

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Prompt not 3 to 300 characters, or malformed photo ids |
| 422 | `NOT_ENOUGH_PHOTOS` | Fewer than 2 photos (in the trip, or among the picks) |

Writer failures never fail the request: Claude steps in for Gemini, the template cut for both, and `source` says which wrote it.

## Flow

1. Load the trip's photos (or the picked ones), oldest first, and spread up to 24 evenly over the trip.
2. Read their bytes with `storage.read()` (uploads are 2048px JPEGs, a few hundred KB) under a 14 MB total budget, skipping anything over 4 MB or not an image.
3. One `gemini.json()` call on `GEMINI_SMART_MODEL` with the prompt, the trip name and destination, the trip's facts (`tripFacts()`: mates, days and photos, from the database), and each photo after a label ("Photo 3 (added by Riya on 4 Nov):"). The plan schema is written once as JSON Schema (`CLAUDE_REEL_SCHEMA`) and converted to Gemini's dialect (`toGeminiSchema()`); it refers to photos by number.
4. `normalizePlan()` keeps only shown photos (each once in photo scenes; collages may reuse them), at most one map and one stats scene (only when there are facts), at most two text cards (only with words), map pins with real coordinates within 2° of the first, and emoji-only stickers (up to 3). It clamps scenes to 1 to 5 seconds (2.5 minimum for maps and stats) and 55 seconds in all, and replaces unknown kinds, styles, moves, transitions, effects and layouts. Fewer than 3 usable scenes, or fewer than 2 with photos, counts as a failure.
5. **Claude fallback** (`src/claude.ts`): if Gemini is off, errors, times out or gives too few usable scenes, the same prompt, labels and photos go to Claude (`CLAUDE_MODEL`, default `claude-opus-5-5`, effort `medium`) with the plan as a JSON Schema structured output (`CLAUDE_REEL_SCHEMA`), checked by the same `normalizePlan()`. HEIC photos are left out for Claude, which doesn't read them. Gemini gets up to 50 seconds and Claude whatever is left of 105 seconds (at least 20). Requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`), so a policy decline is retried on another Claude model rather than failing.
6. Without either, or when both fail: `templatePlan()` takes up to 10 (14 for fast edits) photos spread over the trip, with a look read from the prompt's words, adds a collage in the middle when there are 6 or more photos and a stats scene at the end when there are facts.
7. Store the plan in `trip_reels` (migration `027_reels.sql`) and return it with photo links.

## Scenes

The model builds the reel from five kinds of scene; the Remotion components are in `frontend/src/pages/Reel/scenes/`.

| Kind | What plays | Remotion pieces |
| --- | --- | --- |
| `photo` | One photo with a camera move (`zoom-in`, `zoom-out`, `pan-left`, `pan-right`, `pan-up`) and the caption in the look's type | `Img`, `interpolate`, `spring` |
| `collage` | 2 to 4 photos: `grid` (tiles spring in), `stack` (prints drop onto a table) or `split` (strips slide in) | `@remotion/motion-blur` `Trail` on falling prints |
| `map` | The camera flies from region to street level over satellite or street tiles, pins drop in route order with labels, the route draws itself and a plane flies along it | `@remotion/paths` (`evolvePath`, `getPointAtLength`, `getTangentAtLength`), `@remotion/shapes` pulse ring |
| `stats` | The trip's facts count up on cards over drifting shapes | `@remotion/shapes`, `@remotion/noise` |
| `text` | Kinetic typography: each word springs in at the largest size that fits, the last one underlined with a drawn stroke | `@remotion/layout-utils` `fitText`, `@remotion/paths` |

Every scene can carry `stickers` (emoji that pop in with a motion-blur trail and wobble) and an `effect`: `light-leak` (drifting warm glow), `confetti` (squad-coloured `@remotion/shapes` falling), `sparkle` (twinkling sparks) or `grain` (film flicker, vignette and `@remotion/noise` camera shake). `transition` is `fade`, `slide`, `wipe`, `flip`, `clock-wipe`, `iris`, `push` or `cut`: only `@remotion/transitions` presentations drawn with CSS and SVG, since the WebGL ones (dissolve, zoom-blur, ripple…) can't be drawn by the in-browser MP4 renderer. The title and end cards fit their words with `fitTextOnNLines` and finish with confetti, sparkles, grain or floating hearts.

## Looks

`style` picks the look in `frontend/src/pages/Reel/looks.ts`: fonts (Google Fonts through `@remotion/google-fonts`), colours, photo grade and map style. `cinematic` (Playfair Display, letterbox, dimmed satellite map), `energetic` (Anton, yellow caption blocks, punchy satellite), `dreamy` (Pacifico, warm glow, soft satellite), `retro` (Permanent Marker, prints with a film grade, sepia street map), `playful` (Fredoka, sticker captions, bright street map). Colours in the video are literal values rather than the app's CSS variables, because the renderer draws SVG as standalone images where those variables don't exist.

## Outside services in the video

- **Map tiles**: with `CARTO_API_KEY`, CARTO basemaps (Dark Matter for cinematic, Positron with a sepia grade for retro, Voyager for the rest) through the backend's tile proxy (`src/reels/tiles.ts`). The proxy adds the key server-side so it never reaches the browser, and serves tiles from the app's own origin so the MP4 export can read them. It accepts only CARTO's styles and real tile numbers, makes one upstream call per tile even when several arrive at once, keeps the last 600 in memory and lets browsers cache them for a week. A failed fetch is a 502 and is not cached. The route is public, so anyone who finds it could spend the key's quota (5M requests a month non-commercial, 1M commercial); fine for a demo. Without a key: Esri World Imagery and World Street Map (`server.arcgisonline.com`), straight from the browser (no key, cross-origin reads allowed). Every map shows its source's credit: "© OpenStreetMap contributors © CARTO" or Esri's.
- **Fonts**: Google Fonts, loaded by `@remotion/google-fonts`.
- Pin coordinates come from the model's own knowledge of the places, checked only for being near each other.

## Rendering and sharing

The player runs the composition live in the reel screen. "Save" first downloads every photo and map tile into memory with Remotion's `prefetch` (6 at a time, 2 tries each), then renders a 720×1280, 30 fps MP4 in the browser with `renderMediaOnWeb` (WebCodecs; recent Chrome, Edge and Safari) and downloads it; the page must stay in the foreground while it renders, since browsers throttle background tabs; the share buttons use the Web Share API with the file where the device supports it. Photo links must allow cross-origin reads for rendering: the GCS bucket's CORS (see `trips.md`) already allows GET from the app origin.

Remotion is free for individuals and companies of up to 3 people; larger teams need a [company licence](https://www.remotion.dev/license).

## Config

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` / `VERTEX_PROJECT` | none | Gemini, the first writer |
| `GEMINI_SMART_MODEL` | `gemini-3.5-flash` | Gemini model |
| `ANTHROPIC_API_KEY` | none | Claude, the fallback writer |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Claude model |
| `CARTO_API_KEY` | none | CARTO basemaps for map scenes; Esri tiles without it |

## Tests

`tests/reels/reels.test.ts`: plan clean-up (scene kinds, map pins, stickers, effects, the shared schema, upgrading old reels, trip facts), the template cut, and the routes with a fake database, storage, Gemini and Claude (Gemini's cut, Claude's cut when Gemini fails or is off, the template when both fail, picks, validation and membership). `tests/claude.test.ts`: the Claude client's request (images, structured output, refusal fallback) against a fake fetch, and its refusal, cut-off and bad-JSON errors. The CARTO tile proxy is tested in `reels.test.ts` too: the key and retina path, caching and one upstream call for simultaneous requests, rejected styles and tile numbers, failures not cached, and Esri when there is no key.
