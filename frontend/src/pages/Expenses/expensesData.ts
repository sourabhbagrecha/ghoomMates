import grid2 from '../../assets/figma/photo-grid-2.svg'
import photoDinner from '../../assets/figma/photo-dinner.svg'
import photoScooter from '../../assets/figma/photo-scooter.svg'
import photoScuba from '../../assets/figma/photo-scuba.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { ExpenseCategory, TripSummary } from '../../services/tripsService'

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food',
  stays: 'Stays',
  travel: 'Travel',
  fun: 'Fun',
  other: 'Other',
}

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: 'var(--color-primary)',
  stays: 'var(--color-sky)',
  travel: 'var(--color-amber)',
  fun: 'var(--color-sky-light)',
  other: 'var(--color-subtle)',
}

/** Thumbnail for an expense without a receipt photo */
export const CATEGORY_PHOTOS: Record<ExpenseCategory, string> = {
  food: photoDinner,
  stays: grid2,
  travel: photoScooter,
  fun: photoScuba,
  other: photoVagator,
}

/** ₹48,600 → "₹48.6k" for the compact header stats */
export function compactINR(rupees: number) {
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(rupees >= 1_000_000 ? 0 : 1).replace(/\.0$/, '')}L`
  if (rupees >= 10_000) return `₹${(rupees / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`
}

/** Your outgoing and incoming suggested transfers, in rupees */
export function myDues(summary: TripSummary) {
  const me = summary.memberId
  const owe = summary.transfers.filter((t) => t.fromMemberId === me)
  const owed = summary.transfers.filter((t) => t.toMemberId === me)
  const sum = (list: typeof owe) => list.reduce((total, t) => total + t.amountPaise, 0) / 100
  return { owe, owed, oweTotal: sum(owe), owedTotal: sum(owed) }
}
