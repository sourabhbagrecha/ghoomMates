// Copy and small helpers for the farm-to-table screens (Explore → Farm-to-table, and the host kitchen at #/host).
import type { Diet, GreenPartId } from '../../services/hospitalityService'
import { formatINR } from '../Trip/tripFormat'

export { formatINR }

export const DIET_LABELS: Record<Diet, string> = { veg: 'Vegetarian', jain: 'Jain', vegan: 'Vegan' }

export const DIET_HINTS: Record<Diet, string> = {
  veg: 'The standard Mewari thali',
  jain: 'No onion, garlic or root vegetables',
  vegan: 'No ghee, curd or paneer',
}

export const SLOT_LABELS: Record<string, string> = { starter: 'Starter', main: 'Main', sabzi: 'Sabzi', side: 'Side', sweet: 'Sweet' }

export const GREEN_PART_NOTES: Record<GreenPartId, string> = {
  local: 'Share of the food, by weight, that comes from partner farms this month',
  waste: 'Food left over per guest; the kitchen’s own log replaces the reported figure',
  plastic: 'No single-use plastic in the kitchen or at the table',
  water: 'Free refills mean no bottle per guest',
}

/** 14.2 → "14.2 kg", 3 → "3 kg" */
export const formatKg = (kg: number) => `${kg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`

/** 0.84 → "84%" */
export const percent = (share: number) => `${Math.round(share * 100)}%`

/** The day after `date`, as YYYY-MM-DD */
export function addDay(date: string, n = 1) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + n)
  return next.toISOString().slice(0, 10)
}

/** "2026-11-05" → "Thu, 5 Nov", the app's date style */
export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Today" / "Tomorrow" relative to `today` (YYYY-MM-DD, India time from the server), else the given label like "Wed, 5 Nov" */
export function dayName(date: string, today: string, label: string) {
  return date === today ? 'Today' : date === addDay(today) ? 'Tomorrow' : label
}

/** Remembers which host kitchen was open last on this device */
const HOST_KEY = 'ghoomates:hostKitchen'

export function rememberHost(id: string) {
  try {
    localStorage.setItem(HOST_KEY, id)
  } catch {
    // Blocked storage: the picker simply starts from the first kitchen next time
  }
}

export function recalledHost(): string | null {
  try {
    return localStorage.getItem(HOST_KEY)
  } catch {
    return null
  }
}
