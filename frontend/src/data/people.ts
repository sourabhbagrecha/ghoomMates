/** The sample squad ids below, or a trip member id from the backend */
export type PersonId = string

export type Person = {
  id: PersonId
  name: string
  initial: string
  color: string
  /** Profile photo (selfie) URL, when the member has one */
  picture?: string | null
}

// Sample squad used by the demo screens (plan, past trips, explore). Real trip members are added
// with registerPeople and looked up the same way.
export const PEOPLE: Record<PersonId, Person> = {
  you: { id: 'you', name: 'You', initial: 'A', color: 'var(--color-person-you)' },
  riya: { id: 'riya', name: 'Riya', initial: 'R', color: 'var(--color-person-riya)' },
  kabir: { id: 'kabir', name: 'Kabir', initial: 'K', color: 'var(--color-person-kabir)' },
  meera: { id: 'meera', name: 'Meera', initial: 'M', color: 'var(--color-person-meera)' },
  dev: { id: 'dev', name: 'Dev', initial: 'D', color: 'var(--color-person-dev)' },
}

export const SQUAD: PersonId[] = ['you', 'riya', 'kabir', 'meera', 'dev']

const PALETTE = [
  'var(--color-person-riya)',
  'var(--color-person-kabir)',
  'var(--color-person-meera)',
  'var(--color-person-dev)',
  'var(--color-person-you)',
]

/** Unknown ids still render (grey initial) instead of crashing a screen */
export const personOf = (id: PersonId): Person =>
  PEOPLE[id] ?? { id, name: 'Mate', initial: '?', color: 'var(--color-subtle)' }

/** Makes trip members available to Avatar, PersonToggle and friends. `meId` is shown as “You”. */
export function registerPeople(
  members: { memberId: string; name: string; picture?: string | null; colour?: string | null }[],
  meId?: string,
) {
  members.forEach((m, i) => {
    const first = m.name.trim().split(/\s+/)[0] || 'Mate'
    PEOPLE[m.memberId] = {
      id: m.memberId,
      name: m.memberId === meId ? 'You' : first,
      initial: first[0]?.toUpperCase() ?? '?',
      color: m.colour || PALETTE[i % PALETTE.length],
      picture: m.picture,
    }
  })
}

/** Shows the signed-in user's initial and selfie wherever the sample screens show “you” */
export function setYou(user: { name: string; picture?: string | null } | null) {
  const initial = user?.name.trim()[0]?.toUpperCase()
  PEOPLE.you = { ...PEOPLE.you, initial: initial ?? 'A', picture: user?.picture ?? null }
}
