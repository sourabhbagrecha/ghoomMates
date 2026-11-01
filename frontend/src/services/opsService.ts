import type { CrowdLabel } from './heritageService'
import { request } from './tripsService'

/* Types mirror backend/src/ops. Counts under 3 squads arrive as "<3" and their people as null. */

/** A squad count that may be hidden for privacy */
export type Shown = number | '<3'

export type OpsCell = {
  hour: number
  /** "10 AM" */
  time: string
  /** Modelled crowd for a typical day; null while closed */
  baseline: number | null
  /** Level points the squads' plans add */
  uplift: number
  /** Baseline plus uplift, capped at 100 */
  level: number | null
  label: CrowdLabel
  baselineLabel: CrowdLabel
  /** Squads starting a stop in this hour */
  squads: Shown
  people: number | null
}

export type OpsSlot = { hour: number; time: string; minutes: number; level: number; label: CrowdLabel }

export type OpsHotspot = {
  siteId: string
  siteName: string
  kind: string
  startMinutes: number
  endMinutes: number
  /** "10:00 AM" */
  startTime: string
  endTime: string
  level: number
  label: CrowdLabel
  squads: number
  people: number
}

export type OpsSite = {
  id: string
  name: string
  kind: string
  gem: boolean
  lat: number
  lng: number
  hours: OpsCell[]
  peak: OpsSlot | null
  best: OpsSlot | null
  squads: Shown
  people: number | null
  hotspot: OpsHotspot | null
}

export type OpsForecast = {
  city: string
  /** YYYY-MM-DD */
  date: string
  /** "weekend", "Diwali" or null */
  dayNote: string | null
  hours: number[]
  kpis: {
    plannedVisitors: number | null
    squads: Shown
    busiest: (OpsSlot & { siteId: string; siteName: string; squads: Shown }) | null
    /** 0–1 */
    offPeakShare: number | null
    hotspots: number
  }
  byHour: { hour: number; squads: Shown }[]
  hotspots: OpsHotspot[]
  sites: OpsSite[]
  meta: {
    /** Planned stops were read from the trips */
    live: boolean
    /** Simulated demo squads are mixed in */
    sample: boolean
    sampleSquads: number
  }
}

export type AdvisoryLevel = 'busy' | 'packed'

/** What a site manager publishes and every squad planned into the window sees */
export type Advisory = {
  id: string
  city: string
  siteId: string
  siteName: string
  date: string
  startMinutes: number
  endMinutes: number
  startTime: string
  endTime: string
  level: AdvisoryLevel
  messageEn: string
  messageHi: string
  alternative: {
    /** A calmer site, shaped like a crowd "swap" so it can replace a stop */
    site: { id: string; name: string; title: string; place: string; tag: string; notes: string } | null
    /** A calmer time at the same site */
    time: { minutes: number; time: string } | null
  } | null
  publishedAt: string
}

export type Reach = {
  squads: Shown
  people: number | null
  /** Simulated squads are part of the count */
  includesSample: boolean
  /** People who leave the crunch if `pickup` of the squads swap (an estimate) */
  relief: number | null
  pickup: number
}

export type PartnerAdvisory = Advisory & { reach: { squads: Shown; people: number | null } | null }

export type AdvisoryDraft = {
  source: 'gemini' | 'template'
  draft: {
    siteId: string
    siteName: string
    date: string
    startMinutes: number
    endMinutes: number
    startTime: string
    endTime: string
    level: AdvisoryLevel
    peakLevel: number | null
    /** The window doesn't look crowded */
    calm: boolean
    squads: Shown
    people: number | null
    includesSample: boolean
    messageEn: string
    messageHi: string
    alternative: {
      site: { id: string; name: string; level: number; label: CrowdLabel; km: number; calmUntil: string | null } | null
      time: { minutes: number; time: string; level: number; label: CrowdLabel } | null
    }
  }
}

export type NewAdvisory = {
  siteId: string
  date: string
  startMinutes: number
  endMinutes: number
  level: AdvisoryLevel
  messageEn: string
  messageHi: string
  altSiteId?: string | null
  altMinutes?: number | null
  /** Count simulated squads in the reach estimate */
  sample?: boolean
}

export const CITY = 'Udaipur'

const city = (name: string) => encodeURIComponent(name)

export const opsApi = {
  forecast: (date: string, sample: boolean, name = CITY) =>
    request<OpsForecast>(`/api/ops/${city(name)}/forecast?date=${date}&sample=${sample ? 1 : 0}`),
  /** Live advisories for the console, with how many squads each reached */
  advisories: (name = CITY) =>
    request<{ items: PartnerAdvisory[] }>(`/api/ops/advisories?city=${city(name)}&reach=1`).then((r) => r.items),
  /** What travellers see: live advisories for a city, without the partner numbers */
  publicAdvisories: (name = CITY) =>
    request<{ items: Advisory[] }>(`/api/ops/advisories?city=${city(name)}`).then((r) => r.items),
  draft: (input: { siteId: string; date: string; startMinutes?: number; endMinutes?: number; sample: boolean }) =>
    request<AdvisoryDraft>('/api/ops/advisories/draft', { body: input }),
  reach: (input: { siteId: string; date: string; startMinutes: number; endMinutes: number; sample: boolean }) =>
    request<Reach>('/api/ops/advisories/reach', { body: input }),
  publish: (input: NewAdvisory) =>
    request<{ advisory: PartnerAdvisory; reach: Reach }>('/api/ops/advisories', { body: input }),
  withdraw: (id: string) => request<null>(`/api/ops/advisories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
