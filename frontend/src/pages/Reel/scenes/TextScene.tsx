import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { fitText } from '@remotion/layout-utils'
import { evolvePath } from '@remotion/paths'
import { noise2D } from '@remotion/noise'
import { Circle, Star } from '@remotion/shapes'
import type { ReelScene } from '../../../services/reelsService'
import { SQUAD_COLOURS, type Look } from '../looks'
import { EffectLayer, Photo, Stickers, Watermark } from './Overlays'

type Props = { scene: ReelScene; look: Look; backdrop?: string; forExport?: boolean }

const WORD_STAGGER = 5
const MAX_FONT = 150
const UNDERLINE = 'M 0 20 C 120 0, 240 40, 360 18 S 520 4, 560 22'

/**
 * Kinetic typography: the caption's words spring in one by one, each as large as fits the frame, over the look's colour
 * (or a blurred photo), with drifting shapes and a hand-drawn underline under the last word.
 */
export function TextScene({ scene, look, backdrop, forExport }: Props) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const words = (look.shout ? scene.caption.toUpperCase() : scene.caption).split(/\s+/).filter(Boolean).slice(0, 6)
  const lastIn = (words.length - 1) * WORD_STAGGER + 10
  const underline = evolvePath(interpolate(frame, [lastIn, lastIn + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), UNDERLINE)

  return (
    <AbsoluteFill style={{ background: look.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {backdrop && <Photo src={backdrop} look={look} forExport={forExport} style={{ filter: `${look.grade} blur(18px) brightness(0.5)`, transform: 'scale(1.2)' }} />}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ position: 'absolute', left: `${15 + i * 22}%`, top: `${12 + ((i * 37) % 70)}%`, opacity: 0.3, transform: `translate(${noise2D(`tx-${i}`, frame / 60, 0) * 60}px, ${noise2D(`ty-${i}`, 0, frame / 60) * 60}px) rotate(${frame * (i % 2 ? 1 : -1)}deg)` }}>
          {i % 2 ? <Star points={4} innerRadius={14} outerRadius={44} fill={SQUAD_COLOURS[i]} /> : <Circle radius={26} fill={SQUAD_COLOURS[i]} />}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 50px' }}>
        {words.map((word, i) => {
          const enter = spring({ frame: frame - i * WORD_STAGGER, fps, config: { damping: 11, stiffness: 170 } })
          const size = Math.min(MAX_FONT, fitText({ text: word, withinWidth: width - 120, fontFamily: look.display, fontWeight: look.displayWeight }).fontSize)
          const highlight = i === words.length - 1
          return (
            <div key={`${word}-${i}`} style={{ position: 'relative' }}>
              <span style={{ display: 'block', color: highlight ? look.accent : '#fff', fontFamily: look.display, fontWeight: look.displayWeight, fontSize: size, lineHeight: `${Math.round(size * 1.15)}px`, textShadow: '0 8px 30px rgba(0, 0, 0, 0.35)', opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px) scale(${interpolate(enter, [0, 1], [0.6, 1])}) rotate(${interpolate(enter, [0, 1], [i % 2 ? 8 : -8, 0])}deg)` }}>
                {word}
              </span>
              {highlight && (
                <svg width={560} height={44} viewBox="0 0 560 44" style={{ position: 'absolute', left: '50%', bottom: -30, marginLeft: -280, width: 'min(560px, 100%)' }}>
                  <path d={UNDERLINE} fill="none" stroke={look.accent} strokeWidth={10} strokeLinecap="round" strokeDasharray={underline.strokeDasharray} strokeDashoffset={underline.strokeDashoffset} />
                </svg>
              )}
            </div>
          )
        })}
      </div>
      <EffectLayer effect={scene.effect} />
      <Stickers emoji={scene.stickers} spots="corners" />
      <Watermark />
    </AbsoluteFill>
  )
}
