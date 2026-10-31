# Ghoomate Design Guidelines

Ghoomate is a group-travel app for a squad of friends: plan the itinerary, share photos, split expenses and discover things to do, with **GhoomMate**, a voice-first AI buddy, always one tap away.

This document is the single source of truth for how Ghoomate looks and feels in code. Every value here comes from the Figma file and is implemented as a token or shared component in this repo. **If you need a value that isn't here, add it as a token first, then use it.**

- **Figma:** [ghoomates · iOS Mockups](https://www.figma.com/design/0fRlnZbD7Wka2u2qE8xLsx/ghoomates)
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

Each screen's **header background** is an exported SVG (`src/assets/figma/*-header-bg.svg`) containing the blue gradient, rounded bottom corners and decorative circles. Don't rebuild it in CSS.

---

## 4. Typography

**Font:** [Poppins](https://fonts.google.com/specimen/Poppins), loaded from Google Fonts in `index.html` with weights **600 (SemiBold), 700 (Bold), 800 (ExtraBold)**. Don't use 400/500: the design has no regular-weight text.

**Line height rule:** Figma uses Poppins' natural line height rounded **up** to a whole pixel: `line-height = ceil(font-size × 1.5)`. Always set `line-height` explicitly in px, or layout drifts by half-pixels against Figma.

### Type scale

| Role | Size / line height | Weight | Notes / example |
|---|---|---|---|
| Screen title | 26 / 32 | 800 | `letter-spacing: -0.6px`, white. "Goa Trip" |
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

Ghoomate is designed for a **393 × 852 pt** iPhone frame. On desktop the app renders inside that frame, which is kept within one viewport height: on windows shorter than 900 px the frame gets shorter so only the screen inside scrolls, never the page. On phones (≤ 500 px wide) it fills the viewport.

### Screen anatomy

```
┌──────────────────────────────┐  ← Header background SVG (height varies per screen)
│ StatusBar (54)               │
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
| Photos & Reels | 262 (the face filter sits on the blue) |
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
The shell for every tab screen: header SVG, status bar, eyebrow and title, header actions, and a scrolling body. Pass `withBubble` when the screen shows a GhoomMate tip. Put header-row content in `.screen__header-row` and the main column in `<main className="screen__body">`.

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
| 44 / 52 | Face filter (44 inside the selected ring) | – |

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

### `HeaderActions` and `StatusBar`
Fixed header chrome: a QR invite button (frosted glass) and your profile avatar (amber with a yellow ring). The status bar is a static mock for the iOS frame.

### Utility classes: [`src/styles/ui.css`](src/styles/ui.css)

| Class | What it is |
|---|---|
| `.card` | Large white card: 14 px padding, 22 radius, card shadow, flex column |
| `.list-card` | Compact white row: 18 radius, small shadow, flex row |
| `.overline` | 11 px uppercase 800 label (recolour per context) |
| `.text-link` | 12 px sky-blue text action |
| `.tag` | Tinted uppercase category label (ADVENTURE, FOOD) |
| `.pill-button` | Small primary pill button, optionally with a 14 px icon |
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
- Sizes: **12, 14, 16, 18, 20, 22** px. Tab icons are 22, header and banner icons 20, inline icons 12–18.
- **Colour is baked into the SVG.** Each colour variant is its own file, named `icon-<name>-<colour>.svg` (e.g. `icon-arrow-sky.svg`, `icon-mic-white.svg`). Don't recolour with CSS filters. Export a new variant from Figma instead.
- Always pass `width` and `height` and `alt=""` for decorative icons. Put the accessible name on the button (`aria-label`).
- Photo placeholders are gradient-plus-mountain SVGs from Figma. Swap them for real images (same size and radius) when data is wired up.
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
