# Stories module (Kaavad Tales + Heritage Passport)

A Kaavad is a painted wooden shrine from Bassi, near Chittorgarh. Its doors fold open panel by panel while the Kavadiya Bhat, the storyteller, tells the tale. Kaavad Tales borrows that for a city's heritage sites: a squad opens a story at the place, the panels unfold, a storyteller's voice narrates in English or Hindi, and a quiz earns a stamp in everyone's **Heritage Passport**.

**Nothing is generated on request.** Every story, painting and recording is prepared ahead of time: by the city batch (outside this repo), which writes tales into MongoDB and their art and audio into the media bucket, or bundled with the app for the key Udaipur sites. The app only reads them. Stories keep working with the database or GCS unavailable, from the bundled ones.

## Pieces

| File | Role |
| --- | --- |
| `src/stories/tales.ts` | The `heritage_tales` document shape, `readTale()` (checks a document from the batch) and `signTale()` (signed links for its art and audio). |
| `src/stories/curated/*.ts` | Bundled stories for 7 key Udaipur sites (City Palace, Jagdish Temple, Lake Pichola and Jag Mandir, Saheliyon ki Bari, Bagore ki Haveli, Sajjangarh, Fateh Sagar), each in English and Hindi: 4 panels, a three-question quiz and a care note. |
| `src/stories/curated/narration.ts` | Length and panel start times of each bundled recording, and `staticNarration()`. |
| `src/stories/basic.ts` | A story for sites with nothing prepared or bundled, built from `heritage/sites.ts` (history line, quiet time, care tip). |
| `src/stories/quiz.ts` | Server-side scoring, grades, deterministic option shuffling. |
| `src/stories/service.ts`, `app.ts` | Choosing the story, the passport, and the routes. |
| `src/schema.ts` | Indexes for `heritage_tales` and `heritage_stamps`. |

## Endpoints (mounted at `/api/stories`)

| Route | Auth | What |
| --- | --- | --- |
| `GET /` | none | Every heritage site with its story: city, title, painted cover, whether narration exists. Sites with a full telling first. |
| `GET /:siteId?lang=en\|hi&audience=classic\|family\|friends\|couple\|history` | none | `{ siteId, siteName, title, lang, audience, source, panels: [{ heading, text, lookFor, art? }], quiz: [{ question, options[], answerIndex, fact }], careNote, narration }`. `lang` and `audience` are what the story actually is, which can differ from what was asked. `source` is `prepared`, `bundled` or `basic`. `narration` is `{ url, durationSec, marks[], source }` (`marks` is the second each panel starts) or `null`. |
| `POST /:siteId/stamp` `{ lang, audience, answers[], tripId?, withUserIds? }` | user | Scores on the server and stamps the passport. |
| `GET /passport` | user | `{ totalSites, stamped, stamps[], sites[] }`: your stamps and every site, stamped or not yet. |
| `GET /passport/trip/:tripId` | trip member | `{ members[], leaderboard[], bySite }`: who holds which stamp. Non-members get 404. |

### Which story you get

For `lang` and `audience`, the first of these that exists:

1. The prepared tale for that site, language and audience.
2. The prepared classic tale in that language.
3. The bundled telling in that language (key sites only).
4. The prepared classic tale in English.
5. A story built from the site's notes, in English (`source: "basic"`, no narration).

Prepared tales are looked up with a 3-second limit, so a slow or unreachable database falls through to the bundled story instead of making the reader wait. A malformed document is skipped and logged with the reason.

### Narration

The story carries its own narration: the prepared tale's audio as a signed bucket link (`source: "prepared"`), or for a bundled telling the recording shipped at `/stories/<siteId>/<lang>.m4a` (`source: "static"`). There is no recording endpoint. With no narration the app reads the panels with the phone's own voice.

The local media route (`/api/media`, used when GCS isn't configured) serves audio with its type and byte ranges, which iPhones need to play and seek.

## Prepared tales: what the city batch writes

One document per site, language and audience in `heritage_tales` (unique on `site_id`, `lang`, `audience`; indexed on `city`). Write with an upsert on those three fields. Field names are snake_case like the rest of the database.

```js
{
  city: 'Udaipur',                  // HERITAGE_CITIES in src/heritage/sites.ts
  site_id: 'city-palace',           // a site id from src/heritage/sites.ts; others are never shown
  lang: 'en',                       // 'en' | 'hi'
  audience: 'classic',              // 'classic' | 'family' | 'friends' | 'couple' | 'history'; write classic for every site
  title: 'The Palace Four Centuries in the Making',
  panels: [                         // 1 to 8; 4 reads best. Keep each text under about 70 words, written to be heard
    { heading: 'The hermit’s hill', text: '…', look_for: 'One thing to spot from where you stand', art_key: 'tales/udaipur/city-palace/1.jpg' },
  ],
  quiz: [                           // 1 to 5 questions (3 is the norm), 2 to 6 options each
    { question: '…?', options: ['…', '…', '…'], answer_index: 1, fact: 'One line that confirms the answer' },
  ],
  care_note: 'How to visit lightly', // optional; the bundled note or the site's care tip is used when empty
  narration: {                      // optional; null or missing means the phone's voice reads it
    audio_key: 'tales/udaipur/city-palace/en-classic.m4a',
    duration_sec: 98.8,
    marks: [0, 29.2, 52.5, 78.3],   // second each panel starts: one per panel, rising, the first 0
  },
  updated_at: ISODate('2026-11-14T00:00:00Z'),
}
```

- `art_key` and `audio_key` are object keys in the app's media bucket (`GCS_BUCKET`); the app signs a read link for each request. Suggested layout: `tales/<city>/<siteId>/<n>.jpg` (640 px wide, 16:10, under 80 KB) and `tales/<city>/<siteId>/<lang>-<audience>.m4a` (AAC, mono, about 24 kbps).
- A panel without `art_key` borrows the bundled painting of that panel when the site has one.
- Narration whose `marks` don't line up with the panels is ignored (the story still shows). A document that fails the checks in `readTale()` is skipped entirely.
- A prepared classic tale replaces the bundled one for that language, including its narration.

### Heritage Passport

`POST /:siteId/stamp` scores `answers` against the quiz of the story the reader took (resolved the same way as `GET /:siteId`), saves a stamp per person per site and keeps the best score. Finishing earns the stamp; the grade (gold, silver, bronze) is the seal's finish. With a `tripId` the caller is on, `withUserIds` stamps squad mates who listened along, since one phone often reads the story to the whole group; ids that aren't on the trip are ignored. The reply includes the squad's progress at that site.

If the database is unreachable the passport routes answer `503 PASSPORT_UNAVAILABLE` and the app keeps the stamp on the phone.


## Frontend

| Route | Screen |
| --- | --- |
| `#/trip/explore/story/<siteId>` | The Kaavad screen: painted doors swing open, panels unfold in 3D (a fade with reduced motion), the narration bar follows the voice panel by panel, EN / हिं toggle, audience chips, then the quiz and the stamp (one phone can stamp the whole squad). |
| `#/trip/explore/passport` | The Heritage Passport: every site as a stamp slot, and the squad's leaderboard. |

Entry points: **Hear the story** on a stop that matches a heritage site (Stop detail), a link under the selected site in Explore's Crowd pulse, and the **Stories of Mewar** carousel on Explore. Everything is in `frontend/src/pages/Stories/`, with the API in `frontend/src/services/storiesService.ts`.

When a telling has no recording, or it can't be loaded, the phone's own voice reads the panels. If the passport desk can't be reached, the stamp is kept on the phone (`localStorage`) and shows in the passport.

## Content and sources

The bundled stories stay with facts a historian would stand behind and mark the rest as tradition ("legend says", "it is said"). Where sources differ the story says so by being vague ("in the 1550s", "more than a hundred rooms").

- City Palace: [Wikipedia](https://en.wikipedia.org/wiki/City_Palace,_Udaipur) (22 generations over nearly 400 years; Mor Chowk peacocks of about 5,000 glass pieces in Sajjan Singh's time; Tripolia gate of 1725 and the gold-weighing tradition; the hermit is legend).
- Jagdish Temple: [Wikipedia](https://en.wikipedia.org/wiki/Jagdish_Temple,_Udaipur) (completed 1651 by Jagat Singh I, 32 marble steps, black stone image, brass Garuda, spire of about 79 ft).
- Lake Pichola and Jag Mandir: [Lake Pichola](https://en.wikipedia.org/wiki/Lake_Pichola) and [Jag Mandir](https://en.wikipedia.org/wiki/Jag_Mandir) (the Banjara origin is tradition; Prince Khurram's refuge in 1623; shelter for European families in 1857; Lake Palace finished in 1746; the Taj Mahal link is legend).
- Saheliyon ki Bari: [Wikipedia](https://en.wikipedia.org/wiki/Saheliyon-ki-Bari) (Sangram Singh II, 1710 to 1734; the 48 companions are legend). The Sawan-Bhadon fountain, the four marble elephants of the lotus pool and the "no pumps" fountains are from visitor guides, told as what locals say.
- Bagore ki Haveli: [Wikipedia](https://en.wikipedia.org/wiki/Bagore_Ki_Haveli) (built about 1751 to 1778 for Amar Chand Badwa; restored by the West Zone Cultural Centre from 1986) and visitor guides for the Dharohar evening show.
- Sajjangarh: [Wikipedia](https://en.wikipedia.org/wiki/Monsoon_Palace) (Sajjan Singh, the monsoon clouds, 944 m, Octopussy in 1983, the wildlife sanctuary of 1987; the Chittorgarh wish is legend).
- Fateh Sagar: [Wikipedia](https://en.wikipedia.org/wiki/Fateh_Sagar_Lake) and [Udaipur Solar Observatory](https://en.wikipedia.org/wiki/Udaipur_Solar_Observatory) (built in the late 1600s, the dam rebuilt in 1889, an observatory on an island since 1976); Moti Magri and Neemach Mata come from `heritage/sites.ts`.
- The Kaavad itself: a hinged painted shrine of Bassi, Chittorgarh, opened panel by panel by the Kavadiya Bhat ([Nina Sabnani's research on the Kaavad](https://www.taylorfrancis.com/chapters/edit/10.4324/9781003150367-22/enchanted-kaavad-nina-sabnani) and the [Queensland Art Gallery's Kaavad makers](https://collection.qagoma.qld.gov.au/page/kaavad-makers)).

The bundled panel art is painted in the style of the Mewar school of miniature painting and is illustrative, not documentary.

## Bundled assets

Committed under `frontend/public/stories/` (about 4 MB): 28 JPEGs (640 px wide, under 70 KB each) and 8 m4a recordings at 24 kbps (English for all seven sites, Hindi for Bagore ki Haveli). They are the fallback until the batch has prepared those sites.

## Env

None of its own. `MONGODB_CONNECTION_STRING` for prepared tales and the passport; `GCS_*` for the bucket holding prepared art and audio (local disk otherwise).
