import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Trail } from '@remotion/motion-blur'
import { noise2D } from '@remotion/noise'
import { Circle, Heart, Rect, Spark, Star, Triangle } from '@remotion/shapes'
import type { ReelEffect, ReelStyle } from '../../../services/reelsService'
import { INK, SQUAD_COLOURS, type Look } from '../looks'

// Pieces every scene shares: the photo itself, captions, the watermark, emoji stickers and the effect layer.

const fill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }

export function Photo({ src, look, style, forExport }: { src: string; look: Look; style?: CSSProperties; forExport?: boolean }) {
  return (
    <Img
      src={src}
      crossOrigin={forExport ? 'anonymous' : undefined}
      // A photo that won't load shouldn't stop the whole reel
      maxRetries={2}
      onError={() => undefined}
      style={{ ...fill, filter: look.grade, ...style }}
    />
  )
}

export function Watermark() {
  return (
    <div style={{ position: 'absolute', top: 132, left: 36, padding: '8px 18px', borderRadius: 999, background: 'rgba(11, 23, 71, 0.45)', color: '#fff', fontSize: 22, lineHeight: '30px', fontWeight: 800 }}>
      GhoomMates
    </div>
  )
}

export function Letterbox() {
  const bar: CSSProperties = { position: 'absolute', left: 0, right: 0, height: 110, background: '#000' }
  return (
    <>
      <div style={{ ...bar, top: 0 }} />
      <div style={{ ...bar, bottom: 0 }} />
    </>
  )
}

/** The scene's line in the look's own type treatment */
export function Caption({ text, style, look, bottom = 210 }: { text: string; style: ReelStyle; look: Look; bottom?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 160 } })
  const fadeIn = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const row: CSSProperties = { position: 'absolute', left: 48, right: 48, bottom, display: 'flex', justifyContent: 'center' }

  if (style === 'energetic') {
    return (
      <div style={row}>
        <span style={{ padding: '10px 26px', borderRadius: 18, background: look.accent, color: look.onAccent, fontFamily: look.display, fontSize: 64, lineHeight: '76px', textAlign: 'center', textTransform: 'uppercase', transform: `scale(${pop}) rotate(-3deg)` }}>
          {text}
        </span>
      </div>
    )
  }
  if (style === 'playful') {
    return (
      <div style={row}>
        <span style={{ padding: '12px 28px', borderRadius: 999, background: '#fff', color: INK, border: `5px solid ${SQUAD_COLOURS[2]}`, fontFamily: look.body, fontWeight: 700, fontSize: 46, lineHeight: '58px', textAlign: 'center', transform: `scale(${pop}) rotate(${interpolate(pop, [0, 1], [-12, 2])}deg)` }}>
          {text}
        </span>
      </div>
    )
  }
  if (style === 'dreamy') {
    return (
      <p style={{ ...row, display: 'block', margin: 0, color: '#fff', fontFamily: look.display, fontSize: 52, lineHeight: '78px', textAlign: 'center', textShadow: '0 4px 24px rgba(11, 23, 71, 0.7)', opacity: fadeIn, transform: `translateY(${interpolate(fadeIn, [0, 1], [24, 0])}px)` }}>
        {text}
      </p>
    )
  }
  if (style === 'retro') {
    return (
      <p style={{ ...row, display: 'block', margin: 0, color: look.accent, fontFamily: look.display, fontSize: 46, lineHeight: '60px', textAlign: 'center', textShadow: '0 3px 0 rgba(0, 0, 0, 0.5)', opacity: fadeIn }}>
        {text}
      </p>
    )
  }
  // Cinematic: small spaced capitals just above the lower bar
  return (
    <p style={{ ...row, display: 'block', bottom: Math.min(bottom, 160), margin: 0, color: '#fff', fontFamily: look.body, fontSize: 30, lineHeight: '42px', fontWeight: 700, letterSpacing: 6, textAlign: 'center', textTransform: 'uppercase', textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)', opacity: fadeIn }}>
      {text}
    </p>
  )
}

// Where stickers land. Over photos: the upper corners and the right edge, clear of the watermark and of the caption near
// the bottom. Over text, stats and maps, whose words fill the middle: the bottom corners and the top right.
const STICKER_SPOTS = {
  photo: [
    { left: 500, top: 220, rotate: 12 },
    { left: 50, top: 330, rotate: -14 },
    { left: 530, top: 620, rotate: 8 },
  ],
  corners: [
    { left: 40, top: 1050, rotate: -12 },
    { left: 550, top: 1060, rotate: 10 },
    { left: 560, top: 110, rotate: 14 },
  ],
}

/** Emoji objects that pop on one after another, leaving a motion-blur trail, then wobble gently */
export function Stickers({ emoji, spots = 'photo' }: { emoji: string[]; spots?: keyof typeof STICKER_SPOTS }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <>
      {emoji.slice(0, STICKER_SPOTS[spots].length).map((e, i) => {
        const spot = STICKER_SPOTS[spots][i]
        const start = 8 + i * 7
        const pop = spring({ frame: frame - start, fps, config: { damping: 9, stiffness: 140 } })
        const wobble = noise2D(`sticker-${i}`, frame / 40, 0) * 8
        const fly = interpolate(pop, [0, 1], [-260, 0])
        return (
          <Trail key={`${e}-${i}`} layers={4} lagInFrames={0.6} trailOpacity={0.5}>
            <AbsoluteFill>
              <span style={{ position: 'absolute', left: spot.left, top: spot.top, fontSize: 120, lineHeight: '140px', transform: `translateY(${fly}px) scale(${pop}) rotate(${spot.rotate + wobble}deg)`, filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35))' }}>
                {e}
              </span>
            </AbsoluteFill>
          </Trail>
        )
      })}
    </>
  )
}

/** Warm film light that drifts across the frame */
function LightLeak() {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = frame / durationInFrames
  const glow = interpolate(t, [0, 0.25, 0.75, 1], [0, 0.85, 0.7, 0.2])
  return (
    <AbsoluteFill style={{ opacity: glow }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${interpolate(t, [0, 1], [-10, 70])}% ${interpolate(t, [0, 1], [20, 45])}%, rgba(255, 170, 60, 0.75) 0%, rgba(255, 90, 60, 0.35) 25%, transparent 55%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${interpolate(t, [0, 1], [110, 40])}% ${interpolate(t, [0, 1], [80, 60])}%, rgba(255, 122, 168, 0.55) 0%, transparent 45%)` }} />
    </AbsoluteFill>
  )
}

const CONFETTI = 46

/** A burst of squad-coloured shapes that falls through the frame */
function Confetti() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: CONFETTI }, (_, i) => {
        const r = (k: string) => random(`confetti-${i}-${k}`)
        const delay = r('delay') * 12
        const t = Math.max(0, frame - delay)
        const x = r('x') * width + noise2D(`cx-${i}`, t / 30, 0) * 40
        const y = -60 + t * (8 + r('speed') * 10) + 0.12 * t * t
        if (y > height + 60) return null
        const colour = SQUAD_COLOURS[i % SQUAD_COLOURS.length]
        const spin = t * (4 + r('spin') * 10)
        const size = 18 + r('size') * 18
        const kind = i % 4
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `rotate(${spin}deg)` }}>
            {kind === 0 && <Rect width={size} height={size * 0.5} fill={colour} />}
            {kind === 1 && <Star points={5} innerRadius={size * 0.25} outerRadius={size * 0.55} fill={colour} />}
            {kind === 2 && <Circle radius={size * 0.35} fill={colour} />}
            {kind === 3 && <Triangle length={size} direction="up" fill={colour} />}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/** Sparks that twinkle in and out around the frame */
function Sparkles() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 14 }, (_, i) => {
        const r = (k: string) => random(`spark-${i}-${k}`)
        const period = 30 + r('period') * 30
        const phase = ((frame + r('phase') * period) % period) / period
        const scale = Math.sin(phase * Math.PI)
        const size = 30 + r('size') * 40
        return (
          <div key={i} style={{ position: 'absolute', left: r('x') * (width - 80), top: 150 + r('y') * (height - 400), transform: `scale(${scale}) rotate(${phase * 90}deg)`, filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.9))' }}>
            <Spark width={size} height={size} fill={i % 3 ? '#fff' : '#fcf300'} />
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/** Film flicker and a vignette; the shake itself is applied to the scene by `FilmShake` */
function Grain() {
  const frame = useCurrentFrame()
  const flicker = 0.08 + Math.abs(noise2D('flicker', frame / 3, 0)) * 0.12
  return (
    <>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(20, 12, 4, 0.65) 100%)' }} />
      <AbsoluteFill style={{ background: '#2b2118', opacity: flicker }} />
      {/* A dust line that jumps about like on a worn print */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `${50 + noise2D('scratch', frame / 6, 1) * 45}%`, background: 'rgba(255, 255, 255, 0.25)' }} />
    </>
  )
}

export function EffectLayer({ effect }: { effect: ReelEffect }) {
  if (effect === 'light-leak') return <LightLeak />
  if (effect === 'confetti') return <Confetti />
  if (effect === 'sparkle') return <Sparkles />
  if (effect === 'grain') return <Grain />
  return null
}

/** Old-camera judder for the grain effect */
export function FilmShake({ on, children }: { on: boolean; children: ReactNode }) {
  const frame = useCurrentFrame()
  if (!on) return <>{children}</>
  const x = noise2D('shake-x', frame / 4, 0) * 6
  const y = noise2D('shake-y', 0, frame / 4) * 6
  return <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) scale(1.02)` }}>{children}</AbsoluteFill>
}

/** Hearts that float up, for the playful end card */
export function FloatingHearts() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill>
      {Array.from({ length: 10 }, (_, i) => {
        const r = (k: string) => random(`heart-${i}-${k}`)
        const t = Math.max(0, frame - r('delay') * 30)
        const y = height + 40 - t * (6 + r('speed') * 6)
        return (
          <div key={i} style={{ position: 'absolute', left: r('x') * (width - 80) + noise2D(`hx-${i}`, t / 25, 0) * 30, top: y, opacity: interpolate(y, [100, height], [0, 0.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            <Heart height={40 + r('size') * 30} fill={SQUAD_COLOURS[i % SQUAD_COLOURS.length]} />
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
