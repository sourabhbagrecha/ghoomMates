export type PersonId = 'you' | 'riya' | 'kabir' | 'meera' | 'dev'

export type Person = {
  id: PersonId
  name: string
  initial: string
  color: string
}

export const PEOPLE: Record<PersonId, Person> = {
  you: { id: 'you', name: 'You', initial: 'A', color: 'var(--color-person-you)' },
  riya: { id: 'riya', name: 'Riya', initial: 'R', color: 'var(--color-person-riya)' },
  kabir: { id: 'kabir', name: 'Kabir', initial: 'K', color: 'var(--color-person-kabir)' },
  meera: { id: 'meera', name: 'Meera', initial: 'M', color: 'var(--color-person-meera)' },
  dev: { id: 'dev', name: 'Dev', initial: 'D', color: 'var(--color-person-dev)' },
}

export const SQUAD: PersonId[] = ['you', 'riya', 'kabir', 'meera', 'dev']
