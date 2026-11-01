import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ReelScene, ReelStyle } from '../../../services/reelsService'
import type { Look } from '../looks'
import { motionStyle } from '../motion'
import { Caption, EffectLayer, FilmShake, Letterbox, Photo, Stickers, Watermark } from './Overlays'

type Props = { scene: ReelScene; style: ReelStyle; look: Look; forExport?: boolean }

/** One photo, full frame, with the camera move, the look's grade and the scene's caption, stickers and effect */
export function PhotoScene({ scene, style, look, forExport }: Props) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const move = motionStyle(scene.motion, frame / durationInFrames)
  const src = scene.photos[0]?.url
  const grain = scene.effect === 'grain' || style === 'retro'

  if (look.print) {
    // Retro: the photo as a faded print on a warm backdrop, the caption written in its bottom margin
    const tilt = interpolate(frame, [0, durationInFrames], [-1.5, 1.5])
    return (
      <FilmShake on={grain}>
        <AbsoluteFill style={{ background: look.background, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 600, height: 860, padding: '28px 28px 120px', background: look.accent, transform: `rotate(${tilt}deg)`, boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)' }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              {src && <Photo src={src} look={look} style={move} forExport={forExport} />}
            </div>
            {scene.caption && (
              <p style={{ position: 'absolute', left: 28, right: 28, bottom: 30, margin: 0, fontFamily: look.display, fontSize: 40, lineHeight: '54px', color: look.onAccent, textAlign: 'center', opacity: interpolate(frame, [6, 18], [0, 1], { extrapolateRight: 'clamp' }) }}>
                {scene.caption}
              </p>
            )}
          </div>
          <EffectLayer effect={grain ? 'grain' : scene.effect} />
          <Stickers emoji={scene.stickers} />
          <Watermark />
        </AbsoluteFill>
      </FilmShake>
    )
  }

  return (
    <FilmShake on={grain}>
      <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
        {src && <Photo src={src} look={look} style={move} forExport={forExport} />}
        {look.wash && <AbsoluteFill style={{ background: look.wash }} />}
        <EffectLayer effect={scene.effect} />
        {look.letterbox && <Letterbox />}
        {scene.caption && <Caption text={scene.caption} style={style} look={look} />}
        <Stickers emoji={scene.stickers} />
        <Watermark />
      </AbsoluteFill>
    </FilmShake>
  )
}
