import { AXES } from './profileData'
import './VibeWeb.css'

// Same geometry as spiderweb.svg (176 × 140): a hexagon of radius 44 around (84, 72),
// drawn from data so the "You" shape follows your quiz answers.
const CX = 84
const CY = 72
const RADIUS = 44
const RINGS = [14.5, 29, 44]

const point = (axis: number, value: number) => {
  const angle = ((-90 + 60 * axis) * Math.PI) / 180
  return [CX + RADIUS * value * Math.cos(angle), CY + RADIUS * value * Math.sin(angle)]
}

const polygon = (values: number[]) => values.map((v, i) => point(i, v).map((n) => n.toFixed(1)).join(',')).join(' ')

// Label spots from the Itinerary card (small) and the create-trip vibe step (large)
const SMALL_LABELS = [
  { left: 60.5, top: 10.5 },
  { left: 129.63, top: 38 },
  { left: 129.63, top: 93 },
  { left: 67.5, top: 120.5 },
  { left: 18.37, top: 93 },
  { left: 11.37, top: 38 },
]

const LARGE_LABELS = [
  { left: 126, top: 25.5, anchor: 'middle' },
  { left: 194.5, top: 66.75, anchor: 'start' },
  { left: 194.5, top: 149.25, anchor: 'start' },
  { left: 126, top: 190.5, anchor: 'middle' },
  { left: 57.5, top: 149.25, anchor: 'end' },
  { left: 57.5, top: 66.75, anchor: 'end' },
]

const level = (v: number) => (v >= 0.75 ? 'high' : v >= 0.5 ? 'medium' : 'low')

function describe(scores: number[]) {
  const groups = (['high', 'medium', 'low'] as const)
    .map((l) => [l, AXES.filter((_, i) => level(scores[i]) === l).map((a) => a.label.toLowerCase())] as const)
    .filter(([, axes]) => axes.length)
    .map(([l, axes]) => `${l} on ${axes.join(' and ')}`)
  return `Your vibe chart: ${groups.join(', ')}`
}

type VibeWebProps = {
  /** 0–1 per axis, in AXES order */
  you: number[]
  squad?: number[]
  size?: 'small' | 'large'
}

export function VibeWeb({ you, squad, size = 'small' }: VibeWebProps) {
  const scale = size === 'large' ? 1.5 : 1
  const hexagon = (r: number) => polygon(AXES.map(() => r / RADIUS))

  return (
    <div className={`vibe-web vibe-web--${size}`} role="img" aria-label={describe(you)}>
      <svg width={176 * scale} height={140 * scale} viewBox="0 0 176 140" aria-hidden="true">
        {RINGS.map((r) => (
          <polygon key={r} className="vibe-web__grid" points={hexagon(r)} />
        ))}
        {AXES.map((a, i) => {
          const [x, y] = point(i, 1)
          return <line key={a.id} className="vibe-web__grid" x1={CX} y1={CY} x2={x} y2={y} />
        })}
        {squad && <polygon className="vibe-web__shape vibe-web__shape--squad" points={polygon(squad)} />}
        <polygon className="vibe-web__shape vibe-web__shape--you" points={polygon(you)} />
        {you.map((v, i) => {
          const [x, y] = point(i, v)
          return <circle key={AXES[i].id} className="vibe-web__dot" cx={x} cy={y} r={2.6} />
        })}
      </svg>
      {AXES.map((a, i) =>
        size === 'large' ? (
          <span
            key={a.id}
            className={`vibe-web__label vibe-web__label--${LARGE_LABELS[i].anchor}`}
            style={{ left: LARGE_LABELS[i].left, top: LARGE_LABELS[i].top }}
          >
            {a.label}
          </span>
        ) : (
          <span key={a.id} className="vibe-web__label" style={SMALL_LABELS[i]}>
            {a.label}
          </span>
        ),
      )}
    </div>
  )
}

/** Squad / You key under or beside the web */
export function VibeLegend({ squad = true }: { squad?: boolean }) {
  return (
    <div className="vibe-legend">
      {squad && (
        <span className="vibe-legend__item">
          <span className="vibe-legend__swatch vibe-legend__swatch--squad" />
          Squad
        </span>
      )}
      <span className="vibe-legend__item">
        <span className="vibe-legend__swatch vibe-legend__swatch--you" />
        You
      </span>
    </div>
  )
}
