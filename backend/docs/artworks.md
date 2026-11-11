# Artworks module (Squad Miniature)

Mewar miniature painting is a living craft: painters around Udaipur's City Palace keep a court tradition going while printed copies undercut them. Squad Miniature turns a squad photo into a painting in one of four Udaipur-linked traditions, and every result ends with "Want the real thing?", a link to miniature painters near City Palace (`#/trip/explore/makers?craft=miniature-painting`). The AI is a funnel to artisan income, not a replacement for it.

## Endpoints

Mounted at `/api/artworks`, signed-in trip members only (non-members get 404, like the rest of the trip API).

| Route | Does |
| --- | --- |
| `POST /api/artworks/trips/:tripId` `{ photoId, style }` | Paints one of the trip's photos. Returns 201 `{ id, style, styleName, url, createdAt, photoId, createdBy, limit }`. Takes 10 to 20 seconds. |
| `GET /api/artworks/trips/:tripId` | The squad gallery, newest first, with fresh read URLs: `{ items, limit: { perDay, used, remaining } }`. |

`style` is one of `mewar-miniature`, `royal-procession`, `jharokha-portrait`, `phad-scroll`.

### Error codes

The app falls back to the original photo in a CSS/canvas miniature frame (with the style name) for every painting failure, so the flow never dead-ends.

| Status | Code | When |
| --- | --- | --- |
| 503 | `ARTWORK_UNAVAILABLE` | Image generation is not configured, credentials or permissions are wrong, or the shared Vertex quota is full (after two quick retries) |
| 502 | `ARTWORK_FAILED` | Gemini failed, answered in words only twice, or returned something that is not a picture |
| 504 | `ARTWORK_TIMEOUT` | No painting within 90 seconds |
| 422 | `ARTWORK_BLOCKED` | Gemini's safety filter refused the photo |
| 429 | `ARTWORK_LIMIT` | The trip has painted 10 in the last 24 hours |
| 404 | `PHOTO_NOT_FOUND` | The photo is not in this trip, or its file is gone |
| 415 / 413 | `UNSUPPORTED_PHOTO` / `PHOTO_TOO_LARGE` | Not a JPEG, PNG, WebP or HEIC (judged from the file's bytes), or over 8 MB |
| 400 | `VALIDATION_ERROR` | Unknown style or malformed photo id |

Failures store nothing and do not count towards the daily limit.

## Flow

1. Check the style, the photo (must belong to the trip) and the daily limit. Concurrent requests are counted too, so a burst cannot slip past the cap.
2. Read the photo's bytes with `storage.read()` (added to `MediaStorage` for GCS and local disk) and sniff the type.
3. **Cast list** (`cast.ts`): one short `gemini.json()` look at the photo returns how many people are in it and what each plainly looks like (age group, hair, beard, glasses, head covering; no clothing, names or ethnicity). It is remembered per photo, so painting the same photo in a second style skips it. It is optional: if it fails, the prompt falls back to a general "same people, same number" rule.
4. **Painting** (`styles.ts`): `gemini.image()` with the photo as the reference, a style prompt and a 4:3 aspect ratio, under one 90 second deadline. `429` and "words only" answers are retried (3 s then 6 s for quota, straight away for words only).
   **Head count check:** for the two styles where the squad are the only large figures (Mewar miniature, Jharokha portrait) and photos of three or more people, the finished painting is counted by a second short `gemini.json()` look. If the count is off, it is painted once more and the closer one is kept. The painter sometimes loses a friend, and "where's Riya?" is the worst thing a squad keepsake can say.
5. Store the PNG at `trips/<tripId>/artworks/<id>.png` with `storage.put()` (the face pipeline only watches `trips/<id>/photos/`, so paintings are never indexed), insert a `trip_artworks` document (indexes in `src/schema.ts`), return the artwork.

Model: `GEMINI_IMAGE_MODEL`, by default `gemini-2.5-flash-image` on Vertex AI. One painting takes about 10 seconds; with the cast list and the head count check a first run takes about 17 seconds (measured end to end), and about 14 for the next style on the same photo. The photo is sent to Vertex AI only for this request; nothing but the painting is kept.

## The prompts

Every prompt has the same parts: **people** (count, the cast list, "faithful, instantly recognisable portrait", bald stays bald, never lighten skin), **clothes** (modest, festive Rajasthani court clothes; the model otherwise copies the holiday clothes from the photo), the **scene**, the **painting** technique and border, and **strict rules**: no text of any kind, no gods, idols or religious figures, no weapons, joyful and respectful. They are short on purpose: the image model follows a few clear instructions far better than a long list.

| Style | What it paints |
| --- | --- |
| Mewar miniature | A lakeside darbar on Lake Pichola with Jag Mandir and the City Palace behind, flat stacked space, mineral colours, ornate border |
| Royal procession | The squad as guests of honour before the City Palace while a sawari passes: elephant, parasols, drummers, marigold petals |
| Jharokha portrait | The squad framed together in a carved City Palace window of scalloped arches, Lake Pichola beyond |
| Phad scroll | A cloth scroll with the squad in a large central panel and their trip told in small scenes around it |

Phad scrolls traditionally depict local folk deities (Pabuji, Devnarayan). Our version borrows only the format (panels, bold outlines, flat colour, a story told around the figures) and tells the squad's trip instead, with no deities.

The scenes are tuned against a synthetic sample squad (generated, not a real photograph; no real photo is committed). Sample thumbnails in `frontend/public/miniature/` were generated once with the same prompts.

## Tuning notes

- Without a cast list the image model drifts on head count (7 people became 8 or 9). With it the count is right most of the time, and the check above redoes the rest. The person half hidden behind someone else in the photo is the one most often lost.
- Describing clothing in the cast list makes the model keep the holiday clothes, so the cast list leaves clothing out and the prompt has a separate section for costume.
- Strong style instructions cost likeness, and the other way round. Phad and Mewar keep faces best; the procession is the hardest because figures shrink.
- The shared Vertex quota answers 429 when several people generate at once. The service retries twice, then reports `ARTWORK_UNAVAILABLE` and the app shows the framed photo.

## Config

| Variable | Default | Meaning |
| --- | --- | --- |
| `VERTEX_PROJECT`, `VERTEX_LOCATION` | none | Vertex AI for image generation (see `.env.example`) |
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` | Image model |
| `ARTWORKS_PER_TRIP_PER_DAY` | `10` | Paintings per trip in any rolling 24 hours |

## Tests

`tests/artworks/artworks.test.ts`: prompts, image sniffing, cast parsing, `storage.read`, and the routes with a fake database, fake storage and fake Gemini: the happy path, limits and concurrency, every fallback code, the cast-list failure path and the gallery.

## Sources for the copy

The one-line explanations and the "Did you know" facts in `frontend/src/pages/Miniature/miniatureData.ts` come from:

- Mewar court painting, the Chawand Ragamala (1605), Sahibdin active at Udaipur around 1628 to 1655, flat space and bright colour: [Wikipedia, Rajput painting](https://en.wikipedia.org/wiki/Mewar_painting) and the [Metropolitan Museum](https://www.metmuseum.org/art/collection/search/76211).
- Processions, festivals, hunts and court scenes as Mewar subjects: [Sarmaya](https://sarmaya.in/objects/surprise-me/maharaja-bhim-singh-r-1778-1828-in-procession-on-horseback-accompanied-by-attendants-on-foot-udaipur-early-19th-century/) and [The Print](https://theprint.in/pageturner/excerpt/how-mewars-miniature-painting-tradition-challenged-mughal-dominance).
- Mewar paintings kept at the City Palace Museum, Udaipur: [Deccan Chronicle](https://www.deccanchronicle.com/131128/lifestyle-booksart/article/emotions-miniatures).
- Mineral pigments (lapis lazuli, cinnabar, orpiment, malachite), squirrel-hair brushes and gold leaf: [Rupasya](https://rupasya.com/blog/rajasthani-miniature-paintings-art-history/) and [Harvard](https://face.meei.harvard.edu/painting-of-rajasthan). Both are seller or collection pages, so the copy sticks to the claims several sources agree on (brush hair varies by source, so it only says "traditionally squirrel hair").
- Phad: a scroll painting on cloth from Shahpura and Bhilwara, kept by the Joshi family, unrolled by bhopa singers by lamplight, depicting Pabuji and Devnarayan: [Wikipedia, Phad painting](https://en.wikipedia.org/wiki/Phad_painting) and [Artisera](https://www.artisera.com/blogs/expressions/phad-paintings-of-rajasthan).
- A jharokha is a projecting carved window balcony, common in Rajput palaces such as Udaipur's City Palace.
