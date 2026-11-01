# Stories module (Kaavad Tales + Heritage Passport)

A Kaavad is a painted wooden shrine from Bassi, near Chittorgarh. Its doors fold open panel by panel while the Kavadiya Bhat, the storyteller, tells the tale. Kaavad Tales borrows that for Udaipur's heritage sites: a squad opens a story at the place, the panels unfold, a storyteller's voice narrates in English or Hindi, and a three-question quiz earns a stamp in everyone's **Heritage Passport**.

Everything works with Gemini, the database or GCS unavailable: the key sites have hand-written stories, painted panels and recorded narration shipped with the app.

## Pieces

| File | Role |
| --- | --- |
| `src/stories/curated/*.ts` | Hand-written stories for 7 key sites (City Palace, Jagdish Temple, Lake Pichola and Jag Mandir, Saheliyon ki Bari, Bagore ki Haveli, Sajjangarh, Fateh Sagar), each in English and Hindi: 4 panels, a three-question quiz and a care note. |
| `src/stories/curated/narration.ts` | Written by `scripts/stories/narration.ts`: length, panel start times and a hash for each shipped recording. |
| `src/stories/generate.ts` | The Gemini retelling for an audience: strict system prompt, JSON schema, and checks on the answer (shape, length, language, no year that the facts lack). |
| `src/stories/basic.ts` | A story for the 12 sites with no hand-written telling, built from `heritage/sites.ts` (history line, quiet time, care tip). |
| `src/stories/audience.ts` | The audiences and the squad vibe bucket. |
| `src/stories/speech.ts`, `wav.ts`, `narration.ts` | What the narrator says (years and numerals spelled out), joining per-panel recordings into one track with panel start times, and recording through Gemini speech. |
| `src/stories/quiz.ts` | Server-side scoring, grades, deterministic option shuffling. |
| `src/stories/service.ts`, `app.ts` | Orchestration and the routes. |
| `migrations/021_stories.sql` | `story_cache`, `story_narrations`, `heritage_stamps`. |
| `scripts/stories/art.ts`, `narration.ts` | One-off generators for the committed art and narration. |

## Endpoints (mounted at `/api/stories`)

| Route | Auth | What |
| --- | --- | --- |
| `GET /` | none | Every heritage site with its story: title, painted cover, whether narration is shipped. Hand-written first. |
| `GET /:siteId?lang=en\|hi&audience=classic\|family\|friends\|couple\|history&tripId=` | optional | `{ siteId, siteName, title, lang, audience, panels: [{ heading, text, lookFor, art? }], quiz: [{ question, options[3], answerIndex, fact }], careNote, generated, vibe, narration }`. `lang` and `audience` are what the story actually is, which can differ from what was asked (see below). |
| `POST /:siteId/narration` `{ lang, audience, tripId? }` | user | `{ url, durationSec, marks[], source, cached }`: a playable URL and the second each panel starts. Pass the story's own `lang` and `audience`. |
| `POST /:siteId/stamp` `{ lang, audience, answers[], tripId?, withUserIds? }` | user | Scores on the server and stamps the passport. |
| `GET /passport` | user | `{ totalSites, stamped, stamps[], sites[] }`: your stamps and every site, stamped or not yet. |
| `GET /passport/trip/:tripId` | trip member | `{ members[], leaderboard[], bySite }`: who holds which stamp. Non-members get 404. |

### Which story you get

- **Classic** (the default) is the hand-written telling for a key site: instant, no AI, no database.
- Another audience is retold by Gemini (the smart model) and cached in `story_cache` by site, language, audience and **vibe bucket**. With a `tripId` and a signed-in member, the bucket is the two strongest tastes in the squad's quiz scores (`culture+food`), averaged over every member; otherwise it is empty. The next open is instant, for the whole squad.
- If Gemini is off, over quota, slower than 18 s or its answer fails the checks, the reader gets the classic telling (`generated: false`, `audience: "classic"`). A slow retelling carries on in the background and is cached for the next open. After a failure Gemini is skipped for 45 s.
- When the API key is out of quota the retelling is tried once on Vertex AI.
- A site without a hand-written story is retold when Gemini is on, and otherwise opens with the `basic.ts` story (English even if Hindi was asked; `lang` says so).
- Retellings reuse the painted art of the site.

### Narration

`POST /:siteId/narration` resolves the same story the reader sees (without asking Gemini for a new one), then:

1. A classic telling with a matching shipped recording returns `/stories/<siteId>/<lang>.m4a` (source `static`). The hash in `curated/narration.ts` must match the current words and voice, so an edited story stops using a stale recording.
2. Otherwise `story_narrations` is checked (keyed by site, language, audience, vibe and a hash of the spoken text) and the stored recording's signed URL is returned.
3. Otherwise every panel is recorded with Gemini speech in parallel (voice **Algenib**, steered by "director's notes" in the prompt; a plain "narrate like a storyteller" instruction is read out loud by the model, so the notes use the `TRANSCRIPT` layout), joined with a pause between panels (so the start of each panel is exact), stored with `MediaStorage.put()` as WAV and returned through `readUrl()`. Simultaneous requests share one recording.

Speech goes through **Vertex AI** when `VERTEX_PROJECT` is set. The Gemini API key's free tier allows only **10 speech requests a day** per model, and a story takes one request per panel. Without Vertex a story still works, but only about two new narrations a day.

The local media route (`/api/media`, used when GCS isn't configured) serves audio with its type and byte ranges, which iPhones need to play and seek.

### Heritage Passport

`POST /:siteId/stamp` scores `answers` against the quiz of the story the reader took (the cached retelling or the classic one), saves a stamp per person per site and keeps the best score. Finishing earns the stamp; the grade (gold, silver, bronze) is the seal's finish. With a `tripId` the caller is on, `withUserIds` stamps squad mates who listened along, since one phone often reads the story to the whole group; ids that aren't on the trip are ignored. The reply includes the squad's progress at that site.

If the database is unreachable the passport routes answer `503 PASSPORT_UNAVAILABLE` and the app keeps the stamp on the phone.

## Content and sources

The hand-written stories stay with facts a historian would stand behind and mark the rest as tradition ("legend says", "it is said"). Where sources differ the story says so by being vague ("in the 1550s", "more than a hundred rooms").

- City Palace: [Wikipedia](https://en.wikipedia.org/wiki/City_Palace,_Udaipur) (22 generations over nearly 400 years; Mor Chowk peacocks of about 5,000 glass pieces in Sajjan Singh's time; Tripolia gate of 1725 and the gold-weighing tradition; the hermit is legend).
- Jagdish Temple: [Wikipedia](https://en.wikipedia.org/wiki/Jagdish_Temple,_Udaipur) (completed 1651 by Jagat Singh I, 32 marble steps, black stone image, brass Garuda, spire of about 79 ft).
- Lake Pichola and Jag Mandir: [Lake Pichola](https://en.wikipedia.org/wiki/Lake_Pichola) and [Jag Mandir](https://en.wikipedia.org/wiki/Jag_Mandir) (the Banjara origin is tradition; Prince Khurram's refuge in 1623; shelter for European families in 1857; Lake Palace finished in 1746; the Taj Mahal link is legend).
- Saheliyon ki Bari: [Wikipedia](https://en.wikipedia.org/wiki/Saheliyon-ki-Bari) (Sangram Singh II, 1710 to 1734; the 48 companions are legend). The Sawan-Bhadon fountain, the four marble elephants of the lotus pool and the "no pumps" fountains are from visitor guides, told as what locals say.
- Bagore ki Haveli: [Wikipedia](https://en.wikipedia.org/wiki/Bagore_Ki_Haveli) (built about 1751 to 1778 for Amar Chand Badwa; restored by the West Zone Cultural Centre from 1986) and visitor guides for the Dharohar evening show.
- Sajjangarh: [Wikipedia](https://en.wikipedia.org/wiki/Monsoon_Palace) (Sajjan Singh, the monsoon clouds, 944 m, Octopussy in 1983, the wildlife sanctuary of 1987; the Chittorgarh wish is legend).
- Fateh Sagar: [Wikipedia](https://en.wikipedia.org/wiki/Fateh_Sagar_Lake) and [Udaipur Solar Observatory](https://en.wikipedia.org/wiki/Udaipur_Solar_Observatory) (built in the late 1600s, the dam rebuilt in 1889, an observatory on an island since 1976); Moti Magri and Neemach Mata come from `heritage/sites.ts`.
- The Kaavad itself: a hinged painted shrine of Bassi, Chittorgarh, opened panel by panel by the Kavadiya Bhat ([Nina Sabnani's research on the Kaavad](https://www.taylorfrancis.com/chapters/edit/10.4324/9781003150367-22/enchanted-kaavad-nina-sabnani) and the [Queensland Art Gallery's Kaavad makers](https://collection.qagoma.qld.gov.au/page/kaavad-makers)).

The panel art is generated in the style of the Mewar school of miniature painting and is illustrative, not documentary.

## Assets

Committed under `frontend/public/stories/` (about 4 MB: 1.6 MB of art, 2.4 MB of audio): 28 JPEGs (640 px wide, under 70 KB each) and 8 m4a recordings at 24 kbps (English for all seven sites, Hindi for Bagore ki Haveli, the demo story).

```bash
cd backend
# paint missing panels into $ART_DIR as PNG, then crop and compress them into frontend/public/stories
ART_DIR=/tmp/story-art node scripts/stories/art.ts generate [siteId[:panel] ...]
ART_DIR=/tmp/story-art node scripts/stories/art.ts convert
# record the narration and update src/stories/curated/narration.ts (needs macOS afconvert)
node scripts/stories/narration.ts [--force] [siteId[:lang] ...]
```

Both use Vertex AI through `gcloud auth application-default login`; set `ENV_FILE` if `backend/.env` is elsewhere. Image quota on Vertex is shared and bursty, so the art script retries patiently.

## Env

No new variables. `GEMINI_API_KEY` retells stories; `VERTEX_PROJECT` (already used for images) records narration and gives retellings a second chance; `GCS_*` stores recordings (local disk otherwise).
