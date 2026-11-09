# GhoomMates Design Guidelines

GhoomMates is a group-travel app for a squad of friends: plan the itinerary, share photos, split expenses and discover things to do, with **GhoomMate**, a voice-first AI buddy, always one tap away.

This document is the single source of truth for how GhoomMates looks and feels in code. Every value here comes from the Figma file and is implemented as a token or shared component in this repo. **If you need a value that isn't here, add it as a token first, then use it.**

- **Figma:** [ghoommates · iOS Mockups](https://www.figma.com/design/0fRlnZbD7Wka2u2qE8xLsx/ghoommates)
- **Tokens:** [`src/styles/tokens.css`](src/styles/tokens.css)
- **Shared utility classes:** [`src/styles/ui.css`](src/styles/ui.css)
- **Shared components:** [`src/components/`](src/components/)

---

## 1. Design principles

1. **Bright and playful, never loud.** Deep blue carries the brand; yellow is the spark. Use yellow for the *one* thing you want tapped or noticed on a surface, not for decoration.
2. **The squad comes first.** Show people (avatars, "4/5 loved it", "Whole squad") wherever a decision involves the group. Each friend has a fixed colour (section 3.4).
3. **GhoomMate is always reachable.** The floating mascot button sits bottom-right on every screen. Its speech bubble offers one short, contextual tip.
4. **One clear action per card.** A card can hold several pieces of information, but only one primary button.
5. **Soft, rounded and light.** Generous radii, airy blue-tinted shadows and a pale blue page background. Avoid hard borders and pure-black shadows.

---

## 2. Using tokens

All colours, radii, shadows and gradients live in [`tokens.css`](src/styles/tokens.css) as CSS custom properties.

```css
/* ✅ Do */
.my-card { background: var(--color-surface); border-radius: var(--radius-card); filter: var(--shadow-card); }

/* ❌ Don't */
.my-card { background: #fff; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,.2); }
```

A few one-off translucent values that appear only once in Figma (e.g. the Skip link's `rgba(7, 42, 200, 0.7)`) live in the page's CSS. Promote a value to a token as soon as a second screen needs it.

---

## 3. Colour

### 3.1 Brand

| Token | Hex | Use for |
|---|---|---|
| `--color-primary` | `#072ac8` | Primary buttons on white, selected chips, active tab label, links to actions, timeline dots |
| `--color-primary-bright` | `#1557e6` | End stop of the deep gradient (Reel studio) |
| `--color-sky` | `#1e96fc` | Accents: times, text links ("See all"), stat callouts, the "Squad" data series |
| `--color-sky-light` | `#a2d6f9` | Soft fills: icon tiles, timeline rail, host banner, the card peeking behind flashcards |
| `--color-yellow` | `#fcf300` | **Highlight.** Primary CTA on blue, active tab pill, badges ("HOT"), match pills, selected-face ring |
| `--color-amber` | `#ffc600` | Warm surfaces: vibe-check flashcard, "You" data series, star ratings, your own avatar |

### 3.2 Text

| Token | Hex | Use for |
|---|---|---|
| `--color-ink` | `#0b1747` | Headings and primary text on light surfaces; GhoomMate bubble background |
| `--color-muted` | `#5b6894` | Secondary text, metadata, overlines |
| `--color-subtle` | `#8a94b8` | Placeholders and inactive tab labels only (low contrast, see section 11) |
| `--color-disabled` | `#9aa6c8` | Pending/disabled steps |
| `#ffffff` | – | Text on the blue header, on primary buttons and on avatars |
| `--color-on-brand-muted` | `rgba(255,255,255,.8)` | Eyebrows and labels on the blue header |

### 3.3 Surfaces and status

| Token | Value | Use for |
|---|---|---|
| `--color-bg` | `#f2f8ff` | Page background below the header |
| `--color-surface` | `#ffffff` | Cards, list cards, chips, search field |
| `--color-tint` | `#eef6ff` | Inset panels inside a card (trip feedback) and tags |
| `--color-tint-cool` | `#eef3fb` | Row dividers in lists, pending step fills |
| `--color-track` / `--color-track-muted` | `#e6effc` / `#e2eaf7` | Progress-bar tracks, inactive connectors |
| `--color-divider` | `#edf2fa` | Section dividers inside cards |
| `--color-border` | `#d7e6fb` | Unselected chip outline (the only bordered element) |
| `--color-glass` / `--color-glass-strong` | `rgba(255,255,255,.16/.18)` | Frosted tiles and icon buttons on the blue header or blue cards |
| `--color-success` | `#16a34a` | Money coming **in** ("+₹1,150") |

### 3.4 People

Each squad member keeps one colour everywhere: avatars, charts and legends. Defined in [`src/data/people.ts`](src/data/people.ts).

| Person | Initial | Token | Hex |
|---|---|---|---|
| You | A | `--color-person-you` | `#ffc600` |
| Riya | R | `--color-person-riya` | `#1e96fc` |
| Kabir | K | `--color-person-kabir` | `#ff7aa8` |
| Meera | M | `--color-person-meera` | `#7b61ff` |
| Dev | D | `--color-person-dev` | `#22c39a` |

### 3.5 Gradients

| Token | Where |
|---|---|
| `--gradient-sky` (sky → primary, 135°) | GhoomMate button |
| `--gradient-deep` (primary → primary-bright, 152°) | Hero feature card on blue (Reel studio) |
| `--gradient-sunshine` (yellow → amber, left → right) | The single most important CTA on a screen (Settle all) |
| `--gradient-brand-instagram` / `--color-brand-whatsapp` | Share tiles in those apps' own colours, with their white logos from `src/assets/brands/` (reel screen). Only for pointing at those apps |

Each screen's **header background** is an exported SVG (`src/assets/figma/*-header-bg.svg`) containing the blue gradient, rounded bottom corners and decorative circles. Don't rebuild it in CSS.

---

## 4. Typography

**Font:** [Poppins](https://fonts.google.com/specimen/Poppins), loaded from Google Fonts in `index.html` with weights **600 (SemiBold), 700 (Bold), 800 (ExtraBold)**. Don't use 400/500: the design has no regular-weight text.

**Line height rule:** Figma uses Poppins' natural line height rounded **up** to a whole pixel: `line-height = ceil(font-size × 1.5)`. Always set `line-height` explicitly in px, or layout drifts by half-pixels against Figma.

### Type scale

| Role | Size / line height | Weight | Notes / example |
|---|---|---|---|
| Screen title | 26 / 32 | 800 | `letter-spacing: -0.6px`, white. "Goa Trip" |
| Screen title, long | 22 / 26 | 800 | `letter-spacing: -0.4px`, white, two lines at most. `ScreenLayout` switches to it for titles over 14 characters (a trip called "Mewar Mates · Udaipur") and grows the header with it, so the title never runs under the header buttons |
| Balance value | 20 / 30 | 800 | "₹2,340" |
| Section title | 18 / 27 | 800 | `SectionHeader`. "Trending this weekend" |
| Card headline | 17 / 21 (wrapping) or 26 (single line) | 800 | "The Thrill-Seeking Foodies", "Settle all in 1 UPI tap" |
| Question / sub-heading | 15 / 23 | 800 | "Your perfect evening looks like…", amounts in lists |
| Item title | 14 / 17–21 | 800 | Stop, expense and trend titles. Use 17–18 when it may wrap |
| Body strong | 13 / 20 | 700–800 | Group name, settlement names |
| Button / chip | 12 / 18 | 700 (chips) · 800 (yellow CTAs) | |
| Eyebrow (on header) | 12 / 18 | 600 | Uppercase, `letter-spacing: 0.4px`, `--color-on-brand-muted` |
| Meta / caption | 11 / 17 | 600 | "4/5 loved it", "Auto-simplified" |
| Overline (in cards) | 11 / 17 | 800 | `.overline`: uppercase, `letter-spacing: 0.6px` |
| Tab label | 11 / 17 | 600 inactive · 800 active | |
| Tag / badge | 10–10.5 / 15–16 | 800 | `.tag`, uppercase |
| Micro | 8.5–9 / 13–14 | 700 | Chart labels, video duration |

**Casing:** write source text in sentence case and let CSS (`text-transform: uppercase`) handle eyebrows, overlines, tags and badges. Titles and buttons stay in sentence case ("Generate reel", not "Generate Reel").

---

## 5. Spacing and layout

GhoomMates is designed for a **393 × 852 pt** iPhone frame. On desktop the app renders inside that frame, which is kept within one viewport height: on windows shorter than 900 px the frame gets shorter so only the screen inside scrolls, never the page. On phones (≤ 500 px wide) it fills the viewport.

### Screen anatomy

```
┌──────────────────────────────┐  ← Header background SVG (height varies per screen)
│ TopSafeArea (24, or notch)   │
│ Top bar: eyebrow + title     │  padding 4 20 0 · HeaderActions on the right
│ .screen__header-row          │  padding 14 20 0 · group pill / search / balances
├──────────────────────────────┤
│ .screen__body                │  padding 16 16 0 · gap 14 between sections
│   cards, section headers…    │
│                              │
│        [GhoomMate says]  (FAB)  ← bubble: right 92 / bottom 118 · FAB: right 8 / bottom 92
├──────────────────────────────┤
│ TabBar (88, fixed)           │
└──────────────────────────────┘
```

- **Gutters:** 20 px for header content, 16 px for the body.
- **Vertical rhythm:** 14 px between sections in the body; 8 px between items in a list; 6 px between chips.
- **Card padding:** 14 px (`.card`); list cards use 8–12 px.
- **Inner gaps** come from this set: **1, 2, 3, 4, 5, 6, 8, 10, 12, 14**. Don't invent new ones.
- **Bottom padding:** `ScreenLayout` reserves 104 px for the tab bar, or 196 px with `withBubble` so the last item can scroll clear of the GhoomMate bubble.
- **Horizontal carousels** (category chips, trending cards) bleed to the screen edge: negative 16 px side margins plus 16 px padding, with `.no-scrollbar`.

### Header heights

| Screen | Header SVG height |
|---|---|
| Itinerary | 190 |
| Photos & Reels | 262 (the find-me panel sits on the blue) |
| Split Expenses | 210 |
| Explore | 170 |

---

## 6. Shape and elevation

### Radii

| Token / value | Use |
|---|---|
| `--radius-pill` (999) | Chips, pill buttons, badges, group pill |
| 24 | Hero feature card on blue (Reel studio) |
| `--radius-card` (22) | Large cards, flashcards, trend cards |
| 20 | Guide trip card, host banner |
| `--radius-list-card` (18) | List cards, balance tiles, inner CTA |
| 16 | Search field, reel preview |
| `--radius-tile` (14) | Icon tiles, inset panels, QR button, guide cover |
| 12 / 10 | Square-ish buttons (Add, Generate, Join) |
| 8 | Tags |
| 50% | Avatars, dots, round icon buttons |

### Shadows

All shadows are tinted with the primary blue, never black. Use `filter: drop-shadow` (via the token) on rounded cards so the shadow follows the shape.

| Token | Value | Use |
|---|---|---|
| `--shadow-card` | `drop-shadow(0 6px 9px rgba(7,42,200,.08))` | `.card` |
| `--shadow-list-card` | `drop-shadow(0 4px 6px rgba(7,42,200,.06))` | `.list-card` |
| `--shadow-float` | `drop-shadow(0 8px 10px rgba(7,42,200,.18))` | Elements floating over the header (search) |
| `--shadow-cover-card` | `0 6px 18px rgba(7,42,200,.1)` (box-shadow) | Image cards with `overflow: hidden` |
| `--shadow-fab` | `0 10px 24px rgba(7,42,200,.45)` | GhoomMate button |
| Tab bar | `drop-shadow(0 -6px 12px rgba(7,42,200,.1))` | Upward shadow above the tab bar |
| Settle CTA | `drop-shadow(0 10px 12px rgba(255,198,0,.45))` | A yellow glow, only for the sunshine CTA |

---

## 7. Components

Reuse these before writing new markup.

### `ScreenLayout`: [`src/components/ScreenLayout.tsx`](src/components/ScreenLayout.tsx)
The shell for every tab screen: header SVG, top safe area, eyebrow and title, header actions, and a scrolling body. Pass `withBubble` when the screen shows a GhoomMate tip. Put header-row content in `.screen__header-row` and the main column in `<main className="screen__body">`.

```tsx
<ScreenLayout headerBg={headerBg} headerHeight={210} eyebrow="Goa Gang · Expenses" title="Split & Settle" withBubble>
  <div className="screen__header-row">…</div>
  <main className="screen__body">…</main>
</ScreenLayout>
```

### `Avatar` / `AvatarStack`: [`src/components/Avatar.tsx`](src/components/Avatar.tsx)
A circle in the person's colour with a white initial. The border (5%) and initial (42.5%) scale with size.

| Size | Where | Stack overlap |
|---|---|---|
| 18 | Inside list cards and trend cards | 6 |
| 26 | Group pill, guide host | 9 |
| 34 | Settlement rows | – |
| 40 | Profile-sized | – |

### `Chip`: [`src/components/Chip.tsx`](src/components/Chip.tsx)
Toggleable pill used for filters and multi-select answers.
- **Default:** white with `--color-border` outline and ink text.
- **Selected:** primary fill, white text, check icon.
- **`variant="onDark"`:** translucent white for use on blue cards; selected turns yellow.

### `SectionHeader`: [`src/components/SectionHeader.tsx`](src/components/SectionHeader.tsx)
An 18 px title with a right-aligned `action` slot: a `.text-link` ("See all"), a `.pill-button` ("+ Add") or a custom control (day pills).

### `TabBar`: [`src/components/TabBar.tsx`](src/components/TabBar.tsx)
Four tabs: Itinerary, Photos, Expenses, Explore. The active tab gets a 56 × 32 yellow pill, a primary-blue icon and an 800-weight label. Inactive tabs use `--color-subtle`. Each icon has a separate `-active` SVG.

### `GhoomMateFab` and `GhoomMateSays`: [`src/components/GhoomMate.tsx`](src/components/GhoomMate.tsx)
The FAB lives at app level and appears on every screen. `GhoomMateSays` is a dark ink bubble (corners 18/18/4/18, with the 4 px corner pointing at the FAB) holding **one short sentence** (≤ ~60 characters) suggesting something to say or do. Use it on at most one tip per screen, and leave it off when the screen already has a strong CTA near the bottom (as Explore does).

### `HeaderActions` and `TopSafeArea`
Fixed header chrome: a QR invite button (frosted glass, opens Members) and your profile avatar (your photo, else your Google photo, else your initial, with a yellow ring). `TopSafeArea` is the small top margin of every screen (`--top-inset`: 24 px, or the phone's own status-bar height when the app runs full-screen on a notched phone). Don't draw a fake time, signal or battery. The header artwork is shifted up by `--header-art-offset` so headers keep their Figma shape.

### Onboarding and form components
Used by the sign-up flow in [`src/pages/Onboarding/`](src/pages/Onboarding/) (Figma: the **Onboarding** section and **Components · Onboarding**).

| Component | What it is |
|---|---|
| [`OnboardingLayout`](src/components/OnboardingLayout.tsx) | Blue header with a back button, eyebrow, title, optional subtitle and a 4-step progress bar; a scrolling body; actions pinned to the bottom |
| [`Button` / `LinkButton`](src/components/Button.tsx) | Full-width 52 px button: `highlight` (yellow, on blue), `primary` (blue, on light), `glass` (on blue), `outline` (on light). `LinkButton` is the 13 px sky text action under it ("Skip for now") |
| [`TextField`](src/components/TextField.tsx) | Labelled 54 px input with a 2 px primary border on focus; `leading` slot for the country-code picker |
| [`OtpInput`](src/components/OtpInput.tsx) | Six 48 × 58 boxes backed by one input, so paste and SMS autofill work |
| [`PermissionRow`](src/components/PermissionRow.tsx) | Icon tile, title, reason, and an "Allow" pill that becomes a green "Allowed" |
| [`GhoomMateAvatar` / `GhoomMateTip`](src/components/GhoomMate.tsx) | The mascot in its ringed circle at any size; a white tip card with a 36 px mascot |

Every onboarding screen can be opened directly at `#/welcome`, `#/sign-in`, `#/verify`, `#/about-you`, `#/selfie`, `#/permissions` or `#/invite`.

### Vibe components
Used by the Itinerary vibe card and the personality quiz in [`src/pages/Quiz/`](src/pages/Quiz/).

| Component | What it is |
|---|---|
| [`Flashcard`](src/components/Flashcard.tsx) | Amber question card with a sky card peeking out behind it at −3°: overline ("Vibe check · Card 3 of 8"), Skip, a 15 px question, a hint and the answers (`Chip`s on the Itinerary, `OptionTile`s in the quiz) |
| [`VibeChart`](src/components/VibeChart.tsx) | The hexagonal “spiderweb” across the six axes in [`src/data/vibe.ts`](src/data/vibe.ts). Draw the squad in sky (28% fill) and You in amber (15% fill, with dots), You on top. `variant="compact"` is the 176 × 140 Itinerary chart; the default is for bigger charts |
| [`OptionGrid` / `OptionTile`](src/components/OptionTile.tsx) | Answer tiles on a quiz flashcard: a 28 px primary line icon over a 1–3 word label. Three options sit in one row, four in a 2 × 2 grid. Picked tiles turn primary blue with a white icon and check |

**Personality quiz:** after Permissions, onboarding continues to the quiz intro (`#/quiz`), eight cards (`#/quiz/1` … `#/quiz/8`) and your travel persona (`#/quiz/persona`). Keep questions to a few words (“Your trip pace?”) and let the icon carry the meaning of each option. Single-choice cards say “Pick one”, multi-choice cards “Pick any”. The result is saved on the device and drives the “You” shape on the Itinerary vibe card and your persona, spiderweb and traits in Profile, where “Retake vibe quiz” opens it again.

### Date components
Used by the create-trip Dates step and Trip settings. Trip dates are `YYYY-MM-DD` strings and “today” is the date in India (UTC+5:30), never the device’s own zone: all the date maths lives in [`src/data/tripDates.ts`](src/data/tripDates.ts), which has no imports.

| Component | What it is |
|---|---|
| [`DateRangeCalendar`](src/components/DateRangeCalendar.tsx) | Month calendar that opens on the current month and pages with the round ‹ › buttons. First tap sets the start, the second the end, a third starts over. Past days (a trip can start today) and days past the 14-day itinerary limit are greyed out, and today wears a small dot. `lockStart` keeps the first day fixed for a trip that is already live. Put it inside a `.card` on a page |
| `RangeSummary` | The tinted “Trip length” panel: days and nights, first day → last day |
| [`DateRangeSheet`](src/components/DateRangeSheet.tsx) | Bottom sheet around the calendar with the summary, an optional hint and one Save button. Esc, the ✕ and the scrim close it. Trip settings uses it to change a trip’s dates |

### App structure and navigation
**Home** (`#/`) is the top level: a GhoomMate briefing, the live trip card (with shortcuts into each trip tab), upcoming trips, past trips and a pinned "Plan a new trip" button. Opening a trip goes to `#/trip/<tab>`, where the four tab screens show a back button to Home (`ScreenBackContext`). **Notifications** (`#/notifications`) open from the bell, which shows the unread count. `#/home/empty` previews the first-run Home with no trips.

The rest of the app hangs off those screens:

| Area | Routes | Folder |
|---|---|---|
| Create a trip | `#/create/destination` → `dates` → `squad` → `vibe` → `generating` → `draft` | `src/pages/CreateTrip/` |
| Before the trip (planning mode) | `#/plan`, `#/plan/vote/<id>`, `#/plan/bookings`, `#/plan/checklist`, `#/plan/budget` | `src/pages/Plan/` |
| During the trip (details) | `#/trip/itinerary/stop/<id>`, `…/itinerary/add`, `#/trip/expenses/add`, `#/trip/expenses/settle[/done]`, `#/trip/photos/view/<i>`, `…/photos/upload`, `…/photos/reel`, `#/trip/explore/guide`, `#/trip/members`, `#/trip/settings` | `src/pages/Trip/` |
| Kaavad Tales (heritage stories) | `#/trip/explore/story/<siteId>`, `#/trip/explore/passport` | `src/pages/Stories/` |
| Profile and account | `#/profile`, `…/edit`, `…/settings`, `…/help`, `…/credits` (photo credits; "Retake vibe quiz" opens `#/quiz`) | `src/pages/Profile/` |
| System states gallery | `#/states` (loading, empty, error, offline) | `src/pages/States/` |
| Mewar Utsav: Udaipur's festivals, fairs and nightly shows, with crowd warnings, “Add to our itinerary” and “Plan around it” (opened from Explore's “This week in Mewar”; `?e=<id>` scrolls to one) | `#/trip/explore/events` | `src/pages/Events/` |
| Partner tools: Heritage Ops console for site managers (opened from Settings or Explore's crowd map); its sky-blue "heads up" advisories show on Explore and stop pages | `#/ops` | `src/pages/Ops/` |
| After the trip | `#/past/<id>` (recap), `…/album`, `…/days`, `…/expenses` (final tally + settle up), `…/rate[/<stars>]` | `src/pages/PastTrip/` |

Any screen can move elsewhere with `useNavigate()` from `src/hooks/navigation.ts`. **Runs on every screen:** the GhoomMate FAB opens the voice overlay (`src/components/voice/`, `useVoice().open(prompt?)`), and `OfflineBanner` shows just below the top safe area when the connection drops. For loading, empty and error moments use `Skeleton`, `EmptyState` and `ErrorState` from `src/components/states/`; never ship a blank screen.

`CoverLayout` (full-bleed photo header with a sheet body: stop, guide trip, trip recap) and `Toast` + `useToast` (feedback for stubbed actions) are shared. Still local and worth promoting once a second screen needs them: toggle switch, segmented control, progress bar, status tag, person toggle and star rating. Profile still draws your vibe with its own `VibeWeb` and the Create-trip vibe step with the static `spiderweb.svg`; both could switch to the shared `VibeChart` (see Vibe components).

- Trip status shows as a `.tag` (Planning / Booked) and a live trip gets a yellow **LIVE · DAY n OF n** badge with a pulsing green dot. A trip is live on every day from its first to its last, both included, counted in India time.
- Something that needs the user ("2 votes need you", "Pay ₹450") is sky blue or a `.pill-button`, never red.

### Crowd components
Used by the Itinerary, Stop detail and Explore screens for heritage-site crowds (see `backend/docs/heritage.md`).

| Component | What it is |
|---|---|
| [`CrowdChip`](src/components/crowd/Crowd.tsx) | Pill with a dot in the crowd colour and ink text: Quiet, Moderate, Busy, Packed, Closed. The colour is never the only signal |
| [`CrowdBars`](src/components/crowd/Crowd.tsx) | Hour-by-hour forecast bars; the stop's hour is outlined in primary, the quietest hour's label is green |
| [`CrowdPulse`](src/pages/Explore/CrowdPulse.tsx) | Explore's live map of the old city with site dots coloured by crowd, an hour scrubber and quiet gems |

Crowd colours are tokens (`--color-crowd-{quiet,moderate,busy,packed,closed}` plus `-tint` fills). Packed uses a coral, not red, to show status rather than an error.

### Kaavad Tales components
Heritage stories told like a Kavadiya Bhat's Kaavad, with a quiz and a Heritage Passport stamp (see `backend/docs/stories.md`). They live in [`src/pages/Stories/`](src/pages/Stories/).

| Component | What it is |
|---|---|
| `KaavadStage` | The painted shrine: a vermilion frame (coral mixed with amber, never a new colour), doors that swing open and panels that fold in 3D. With `prefers-reduced-motion` it is a plain fade |
| `StampSeal` | The passport seal in primary with the Sun of Mewar and the score; gold, silver and bronze change the disc. It thumps onto the page when `animate` |
| `HearTheStory` | Entry point to a story: a `card` in a stop's story section, a `link` under a site in Crowd pulse |
| `StoriesOfMewar` | Explore's carousel of painted stories, with a link to the passport |

Right answers are green and wrong ones sky blue, never red. Everything around a story switches to Hindi with the story (`copy` in `storiesData.ts`), and Devanagari gets taller line heights through `:lang(hi)`.

### Utility classes: [`src/styles/ui.css`](src/styles/ui.css)

| Class | What it is |
|---|---|
| `.card` | Large white card: 14 px padding, 22 radius, card shadow, flex column |
| `.list-card` | Compact white row: 18 radius, small shadow, flex row |
| `.overline` | 11 px uppercase 800 label (recolour per context) |
| `.text-link` | 12 px sky-blue text action |
| `.tag` | Tinted uppercase category label (ADVENTURE, FOOD) |
| `.pill-button` | Small primary pill button, optionally with a 14 px icon |
| `.home-indicator` | iOS home bar for screens without the tab bar (`--light` on blue) |
| `.no-scrollbar` | Hides scrollbars on horizontal scrollers |

---

## 8. Buttons: hierarchy

| Level | Look | Example | When |
|---|---|---|---|
| **Hero CTA** | Yellow frame, sunshine gradient, primary icon tile, arrow circle | Settle all in 1 UPI tap | The single most important action on a screen, at most one |
| **Primary on blue** | Yellow fill, primary text (800) | + Invite, Generate reel | Main action on blue header or blue card |
| **Primary on white** | Primary fill, white text | Add, Join, `.pill-button` | Main action inside a white card |
| **Glass** | `--color-glass-strong` on blue, white icon | QR, voice mic | Secondary icon actions on blue |
| **Text link** | `.text-link` (sky) | See all, Filters | Low-emphasis navigation |
| **Toggle** | `Chip` / day pills | Street food crawl, D2 | Selecting options |

Every tappable element must be a `<button>` (or `<a>`), never a clickable `<div>`.

---

## 9. Iconography and imagery

- Icons are **2 px stroke, rounded caps and joins**, exported from Figma as SVGs into [`src/assets/figma/`](src/assets/figma/).
- The Figma icons are [Lucide](https://lucide.dev). Icons the design doesn't have yet (the quiz answer tiles) are taken straight from Lucide into [`src/assets/icons/`](src/assets/icons/), one file per colour, and looked up by name with `iconUrl(name, colour)`. Keep its `LICENSE` file next to them.
- Sizes: **12, 14, 16, 18, 20, 22** px. Tab icons are 22, header and banner icons 20, inline icons 12–18.
- **Colour is baked into the SVG.** Each colour variant is its own file, named `icon-<name>-<colour>.svg` (e.g. `icon-arrow-sky.svg`, `icon-mic-white.svg`). Don't recolour with CSS filters. Export a new variant from Figma instead.
- Always pass `width` and `height` and `alt=""` for decorative icons. Put the accessible name on the button (`aria-label`).
- Photo placeholders are gradient-plus-mountain SVGs from Figma. Swap them for real images (same size and radius) when data is wired up.
- Real photographs come from Wikimedia Commons with their author and licence in [`src/pages/Explore/experiencePhotos.ts`](src/pages/Explore/experiencePhotos.ts). They are credited on the guide trip they belong to, on the credits screen (`#/profile/credits`, Settings → Legal) and in [`PHOTO_CREDITS.md`](PHOTO_CREDITS.md). Never add a photo without its credit.
- **GhoomMate mascot:** the octopus PNG sits inside the sky-gradient circle. Don't crop, recolour or use the mascot anywhere else without design review.

---

## 10. Voice and copy

- **Tone:** a friendly mate, not a travel agent. Short, casual and upbeat. "Squad loves food!", "Just say…", "Who's in it?"
- **Talk about the group:** "Goa Gang · 5 mates", "Whole squad", "4/5 loved it".
- **Indian context:** rupees as `₹1,890` (Indian digit grouping), compact `₹48.6k`, UPI for payments. Dates as `Sat, 31 Oct`, times as `06:00 AM`.
- **Separators:** a middle dot with spaces (` · `) between pieces of metadata.
- **Typography characters:** curly quotes `“ ”` and apostrophes `’`, an ellipsis `…` (one character), and arrows `→` for transfers.
- **GhoomMate tips** suggest something the user can *say* or *do* next, in one sentence.

---

## 11. Accessibility

Contrast ratios for the palette (WCAG AA needs 4.5:1 for normal text and 3:1 for large or bold ≥ 18.66 px):

| Pair | Ratio | Verdict |
|---|---|---|
| Ink on white | 17.1 | ✅ Any text |
| Primary on white / white on primary | 9.7 | ✅ Any text |
| Primary on yellow | 8.3 | ✅ Any text |
| Primary on amber | 6.1 | ✅ Any text |
| Muted on white | 5.5 | ✅ Any text |
| Muted on tint | 5.0 | ✅ Any text |
| Sky on white | 3.1 | ⚠️ Large or bold text and accents only |
| Success on white | 3.3 | ⚠️ Bold amounts only, always with a `+` sign |
| Subtle on white | 3.0 | ⚠️ Placeholders and inactive tabs only |
| Disabled on white | 2.4 | ❌ Decorative or disabled states only |
| White on amber / yellow | 1.6 / 1.2 | ❌ Never for text |

**Known issue to raise with design:** avatar initials are white on the person colour, which fails contrast for You (amber) and is weak for Riya (sky). Avatars always carry a `title`, and the name appears elsewhere, so the initial isn't the only identifier. Still, consider an ink initial on light avatar colours.

Other rules:
- Use `aria-pressed` on toggle chips and day pills, `role="radiogroup"` with `aria-checked` on star ratings, and `role="progressbar"` with values on progress bars.
- Every icon-only button needs an `aria-label`.
- Don't rely on colour alone. Pair status colours with text or signs ("+₹1,150", "Incoming via UPI").
- Keep tap targets at least 36 px where possible. The smallest in the design are the 26–30 px pills: give them extra padding if they cause trouble.

---

## 12. Adding a new screen: checklist

1. Design the frame in Figma at 393 × 852 using existing components, and export its header SVG.
2. Create `src/pages/<Name>/<Name>Page.tsx`, `<Name>Page.css` and `<name>Data.ts` (keep copy and numbers in the data file).
3. Wrap it in `ScreenLayout`. Use `.screen__header-row` and `.screen__body`.
4. Build from `.card`, `.list-card`, `SectionHeader`, `Chip`, `Avatar` and the tokens. Give every text style an explicit px `line-height`.
5. Download new icons into `src/assets/figma/` with the `icon-<name>-<colour>.svg` naming. Never reference Figma asset URLs at runtime.
6. Register the page in `App.tsx` (and the tab bar if it's a tab).
7. Check it at 393 × 852 against the Figma frame: section positions should match to the pixel.
8. Run `npm run build` and `npm run lint`.

---

## 13. Quick do / don't

| ✅ Do | ❌ Don't |
|---|---|
| Use `var(--color-…)` tokens | Hard-code hex values in page CSS |
| One yellow CTA per surface | Several yellow buttons competing |
| Blue-tinted, soft shadows from tokens | Black or grey shadows |
| Explicit px line heights | `line-height: normal` or unitless values |
| Export icon colour variants from Figma | Recolour SVGs with CSS filters |
| Sentence case plus CSS uppercase | Typing ALL CAPS in source text |
| `<button>` for anything tappable | `onClick` on a `<div>` |
| Keep person colours consistent | Give a person a different colour on another screen |
