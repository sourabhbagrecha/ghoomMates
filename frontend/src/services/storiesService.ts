import { request } from './tripsService'

/* Types mirror backend/src/stories. Kaavad Tales: heritage stories told panel by panel, narrated, with a quiz and a stamp. */

export type StoryLang = 'en' | 'hi'
export type StoryAudience = 'classic' | 'family' | 'friends' | 'couple' | 'history'

export type StoryPanel = {
  heading: string
  /** At most 70 words, written to be heard */
  text: string
  /** One thing to spot while standing right there */
  lookFor: string
  /** Painted panel art (a bucket link or a bundled path); sites without a painted story have none */
  art?: string
}

export type QuizQuestion = { question: string; options: string[]; answerIndex: number; fact: string }

/** Narration recorded ahead of time for the story as shown: where to play it and the second each panel starts */
export type Narration = { url: string; durationSec: number; marks: number[]; source: 'static' | 'prepared' }

export type Story = {
  siteId: string
  siteName: string
  title: string
  /** The language the story is actually in (a site without a Hindi telling opens in English) */
  lang: StoryLang
  /** The audience it is actually told for: the classic telling when nothing is prepared for the one asked */
  audience: StoryAudience
  panels: StoryPanel[]
  quiz: QuizQuestion[]
  careNote: string
  /** A prepared tale, the telling bundled with the app, or a short one built from the site's notes */
  source: 'prepared' | 'bundled' | 'basic'
  /** The recording for this exact telling, when one was prepared */
  narration: Narration | null
}

export type Grade = 'gold' | 'silver' | 'bronze'

export type Stamp = { siteId: string; score: number; total: number; grade: Grade; stampedAt: string }

export type CatalogueItem = {
  siteId: string
  city?: string
  name: string
  kind: string
  gem: boolean
  /** Has a full telling (prepared or bundled), usually with painted panels */
  curated: boolean
  title: string
  titleHi: string | null
  art: string | null
  panels: number
  narrated: { en: boolean; hi: boolean }
}

export type Passport = {
  totalSites: number
  stamped: number
  stamps: Stamp[]
  sites: (CatalogueItem & { stamp: Stamp | null })[]
}

export type SquadMember = { memberId: string; userId: string; name: string; picture: string | null }

export type TripPassport = {
  tripId: string
  totalSites: number
  squadSize: number
  members: (SquadMember & { stamps: Stamp[]; stamped: number; points: number })[]
  leaderboard: { rank: number; memberId: string; userId: string; name: string; stamped: number; points: number }[]
  /** Site id → member ids holding its stamp */
  bySite: Record<string, string[]>
}

export type StampResult = {
  siteId: string
  siteName: string
  score: number
  total: number
  grade: Grade
  results: { correct: boolean; answerIndex: number }[]
  /** Your best round here, which can be higher than this one */
  best: { score: number; total: number; grade: Grade }
  firstTime: boolean
  /** Squad mates stamped along with you */
  stampedWith: number
  passport: { stamped: number; totalSites: number }
  squad?: { total: number; stamped: number; members: (SquadMember & { stamped: boolean })[] }
  /** Set when the passport desk was closed and the stamp is kept on this phone */
  savedOnPhone?: boolean
}

const site = (id: string) => `/api/stories/${encodeURIComponent(id)}`

export const storiesApi = {
  catalogue: () => request<{ items: CatalogueItem[] }>('/api/stories').then((r) => r.items),
  story: (siteId: string, options: { lang: StoryLang; audience: StoryAudience }) =>
    request<Story>(`${site(siteId)}?${new URLSearchParams({ lang: options.lang, audience: options.audience })}`),
  stamp: (siteId: string, body: { lang: StoryLang; audience: StoryAudience; answers: (number | null)[]; tripId?: string | null; withUserIds?: string[] }) =>
    request<StampResult>(`${site(siteId)}/stamp`, { body }),
  passport: () => request<Passport>('/api/stories/passport'),
  tripPassport: (tripId: string) => request<TripPassport>(`/api/stories/passport/trip/${encodeURIComponent(tripId)}`),
}

/* The same quiz scoring as the backend, for a stamp kept on the phone while the passport desk is closed */

export const gradeFor = (score: number, total: number): Grade => (score >= total ? 'gold' : score * 2 >= total ? 'silver' : 'bronze')

export function scoreLocally(quiz: QuizQuestion[], answers: (number | null)[]) {
  const results = quiz.map((q, i) => ({ correct: answers[i] === q.answerIndex, answerIndex: q.answerIndex }))
  const score = results.filter((r) => r.correct).length
  return { score, total: quiz.length, results, grade: gradeFor(score, quiz.length) }
}
