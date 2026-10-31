import { request } from './tripsService'

export type CrowdLabel = 'quiet' | 'moderate' | 'busy' | 'packed' | 'closed'

export type CrowdSuggestion =
  | { type: 'shift'; time: string; minutes: number; level: number; label: CrowdLabel; reason: string }
  | { type: 'swap'; siteId: string; siteName: string; title: string; place: string; tag: string; notes: string; level: number; label: CrowdLabel; reason: string }

/** How busy a heritage stop is at its time, from GET /api/trips/:id/itinerary */
export type StopCrowd = {
  siteId: string
  siteName: string
  kind: string
  /** A lesser-known spot */
  gem: boolean
  /** 0–100; null when the stop has no time or the site is closed then */
  level: number | null
  label: CrowdLabel | null
  waitMinutes: number
  best: { time: string; minutes: number; level: number } | null
  /** Hourly levels across the opening hours */
  forecast: { time: string; minutes: number; level: number | null }[]
  /** "Busier than usual: it’s Diwali" */
  dayNote: string | null
  story: string
  care: string
  suggestion: CrowdSuggestion | null
}

export type LiveSite = {
  id: string
  name: string
  kind: string
  gem: boolean
  lat: number
  lng: number
  level: number | null
  label: CrowdLabel
  trend: 'rising' | 'falling' | 'steady'
  waitMinutes: number
  quietAt: string | null
  best: { time: string; level: number } | null
  story: string
  care: string
}

export type LiveCrowds = {
  city: string
  date: string
  time: string
  dayNote: string | null
  /** Sites that are busy or packed right now */
  packed: number
  quiet: number
  /** Busiest first */
  sites: LiveSite[]
}

export const heritageApi = {
  live: (city: string, at?: string) =>
    request<LiveCrowds>(`/api/heritage/${encodeURIComponent(city)}/live${at ? `?at=${encodeURIComponent(at)}` : ''}`),
}
