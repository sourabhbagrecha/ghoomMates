import { VIBE_AXES, type VibeScores } from '../data/vibe'
import './VibeChart.css'

type VibeSeries = {
  scores: VibeScores
  /** CSS colour, e.g. var(--color-amber) */
  color: string
  fillOpacity: number
  /** Draws a dot on each vertex, as Figma does for “You” */
  dots?: boolean
}

type VibeChartProps = {
  /** Drawn in order, so put the series that should sit on top last */
  series: VibeSeries[]
  width: number
  label: string
  /** `compact` is the exact 176 × 140 spiderweb from the Itinerary vibe card */
  variant?: 'default' | 'compact'
}

// Hexagon rings at ⅓, ⅔ and 1. `compact` matches the Figma spiderweb; `default` is roomier for bigger charts.
const GEOMETRY = {
  default: { viewW: 220, viewH: 196, cx: 110, cy: 98, r: 66, labelGap: 14, dot: 3.4 },
  compact: { viewW: 176, viewH: 140, cx: 84, cy: 72, r: 44, labelGap: 10, dot: 2.6 },
}
const RINGS = [1 / 3, 2 / 3, 1]

/** Hexagonal radar chart of a vibe across the six axes, for one or more people. */
export function VibeChart({ series, width, label, variant = 'default' }: VibeChartProps) {
  const { viewW, viewH, cx, cy, r, labelGap, dot } = GEOMETRY[variant]

  const point = (axis: number, value: number) => {
    const angle = ((axis * 60 - 90) * Math.PI) / 180
    return { x: cx + Math.cos(angle) * r * value, y: cy + Math.sin(angle) * r * value }
  }

  const polygon = (values: number[]) =>
    values
      .map((v, i) => point(i, v))
      .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ')

  return (
    <svg
      className={`vibe-chart vibe-chart--${variant}`}
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={width}
      height={(width * viewH) / viewW}
      role="img"
      aria-label={label}
    >
      {RINGS.map((ring) => (
        <polygon key={ring} className="vibe-chart__grid" points={polygon(VIBE_AXES.map(() => ring))} />
      ))}
      {VIBE_AXES.map(({ id }, i) => {
        const { x, y } = point(i, 1)
        return <line key={id} className="vibe-chart__grid" x1={cx} y1={cy} x2={x} y2={y} />
      })}

      {series.map(({ scores, color, fillOpacity, dots }, s) => {
        const values = VIBE_AXES.map(({ id }) => scores[id])
        return (
          <g key={s}>
            <polygon
              className="vibe-chart__shape"
              points={polygon(values)}
              style={{ fill: color, fillOpacity, stroke: color }}
            />
            {dots &&
              values.map((v, i) => {
                const { x, y } = point(i, v)
                return <circle key={i} className="vibe-chart__dot" cx={x} cy={y} r={dot} style={{ fill: color }} />
              })}
          </g>
        )
      })}

      {VIBE_AXES.map(({ id, label: axisLabel }, i) => {
        const { x, y } = point(i, 1 + labelGap / r)
        const anchor = Math.abs(x - cx) < 1 ? 'middle' : x > cx ? 'start' : 'end'
        return (
          <text key={id} className="vibe-chart__label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
            {axisLabel}
          </text>
        )
      })}
    </svg>
  )
}
