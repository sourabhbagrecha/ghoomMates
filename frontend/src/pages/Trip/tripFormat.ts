/** ₹ with Indian digit grouping: 124500 → "₹1,24,500" */
export const formatINR = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

/** "05:30 PM" → "17:30" for <input type="time"> */
export function to24h(time: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim())
  if (!match) return ''
  const [, h, m, period] = match
  const hours = (Number(h) % 12) + (period.toUpperCase() === 'PM' ? 12 : 0)
  return `${String(hours).padStart(2, '0')}:${m}`
}

/** "17:30" → "05:30 PM" */
export function to12h(time: string) {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const hours = h % 12 || 12
  return `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
}

/** ["Riya", "Kabir", "Dev"] → "Riya, Kabir and Dev" */
export const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
