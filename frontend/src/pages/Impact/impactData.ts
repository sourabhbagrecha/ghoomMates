import { iconUrl } from '../../assets/icons'
import type { ImpactReport, Leg, LocalClassId, Mode, ReportDay } from '../../services/impactService'

/** How each ride mode is shown: its name, how a ride in it is described, and its icon file in assets/icons */
export const MODE_INFO: Record<Mode, { label: string; short: string; verb: string; icon: string }> = {
  walk: { label: 'Walk', short: 'Walk', verb: 'on foot', icon: 'footprints' },
  erickshaw: { label: 'E-rickshaw', short: 'E-rick', verb: 'by e-rickshaw', icon: 'erickshaw' },
  auto: { label: 'Auto', short: 'Auto', verb: 'by auto', icon: 'auto' },
  cab: { label: 'Cab', short: 'Cab', verb: 'by cab', icon: 'car-taxi-front' },
  boat: { label: 'Boat', short: 'Boat', verb: 'by boat', icon: 'sailboat' },
}

export const modeIcon = (mode: Mode, colour: 'primary' | 'white') => iconUrl(MODE_INFO[mode].icon, colour)

/** The segment colour of each spending class in the local-spend bar (design tokens only) */
export const CLASS_COLOURS: Record<LocalClassId, string> = {
  'local-artisan': 'var(--color-primary)',
  'local-food': 'var(--color-sky)',
  'heritage-stay': 'var(--color-sky-light)',
  guide: 'var(--color-amber)',
  transport: 'var(--color-success)',
  'entry-fees': 'var(--color-subtle)',
  other: 'var(--color-track-muted)',
}

/** 0 → "0", 0.04 → "0.04", 1.36 → "1.4", 3400 → "3,400" */
export function fmtKg(kg: number): string {
  if (kg <= 0) return '0'
  if (kg < 0.1) return kg.toFixed(2)
  if (kg < 100) return kg.toFixed(1)
  return Math.round(kg).toLocaleString('en-IN')
}

/** 14 → "14", 14.2 → "14.2" */
export const fmtHours = (hours: number) => (Math.round(hours * 10) / 10).toString()

/** 0.46 → "460 m", 1.43 → "1.4 km" */
export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/** Rupees from paise with Indian digit grouping, compact from ₹1 lakh: ₹45,800 · ₹1,24,500 → ₹124.5k */
export function fmtRupees(paise: number): string {
  const rupees = Math.round(paise / 100)
  return rupees >= 100_000 ? `₹${(rupees / 1000).toFixed(1)}k` : `₹${rupees.toLocaleString('en-IN')}`
}

/** Full grouping, for the places with room: ₹1,24,500 */
export const fmtRupeesFull = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Re-adds the footprint from the legs (as the server does, so both agree), after a ride changed. Every leg carries the
 * squad's kg for every mode, so switching a ride needs no round trip to show the new numbers.
 */
function withDays(report: ImpactReport, days: ReportDay[]): ImpactReport {
  const legs = days.flatMap((d) => d.legs)
  const total = legs.reduce((sum, l) => sum + l.kg, 0)
  const baseline = legs.reduce((sum, l) => sum + l.ownCabKg, 0)
  const saved = Math.max(0, baseline - total)
  const size = Math.max(1, report.squad.size)
  const cabKg = report.method.factors.cab.kgPerVehicleKm
  const used = (mode: Mode) => legs.filter((l) => l.mode === mode)
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
  return {
    ...report,
    footprint: {
      ...report.footprint,
      days: days.map((d) => ({ ...d, kg: round2(sum(d.legs.map((l) => l.kg))) })),
      totalKg: round2(total),
      perPersonKg: round2(total / size),
      baselineKg: round2(baseline),
      savedKg: round2(saved),
      savedPct: baseline > 0 ? Math.round((saved / baseline) * 100) : 0,
      cabKmSaved: Math.round((saved / cabKg) * 10) / 10,
      distanceKm: Math.round(sum(legs.map((l) => l.options[l.mode].km)) * 10) / 10,
      byMode: (Object.keys(MODE_INFO) as Mode[])
        .map((mode) => ({
          mode,
          label: MODE_INFO[mode].label,
          km: round2(sum(used(mode).map((l) => l.options[mode].km))),
          kg: round2(sum(used(mode).map((l) => l.kg))),
          legs: used(mode).length,
        }))
        .filter((m) => m.legs > 0),
    },
  }
}

/** The report as it would look with one ride switched (`null` = back to the default), before the server confirms it */
export function withLegMode(report: ImpactReport, leg: Pick<Leg, 'fromStopId' | 'toStopId'>, mode: Mode | null): ImpactReport {
  const days = report.footprint.days.map((day) => ({
    ...day,
    legs: day.legs.map((l) => {
      if (l.fromStopId !== leg.fromStopId || l.toStopId !== leg.toStopId) return l
      const picked = mode !== null && l.options[mode].allowed
      const next = picked ? mode : l.defaultMode
      return { ...l, mode: next, chosen: picked, kg: l.options[next].kg }
    }),
  }))
  return withDays(report, days)
}

/** The report with your pledge ticked or unticked (the server's answer then refreshes the badge) */
export function withPledge(report: ImpactReport, pledgeId: string, taken: boolean, me: string): ImpactReport {
  const squad = report.squad.memberIds
  const items = report.pledges.items.map((p) => {
    if (p.id !== pledgeId) return p
    const ticked = new Set(p.ticks)
    if (taken) ticked.add(me)
    else ticked.delete(me)
    return { ...p, ticks: squad.filter((id) => ticked.has(id)), mine: taken }
  })
  const ticks = items.reduce((sum, p) => sum + p.ticks.length, 0)
  const possible = report.pledges.possible
  const parts = report.score.parts.map((p) => (p.id === 'pledges' ? { ...p, points: possible > 0 ? Math.round((p.max * ticks) / possible) : 0 } : p))
  return {
    ...report,
    pledges: { ...report.pledges, items, ticks, pct: possible > 0 ? Math.round((ticks / possible) * 100) : 0, mine: items.filter((p) => p.mine).length },
    score: { ...report.score, parts, total: parts.reduce((sum, p) => sum + p.points, 0) },
  }
}

/** A signature of the plan that changes when a stop is added, moved, renamed or removed (so the impact refreshes) */
export const planSignature = (days: { stops: { id: string; time: string; title: string; place: string }[] }[]) =>
  days.map((d) => d.stops.map((s) => `${s.id}@${s.time}:${s.title}:${s.place}`).join('|')).join('||')
