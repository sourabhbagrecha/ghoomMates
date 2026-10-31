import { VIBE_AXES, type VibeAxis } from '../data/vibe'
import { fetchCurrentUser, getStoredUser, updateUserProfile } from './authService'

// What GhoomMate remembers about you across chats: short notes on your profile (preferences.ghoomate), some
// carrying a rule its picks follow. The agent reads and writes the same shape (backend/src/voice/memory.ts).

export type MemoryNote = {
  text: string
  /** Nothing starting before 8 AM */
  noEarlyStarts?: boolean
  /** Most to spend per experience, in rupees */
  maxPriceRupees?: number
  likes?: VibeAxis[]
  avoid?: VibeAxis[]
  at: string
}

export type GhoomateMemory = { notes: MemoryNote[] }

export const MAX_NOTES = 12
export const MAX_NOTE_LENGTH = 120

const AXES = VIBE_AXES.map((a) => a.id) as VibeAxis[]
const axes = (value: unknown) => (Array.isArray(value) ? AXES.filter((a) => value.includes(a)) : [])

/** Your memory from a profile's preferences, dropping anything malformed */
export function memoryFrom(preferences: unknown): GhoomateMemory {
  const raw = (preferences as { ghoomate?: { notes?: unknown } } | null | undefined)?.ghoomate?.notes
  if (!Array.isArray(raw)) return { notes: [] }
  const notes = raw.flatMap((n): MemoryNote[] => {
    const note = n as Partial<MemoryNote> | null
    const text = typeof note?.text === 'string' ? note.text.trim() : ''
    if (!text) return []
    const price = Number(note?.maxPriceRupees)
    const likes = axes(note?.likes)
    const avoid = axes(note?.avoid)
    return [
      {
        text,
        ...(note?.noEarlyStarts ? { noEarlyStarts: true } : {}),
        ...(Number.isFinite(price) && price > 0 ? { maxPriceRupees: Math.round(price) } : {}),
        ...(likes.length ? { likes } : {}),
        ...(avoid.length ? { avoid } : {}),
        at: typeof note?.at === 'string' ? note.at : new Date(0).toISOString(),
      },
    ]
  })
  return { notes: notes.slice(-MAX_NOTES) }
}

/** What's saved on this device's copy of your profile */
export const loadMemory = (): GhoomateMemory => memoryFrom(getStoredUser()?.preferences)

/** Fresh from the server: GhoomMate may have added notes during a chat */
export async function refreshMemory(): Promise<GhoomateMemory> {
  const user = await fetchCurrentUser()
  return memoryFrom(user?.preferences ?? getStoredUser()?.preferences)
}

/** Saves your notes on your profile (other preferences are left alone) and returns what was saved */
export async function saveMemory(memory: GhoomateMemory): Promise<GhoomateMemory> {
  const notes = memory.notes.slice(-MAX_NOTES).map((n) => ({ ...n, text: n.text.trim().slice(0, MAX_NOTE_LENGTH) }))
  const user = await updateUserProfile({ preferences: { ghoomate: { notes } } })
  if (!user) throw new Error('Sign in to save what GhoomMate remembers')
  return memoryFrom(user.preferences)
}

/** "No starts before 8 AM", "Up to ₹1,500", "Likes adventure", "Avoids nightlife" */
export function ruleLabels(note: MemoryNote): string[] {
  const label = (id: VibeAxis) => VIBE_AXES.find((a) => a.id === id)?.label.toLowerCase() ?? id
  return [
    ...(note.noEarlyStarts ? ['No starts before 8 AM'] : []),
    ...(note.maxPriceRupees ? [`Up to ₹${note.maxPriceRupees.toLocaleString('en-IN')}`] : []),
    ...(note.likes ?? []).map((a) => `Likes ${label(a)}`),
    ...(note.avoid ?? []).map((a) => `Avoids ${label(a)}`),
  ]
}
