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

const PALETTE = [
  'var(--color-person-riya)',
  'var(--color-person-kabir)',
  'var(--color-person-meera)',
  'var(--color-person-dev)',
  'var(--color-person-you)',
]

// A member's colour is saved as a design token ("var(--color-person-riya)") by sign-up and as a colour id ("pink") by
// Edit profile (see COLOURS in pages/Onboarding/onboardingData.ts). Both have to end up as a colour the avatar can paint:
// an id such as "sunshine" is not a CSS colour, and "pink" would be the browser's pink, not ours.
const COLOUR_IDS: Record<string, string> = {
  sunshine: 'var(--color-amber)',
  sky: 'var(--color-sky)',
  pink: 'var(--color-person-kabir)',
  purple: 'var(--color-person-meera)',
  green: 'var(--color-person-dev)',
  blue: 'var(--color-primary)',
}

const avatarColour = (colour?: string | null) => (colour ? (COLOUR_IDS[colour] ?? (/^(var\(|#|rgb)/.test(colour) ? colour : undefined)) : undefined)

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
      color: avatarColour(m.colour) ?? PALETTE[i % PALETTE.length],
      picture: m.picture,
    }
  })
}

/** Shows the signed-in user's initial and selfie wherever the sample screens show “you” */
export function setYou(user: { name: string; picture?: string | null } | null) {
  const initial = user?.name.trim()[0]?.toUpperCase()
  PEOPLE.you = { ...PEOPLE.you, initial: initial ?? 'A', picture: user?.picture ?? null }
}
