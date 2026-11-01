import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { noise2D } from '@remotion/noise'
import { Circle, Polygon, Star } from '@remotion/shapes'
import type { ReelFact, ReelScene } from '../../../services/reelsService'
import { SQUAD_COLOURS, type Look } from '../looks'
import { EffectLayer, Stickers, Watermark } from './Overlays'

type Props = { scene: ReelScene; facts: ReelFact[]; look: Look }

const STAGGER = 10
const COUNT_FRAMES = 30

/** Shapes drifting slowly behind the numbers */
function Backdrop() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const shapes = [
    { kind: 'star', x: 0.12, y: 0.18, size: 90 },
    { kind: 'circle', x: 0.85, y: 0.25, size: 70 },
    { kind: 'polygon', x: 0.15, y: 0.82, size: 80 },
    { kind: 'star', x: 0.82, y: 0.86, size: 60 },
    { kind: 'circle', x: 0.5, y: 0.08, size: 40 },
  ]
  return (
    <AbsoluteFill>
      {shapes.map((s, i) => {
        const dx = noise2D(`bx-${i}`, frame / 80, 0) * 40
        const dy = noise2D(`by-${i}`, 0, frame / 80) * 40
        const colour = SQUAD_COLOURS[i % SQUAD_COLOURS.length]
        return (
          <div key={i} style={{ position: 'absolute', left: s.x * width + dx, top: s.y * height + dy, opacity: 0.35, transform: `rotate(${frame * (i % 2 ? 0.8 : -0.6)}deg)` }}>
            {s.kind === 'star' && <Star points={5} innerRadius={s.size * 0.4} outerRadius={s.size} fill={colour} />}
            {s.kind === 'circle' && <Circle radius={s.size} fill="none" stroke={colour} strokeWidth={10} />}
            {s.kind === 'polygon' && <Polygon points={6} radius={s.size} fill={colour} />}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/** The trip's numbers, counting up one after another on bold cards */
export function StatsScene({ scene, facts, look }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const headingIn = spring({ frame, fps, config: { damping: 14 } })
  const shown = facts.slice(0, 4)

  return (
    <AbsoluteFill style={{ background: look.background, alignItems: 'center', justifyContent: 'center', gap: 36 }}>
      <Backdrop />
      <h2 style={{ margin: 0, color: '#fff', fontFamily: look.display, fontWeight: look.displayWeight, fontSize: 64, lineHeight: '80px', textAlign: 'center', padding: '0 60px', textTransform: look.shout ? 'uppercase' : 'none', opacity: headingIn, transform: `translateY(${interpolate(headingIn, [0, 1], [-40, 0])}px)` }}>
        {scene.caption || 'By the numbers'}
      </h2>
      {shown.map((fact, i) => {
        const start = 10 + i * STAGGER
        const enter = spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 120 } })
        const counted = Math.round(interpolate(frame, [start, start + COUNT_FRAMES], [0, fact.value], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
        const colour = SQUAD_COLOURS[i % SQUAD_COLOURS.length]
        return (
          <div
            key={fact.label}
            style={{ display: 'flex', alignItems: 'center', gap: 28, width: 560, padding: '18px 34px', borderRadius: 32, background: 'rgba(255, 255, 255, 0.14)', border: '3px solid rgba(255, 255, 255, 0.35)', opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [i % 2 ? 400 : -400, 0])}px) rotate(${interpolate(enter, [0, 1], [i % 2 ? 6 : -6, 0])}deg)` }}
          >
            <span style={{ minWidth: 180, color: colour, fontFamily: look.display, fontWeight: look.displayWeight, fontSize: 110, lineHeight: '120px', fontVariantNumeric: 'tabular-nums', textShadow: '0 6px 20px rgba(0, 0, 0, 0.3)' }}>{counted}</span>
            <span style={{ color: '#fff', fontFamily: look.body, fontWeight: 700, fontSize: 44, lineHeight: '56px', textTransform: look.shout ? 'uppercase' : 'none' }}>{fact.label}</span>
          </div>
        )
      })}
      <EffectLayer effect={scene.effect} />
      <Stickers emoji={scene.stickers} spots="corners" />
      <Watermark />
    </AbsoluteFill>
  )
}
