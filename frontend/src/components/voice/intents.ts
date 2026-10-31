import iconCalendar from '../../assets/figma/icon-calendar-primary.svg'
import iconMap from '../../assets/figma/icon-map-primary-18.svg'
import iconSparkles from '../../assets/figma/icon-sparkles-primary.svg'
import iconWallet from '../../assets/figma/icon-wallet-primary.svg'
import { PEOPLE, SQUAD, type PersonId } from '../../data/people'
import { DAYS } from '../../pages/Itinerary/itineraryData'
import type { ExpenseCategory } from '../../pages/Trip/tripDetailData'
import { formatINR } from '../../pages/Trip/tripFormat'

export const SUGGESTIONS = ['I paid 800 for the cab', 'Plan Day 3', 'Find food nearby', 'Make a reel of Kabir']

export type ExpenseDraft = {
  title: string
  amount: number
  paidBy: PersonId
  category: ExpenseCategory
  splitWith: PersonId[]
}

export type VoiceIntent =
  | { kind: 'expense'; expense: ExpenseDraft }
  | { kind: 'plan-day'; day: number }
  | { kind: 'food' }
  | { kind: 'reel'; person: PersonId | null }
  | { kind: 'unknown' }

/** What GhoomMate shows on the confirmation card */
export type IntentSummary = {
  overline: string
  title: string
  details: string[]
  icon: string
}

const CATEGORY_WORDS: Record<ExpenseCategory, string[]> = {
  travel: ['cab', 'taxi', 'uber', 'ola', 'auto', 'scooter', 'bike', 'bus', 'train', 'flight', 'ferry', 'petrol', 'fuel', 'toll', 'parking'],
  food: ['food', 'dinner', 'lunch', 'breakfast', 'brunch', 'snack', 'drink', 'beer', 'chai', 'coffee', 'seafood', 'shack', 'meal', 'pizza'],
  stays: ['hotel', 'stay', 'hostel', 'room', 'villa', 'airbnb', 'homestay'],
  fun: [],
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = { food: 'Food', stays: 'Stays', travel: 'Travel', fun: 'Fun' }

const categoryOf = (title: string): ExpenseCategory => {
  const words = title.toLowerCase()
  const match = (Object.keys(CATEGORY_WORDS) as ExpenseCategory[]).find((c) =>
    CATEGORY_WORDS[c].some((w) => words.includes(w)),
  )
  return match ?? 'fun'
}

const personIn = (text: string): PersonId | null =>
  SQUAD.find((id) => id !== 'you' && new RegExp(`\\b${PEOPLE[id].name.toLowerCase()}\\b`).test(text)) ?? null

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function parseAmount(text: string) {
  const match = /(?:₹|rs\.?\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/.exec(text)
  if (!match) return 0
  const value = Number(match[1].replace(/,/g, ''))
  return Math.round(match[2] ? value * 1000 : value)
}

function parseExpense(text: string): ExpenseDraft | null {
  const amount = parseAmount(text)
  if (!amount) return null
  const forMatch = /\b(?:for|on)\s+(?:the\s+|a\s+|an\s+|our\s+)?([a-z][a-z\s-]*?)\s*(?:\b(?:split|between|with|today|yesterday)\b|[.,!?]|$)/.exec(text)
  const title = capitalise(forMatch?.[1].trim() || 'Expense')
  // "Kabir paid 800 for dinner" → Kabir; "I paid…" → you
  const payer = /\b(\w+)\s+(?:paid|spent)\b/.exec(text)?.[1]
  const paidBy = SQUAD.find((id) => PEOPLE[id].name.toLowerCase() === payer) ?? 'you'
  return { title, amount, paidBy, category: categoryOf(title), splitWith: SQUAD }
}

// TODO: replace keyword matching with the real NLU service (intent + slot extraction).
export function parseIntent(input: string): VoiceIntent {
  const text = input.toLowerCase().trim()

  if (/\b(paid|spent|pay|add expense)\b/.test(text)) {
    const expense = parseExpense(text)
    if (expense) return { kind: 'expense', expense }
  }

  const plan = /\bplan\b.*?\bday\s*(\d+)/.exec(text)
  if (plan) return { kind: 'plan-day', day: Number(plan[1]) }

  if (/\breels?\b/.test(text)) return { kind: 'reel', person: personIn(text) }

  if (/\b(food|eat|hungry|restaurants?|cafes?|dinner|lunch|breakfast)\b/.test(text)) return { kind: 'food' }

  return { kind: 'unknown' }
}

export function summarise(intent: VoiceIntent): IntentSummary | null {
  switch (intent.kind) {
    case 'expense': {
      const { title, amount, paidBy, category, splitWith } = intent.expense
      return {
        overline: 'Add expense',
        title: `${title} · ${formatINR(amount)}`,
        details: [
          paidBy === 'you' ? 'Paid by you' : `Paid by ${PEOPLE[paidBy].name}`,
          `Split ${splitWith.length} ways`,
          CATEGORY_LABELS[category],
        ],
        icon: iconWallet,
      }
    }
    case 'plan-day': {
      const day = DAYS.find((d) => d.label === `D${intent.day}`)
      return {
        overline: `Plan Day ${intent.day}`,
        title: day?.stops.length === 0 ? 'Fontainhas food walk, then a beach sunset' : `Open Day ${intent.day} in the itinerary`,
        details: [day ? day.title.split(' · ')[1] : 'Itinerary', 'Squad loves food', '4 stops'],
        icon: iconCalendar,
      }
    }
    case 'food':
      return {
        overline: 'Find food nearby',
        title: 'Seafood and street food around Baga',
        details: ['Explore', 'Open now', 'Under 10 min away'],
        icon: iconMap,
      }
    case 'reel': {
      const name = intent.person ? PEOPLE[intent.person].name : null
      return {
        overline: 'Make a reel',
        title: name ? `A Goa reel starring ${name}` : 'A Goa reel of the squad',
        details: ['Photos', 'Auto-picked clips', '30 sec'],
        icon: iconSparkles,
      }
    }
    default:
      return null
  }
}
