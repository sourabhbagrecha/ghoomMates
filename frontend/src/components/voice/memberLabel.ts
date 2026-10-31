import { personOf } from '../../data/people'

type MemberRef = { memberId: string; name: string }

/** “You” for yourself, the first name for trip members (from registerPeople), else the agent’s name */
export function memberLabel(members: { memberId: string }[] | undefined, memberId: string, fallback: string) {
  return members?.some((m) => m.memberId === memberId) ? personOf(memberId).name : fallback
}

/** A transfer end the agent sent as a member id or a name, matched back to a member when possible */
export function resolveMember(ref: string, known: MemberRef[]): { memberId: string | null; name: string } {
  const byId = known.find((m) => m.memberId === ref)
  if (byId) return { memberId: byId.memberId, name: byId.name }
  const lower = ref.trim().toLowerCase()
  const byName = known.find((m) => m.name.toLowerCase() === lower || m.name.split(/\s+/)[0].toLowerCase() === lower)
  return byName ? { memberId: byName.memberId, name: byName.name } : { memberId: null, name: ref }
}
