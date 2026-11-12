import { request } from './tripsService'

/* Types mirror backend/src/impact (see backend/docs/impact.md). Money is integer paise; footprints are kg CO2e. */

export type Mode = 'walk' | 'erickshaw' | 'auto' | 'cab' | 'boat'

export type LegOption = { allowed: boolean; km: number; minutes: number; vehicles: number; kg: number }

export type LegEnd = { title: string; name: string; lat: number; lng: number }

/** A ride between two consecutive stops of a day. `options` holds the whole squad's numbers for every mode. */
export type Leg = {
  index: number
  dayNumber: number
  fromStopId: string
  toStopId: string
  from: LegEnd
  to: LegEnd
  lake: boolean
  /** The mode in use: the squad's pick, else the default */
  mode: Mode
  defaultMode: Mode
  chosen: boolean
  distanceSource: 'estimate' | 'routes'
  kg: number
  /** Everyone in their own cab */
  ownCabKg: number
  options: Record<Mode, LegOption>
}

export type ReportDay = { number: number; title: string; date: string | null; stops: number; kg: number; legs: Leg[] }

export type Footprint = {
  squadSize: number
  totalKg: number
  perPersonKg: number
  baselineKg: number
  savedKg: number
  savedPct: number
  cabKmSaved: number
  distanceKm: number
  byMode: { mode: Mode; label: string; km: number; kg: number; legs: number }[]
  days: ReportDay[]
  located: { stops: number; total: number }
  source: 'estimate' | 'routes' | 'mixed' | 'none'
}

export type CrowdLabel = 'quiet' | 'moderate' | 'busy' | 'packed' | 'closed'

export type CrowdVisit = {
  stopId: string
  dayNumber: number
  title: string
  siteId: string
  siteName: string
  gem: boolean
  time: string
  level: number | null
  label: CrowdLabel
  peak: number
  avoidedPct: number
  hours: number
  crowdHours: number
  better:
    | { type: 'shift'; time: string; level: number; extraCrowdHours: number }
    | { type: 'swap'; siteName: string; level: number; extraCrowdHours: number }
    | null
}

export type CrowdSmart = {
  heritageStops: number
  quietVisits: number
  offPeakVisits: number
  peakVisits: number
  crowdHoursAvoided: number
  visits: CrowdVisit[]
  tip: string | null
}

export type LocalClassId = 'local-artisan' | 'local-food' | 'heritage-stay' | 'guide' | 'entry-fees' | 'transport' | 'other'

export type LocalSpend = {
  trackedPaise: number
  keptPaise: number
  sharePct: number
  expenseCount: number
  byClass: { id: LocalClassId; label: string; note: string; paise: number; keptPaise: number; count: number }[]
  items: { id: string; description: string; amountPaise: number; class: LocalClassId; local: boolean; by: 'rule' | 'gemini' | 'assumed' }[]
  estimated: number
  byGemini: number
  classifier: 'rules' | 'rules+gemini'
}

export type PledgeItem = {
  id: string
  title: string
  why: string
  /** Icon name in assets/icons */
  icon: string
  /** Trip member ids who took it */
  ticks: string[]
  mine: boolean
}

export type PledgeSummary = { items: PledgeItem[]; squadSize: number; ticks: number; possible: number; pct: number; mine: number }

export type ScorePart = { id: 'footprint' | 'crowd' | 'local' | 'pledges'; label: string; points: number; max: number }

export type Badge = { level: number; name: string; blurb: string; next: { name: string; at: number; toGo: number } | null }

export type Score = { total: number; parts: ScorePart[]; badge: Badge }

export type SwapAction =
  | { type: 'mode'; fromStopId: string; toStopId: string; mode: Mode }
  | { type: 'stop'; stopId: string }
  | { type: 'expense' }

export type Swap = {
  id: string
  kind: 'walk' | 'erickshaw' | 'boat' | 'crowd' | 'local'
  text: string
  savesKg: number
  savesCrowdHours: number
  action: SwapAction
  actionLabel: string
}

export type ImpactReport = {
  tripId: string
  groupName: string
  tripName: string
  destination: string
  city: string | null
  squad: { size: number; memberIds: string[] }
  footprint: Footprint
  crowdSmart: CrowdSmart
  local: LocalSpend
  pledges: PledgeSummary
  score: Score
  swaps: Swap[]
  method: {
    factors: Record<Mode, { label: string; kgPerVehicleKm: number; seats: number; basis: string }>
    sources: { id: string; title: string; url: string }[]
  }
  generatedAt: string
}

const impact = (tripId: string) => `/api/impact/trips/${encodeURIComponent(tripId)}`

export const impactApi = {
  get: (tripId: string) => request<ImpactReport>(impact(tripId)),
  /** Stores the squad's ride for one leg (`null` goes back to the default) and returns the refreshed report */
  setLeg: (tripId: string, leg: { fromStopId: string; toStopId: string }, mode: Mode | null) =>
    request<ImpactReport>(`${impact(tripId)}/legs`, { method: 'PUT', body: { ...leg, mode } }),
  setPledge: (tripId: string, pledgeId: string, taken: boolean) =>
    request<{ pledges: PledgeSummary; score: Score }>(`${impact(tripId)}/pledges`, { method: 'PUT', body: { pledgeId, taken } }),
}
