import { AXES } from '../../data/taste'
import { blendVibes, personaFor, type VibeScores } from '../../data/vibe'
import type { SquadInsights } from '../../services/prefsService'
import type { DraftBasis, DraftFairness, ItineraryStop, TripDetail } from '../../services/tripsService'

/** Cards in the core Vibe Swipe deck */
export const CORE_DECK_SIZE = 17

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** "Riya", "Riya and Kabir", "Riya, Kabir and Meera", "Riya, Kabir and 3 more" */
export function listNames(names: string[]) {
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Drops one entry for me from a list of first names, so I'm never "waiting on" myself */
export function withoutMe(names: string[], myName: string | undefined) {
  const me = myName ? firstName(myName) : ''
  const index = me ? names.indexOf(me) : -1
  return index < 0 ? names : [...names.slice(0, index), ...names.slice(index + 1)]
}

/** What the squad swipe card shows, from the squad insights or, when they fail, the trip's member list */
export type SquadView = {
  squadVibe: VibeScores | null
  myVibe: VibeScores | null
  persona: string | null
  /** Mates who've swiped the core deck */
  done: number
  total: number
  /** First names still to swipe, not counting me */
  pending: string[]
  /** I've swiped the core deck */
  coreDone: boolean
  /** I only have a vibe from the old quiz */
  legacyVibe: boolean
  city: string | null
  /** How many trip-deck cards I've answered; null when unknown */
  tripAnswered: number | null
}

export function viewFromInsights(insights: SquadInsights): SquadView {
  const me = insights.members.find((m) => m.isMe)
  const anyVibe = insights.members.some((m) => m.vibe)
  const squadVibe = anyVibe ? (Object.fromEntries(AXES.map((axis) => [axis, insights.axes[axis]?.mean ?? 0])) as VibeScores) : null
  return {
    squadVibe,
    myVibe: me?.vibe ?? null,
    persona: insights.squadPersona ?? (squadVibe ? personaFor(squadVibe) : null),
    done: insights.members.filter((m) => m.coreDone).length,
    total: insights.members.length,
    pending: withoutMe(insights.pending, me?.name),
    coreDone: !!me?.coreDone,
    legacyVibe: !me?.coreDone && !!me?.vibe,
    city: insights.city,
    tripAnswered: me?.tripAnswered ?? null,
  }
}

/** The old member-list vibes: keeps the card working when the squad insights can't load */
export function viewFromMembers(trip: TripDetail, youVibe: VibeScores | null): SquadView {
  const vibes = trip.members.map((m) => ({ member: m, vibe: m.memberId === trip.memberId ? youVibe : blendVibes([m.vibe]) }))
  const squadVibe = blendVibes(vibes.map((v) => v.vibe))
  return {
    squadVibe,
    myVibe: youVibe,
    persona: squadVibe ? personaFor(squadVibe) : null,
    done: vibes.filter((v) => v.vibe).length,
    total: trip.members.length,
    pending: vibes.filter((v) => !v.vibe && v.member.memberId !== trip.memberId).map((v) => firstName(v.member.name)),
    coreDone: !!youVibe,
    legacyVibe: false,
    city: null,
    tripAnswered: null,
  }
}

/** The trip-deck row: "Swipe the Udaipur deck" and how far I've got */
export function deckCopy(city: string | null, answered: number | null, total: number | null) {
  const done = answered !== null && total !== null && total > 0 && answered >= total
  const title = done ? `${city ?? 'Trip'} deck done` : city ? `Swipe the ${city} deck` : 'Swipe your trip’s deck'
  let meta: string
  if (done) meta = `All ${total} done · change your mind anytime`
  else if (answered && total) meta = `${answered} of ${total} done`
  else if (answered) meta = `${answered} done`
  else if (total) meta = `${total} quick swipes on things to do`
  else meta = 'Yes or nope to things to do there'
  return { title, meta }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Planned around 3 of 4 mates · everyone gets at least 2 spotlights" */
export function fairnessLine(fairness: DraftFairness | null, basis: DraftBasis | null, squadSize: number) {
  const total = basis?.total ?? squadSize
  const answered = basis?.answered ?? fairness?.members.length ?? 0
  const around =
    answered === 0
      ? 'A classic plan for now'
      : total <= 1
        ? 'Planned around your swipes'
        : answered >= total
          ? `Planned around all ${total} mates`
          : `Planned around ${answered} of ${total} mates`
  const members = fairness?.members ?? []
  if (members.length < 2) return around
  const fewest = Math.min(...members.map((m) => m.spotlights))
  if (fewest > 0) return `${around} · everyone gets at least ${plural(fewest, 'spotlight', 'spotlights')}`
  const floor = Math.round((fairness?.min ?? 0) * 100)
  return floor > 0 ? `${around} · everyone’s at least a ${floor}% match` : around
}

/** Stops in the order they run, with each split slot (same time, `split`) kept together */
export type StopGroup = { key: string; stops: ItineraryStop[] }

export function groupSplitStops(stops: ItineraryStop[]): StopGroup[] {
  const groups: StopGroup[] = []
  for (const stop of stops) {
    const last = groups.at(-1)
    const prev = last?.stops.at(-1)
    if (last && prev && stop.split && prev.split && stop.time === prev.time) last.stops.push(stop)
    else groups.push({ key: stop.id, stops: [stop] })
  }
  return groups
}

/** "For Riya · Kabir", with me as "you" */
export const forLabel = (names: string[], myName?: string) => {
  const me = myName ? firstName(myName) : ''
  return names.length ? `For ${names.map((n) => (n === me ? 'you' : n)).join(' · ')}` : null
}
