import type { CataloguePhoto } from '../../components/swipe/QuizStack'
import { registerPeople } from '../../data/people'
import {
  confidenceOf,
  overallConfidence,
  personaFor,
  scoreAnswers,
  styleConfidenceOf,
  styleOf,
  tasteFromVibe,
  topTags,
  vibeOf,
  type Card,
  type Fan,
  type Taste,
} from '../../data/taste'
import { fetchCurrentUser, getStoredUser } from '../../services/authService'
import { prefsApi, type CoreDeck, type SquadInsights, type TasteSummary, type TripDeck } from '../../services/prefsService'
import { CORE_SCOPE, clearSwipeDraft, loadVibe, mergeServerAnswers, readSwipeDraft, tripScope } from '../../services/vibeStorage'
import { EXPERIENCES } from '../Explore/experiencesData'
import { firstName } from './quizData'

// Loading and shaping the Vibe Swipe decks for the quiz screens. Kept out of the components so the screens stay
// about layout, and so a fetch started on one screen can finish after you've moved on.

export const cardsById = (cards: Card[]): Record<string, Card> => Object.fromEntries(cards.map((c) => [c.id, c]))

/** Everything the persona and the live preview show, from a taste scored on this device */
export function summaryOf(taste: Taste): TasteSummary {
  return {
    vibe: vibeOf(taste),
    confidence: confidenceOf(taste),
    overall: overallConfidence(taste),
    style: styleOf(taste),
    styleConfidence: styleConfidenceOf(taste),
    topTags: topTags(taste),
    dealbreakers: taste.dealbreakers,
    diet: taste.diet,
    persona: personaFor(taste),
    answered: taste.answered,
  }
}

// ---- Core deck ----

const CORE_DECK_KEY = 'ghoommates:deck:core'
let coreDeck: Promise<CoreDeck> | null = null

/** The public core deck, fetched once per visit; the last copy on this device stands in when offline */
export function loadCoreDeck(): Promise<CoreDeck> {
  coreDeck ??= prefsApi.coreDeck().then(
    (deck) => {
      try {
        localStorage.setItem(CORE_DECK_KEY, JSON.stringify(deck))
      } catch {
        // Blocked storage: fetched again next time
      }
      return deck
    },
    (error) => {
      coreDeck = null
      try {
        const saved = JSON.parse(localStorage.getItem(CORE_DECK_KEY) ?? 'null') as CoreDeck | null
        if (saved && Array.isArray(saved.cards) && saved.cards.length) return saved
      } catch {
        // Nothing usable saved
      }
      throw error
    },
  )
  return coreDeck
}

/** The core deck, with your earlier answers from the server when this device has none (signed in) */
export async function loadCorePlay(): Promise<CoreDeck> {
  const fromServer = getStoredUser() && !readSwipeDraft(CORE_SCOPE)?.answers.length
  const [deck, answers] = await Promise.all([
    loadCoreDeck(),
    fromServer ? prefsApi.me().then((me) => me.answers.core, () => []) : Promise.resolve([]),
  ])
  if (answers.length) mergeServerAnswers(CORE_SCOPE, answers)
  return deck
}

/** Starts the core deck again: your saved answers go (signed in), then the draft on this device */
export async function restartCore() {
  if (getStoredUser()) {
    await prefsApi.resetCore()
    // The cached profile still carries the old taste and persona
    void fetchCurrentUser()
  }
  clearSwipeDraft(CORE_SCOPE)
}

export type PersonaData = { summary: TasteSummary; legacy: boolean }

/** Your result: scored from the swipes on this device, else your profile's (signed in), else an old quiz result */
export async function loadPersona(): Promise<PersonaData | null> {
  const draft = readSwipeDraft(CORE_SCOPE)
  const signedIn = !!getStoredUser()
  if (draft?.answers.length) {
    try {
      const deck = await loadCoreDeck()
      return { summary: summaryOf(scoreAnswers(cardsById(deck.cards), draft.answers)), legacy: false }
    } catch (error) {
      if (!signedIn) throw error
    }
  }
  if (signedIn) {
    const { summary } = await prefsApi.me()
    if (summary && summary.answered > 0) return { summary, legacy: false }
  }
  const vibe = loadVibe()
  return vibe ? { summary: summaryOf(tasteFromVibe(vibe)), legacy: true } : null
}

// ---- Trip decks ----

// Explore's catalogue photo for each guide experience; card art and trip cards use the same ids
const PHOTOS = new Map(EXPERIENCES.map((e) => [e.id, e.photos[0]]))

export const photoFor = (experienceId: string): CataloguePhoto | undefined => PHOTOS.get(experienceId.replace(/^exp:/, ''))

// Avatars for the mates on a card: keyed by name (fans carry no id), coloured like the trip's members
const FAN_COLOURS = ['var(--color-person-riya)', 'var(--color-person-kabir)', 'var(--color-person-meera)', 'var(--color-person-dev)']

export const fanPersonId = (fan: Pick<Fan, 'name'>) => `fan:${fan.name}`

function registerFans(cards: Card[]) {
  const seen = new Map<string, Fan>()
  cards.forEach((card) => card.fans?.forEach((fan) => seen.set(fan.name, fan)))
  registerPeople(
    [...seen.values()].map((fan, i) => ({
      memberId: fanPersonId(fan),
      name: firstName(fan.name),
      colour: fan.colour ?? FAN_COLOURS[i % FAN_COLOURS.length],
    })),
  )
}

/** A trip's deck, with the answers the server already has merged into this device's draft */
export async function loadTripPlay(tripId: string): Promise<TripDeck> {
  const deck = await prefsApi.tripDeck(tripId)
  registerFans(deck.cards)
  mergeServerAnswers(tripScope(tripId), deck.answered)
  return deck
}

export const squadPersonId = (userId: string) => `squad:${userId}`

export type SquadData = { insights: SquadInsights; deck: TripDeck | null }

/** Squad DNA, plus the trip deck (to know whether you have cards left) when it loads */
export async function loadSquad(tripId: string): Promise<SquadData> {
  const [insights, deck] = await Promise.all([prefsApi.squad(tripId), loadTripPlay(tripId).catch(() => null)])
  const me = insights.members.find((m) => m.isMe)
  registerPeople(
    insights.members.map((m) => ({ memberId: squadPersonId(m.userId), name: m.name, picture: m.picture, colour: m.colour })),
    me && squadPersonId(me.userId),
  )
  return { insights, deck }
}
