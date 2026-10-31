import { useState } from 'react'
import type { PersonId } from '../../data/people'
import {
  BAG_ITEMS,
  GROUP_TODOS,
  INITIAL_DEPOSITS,
  INITIAL_TICKETS,
  PLAN,
  TRANSPORT,
  TRIP,
  VOTE_IDS,
  VOTES,
  type Booking,
  type ChecklistItem,
  type Vote,
  type VoteId,
  type VoteOption,
} from './planData'

export type ChecklistId = 'group' | 'bag'

export type TalliedOption = VoteOption & { voters: PersonId[] }

/** Everyone’s votes including yours, the leader (null on a tie) and whether the whole squad has voted. */
export function voteResult(vote: Vote, choice: string | undefined) {
  const options: TalliedOption[] = vote.options.map((o) => ({
    ...o,
    voters: choice === o.id ? [...o.votes, 'you'] : o.votes,
  }))
  const total = options.reduce((n, o) => n + o.voters.length, 0)
  const top = Math.max(...options.map((o) => o.voters.length))
  const leaders = options.filter((o) => o.voters.length === top)
  return {
    options,
    total,
    leader: leaders.length === 1 ? leaders[0] : null,
    complete: total >= TRIP.members.length,
  }
}

/** Planning state shared by every `plan/*` screen, so it survives moving between them. */
export function usePlanState() {
  const [votes, setVotes] = useState<Partial<Record<VoteId, string>>>({})
  const [deposits, setDeposits] = useState(INITIAL_DEPOSITS)
  const [reminded, setReminded] = useState<PersonId[]>([])
  const [checklists, setChecklists] = useState<Record<ChecklistId, ChecklistItem[]>>({
    group: GROUP_TODOS,
    bag: BAG_ITEMS,
  })
  const [settled, setSettled] = useState<Record<string, PersonId[]>>(() =>
    Object.fromEntries(TRANSPORT.map((b) => [b.id, b.settled ?? []])),
  )
  const [tickets, setTickets] = useState(INITIAL_TICKETS)
  const [extraBookings, setExtraBookings] = useState<Booking[]>([])

  const openVotes = VOTE_IDS.filter((id) => !votes[id])
  const depositPaid = !!deposits.you
  const paidCount = TRIP.members.filter((p) => deposits[p]).length

  return {
    votes,
    openVotes,
    castVote: (id: VoteId, option: string) => setVotes((v) => ({ ...v, [id]: option })),
    result: (id: VoteId) => voteResult(VOTES[id], votes[id]),

    deposits,
    depositPaid,
    paidCount,
    pool: paidCount * PLAN.depositPerPerson,
    poolTarget: TRIP.members.length * PLAN.depositPerPerson,
    payDeposit: () => setDeposits((d) => ({ ...d, you: 'Today' })),
    reminded,
    // TODO: send a push reminder through the notifications service
    remind: (person: PersonId) => setReminded((r) => (r.includes(person) ? r : [...r, person])),

    checklists,
    toggleItem: (list: ChecklistId, id: string) =>
      setChecklists((c) => ({ ...c, [list]: c[list].map((i) => (i.id === id ? { ...i, done: !i.done } : i)) })),
    addItem: (list: ChecklistId, label: string) =>
      setChecklists((c) => ({
        ...c,
        [list]: [
          ...c[list],
          { id: `${list}-${Date.now()}`, label, done: false, assignee: list === 'group' ? 'you' : undefined },
        ],
      })),

    settled,
    // TODO: pay the booker back over UPI
    payShare: (bookingId: string) =>
      setSettled((s) => ({ ...s, [bookingId]: [...(s[bookingId] ?? []), 'you'] })),
    tickets,
    addTicket: (bookingId: string, fileName: string) => setTickets((t) => ({ ...t, [bookingId]: fileName })),
    bookings: [...TRANSPORT, ...extraBookings],
    addBooking: (booking: Booking) => setExtraBookings((b) => [...b, booking]),
  }
}

export type PlanState = ReturnType<typeof usePlanState>
