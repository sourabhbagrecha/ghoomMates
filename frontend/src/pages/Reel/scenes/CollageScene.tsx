import type { CSSProperties } from 'react'
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Trail } from '@remotion/motion-blur'
import type { ReelScene, ReelStyle } from '../../../services/reelsService'
import type { Look } from '../looks'
import { motionStyle } from '../motion'
import { Caption, EffectLayer, Photo, Stickers, Watermark } from './Overlays'

type Props = { scene: ReelScene; style: ReelStyle; look: Look; forExport?: boolean }

const GAP = 14
const STAGGER = 6

// Grid cells for 2, 3 and 4 photos, as fractions of the frame
const GRIDS: Record<number, [number, number, number, number][]> = {
  2: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
  3: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
}

/** 2 to 4 photos together: a grid that springs in tile by tile, a stack of prints dropped on a table, or split strips */
export function CollageScene({ scene, style, look, forExport }: Props) {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const photos = scene.photos.slice(0, 4)
  const layout = scene.layout ?? 'grid'
  const drift = motionStyle(scene.motion, frame / durationInFrames)

  const tiles = photos.map((photo, i) => {
    const enter = spring({ frame: frame - i * STAGGER, fps, config: { damping: 14, stiffness: 120 } })
    let box: CSSProperties
    let motion: CSSProperties
    if (layout === 'stack') {
      // Prints dropped one on another, each at its own angle
      const angle = (random(`stack-${photo.id}-${i}`) - 0.5) * 18
      const offsetX = (random(`stack-x-${i}`) - 0.5) * 120
      const offsetY = (i - (photos.length - 1) / 2) * 90
      box = { left: width / 2 - 250 + offsetX, top: height / 2 - 330 + offsetY, width: 500, height: 620, padding: '22px 22px 90px', background: '#fbf7ef', boxShadow: '0 24px 40px rgba(0, 0, 0, 0.45)' }
      motion = { transform: `translateY(${interpolate(enter, [0, 1], [-height, 0])}px) rotate(${interpolate(enter, [0, 1], [angle * 3, angle])}deg)` }
    } else if (layout === 'split') {
      // Vertical strips sliding in from alternate ends
      const w = (width - GAP * (photos.length + 1)) / photos.length
      box = { left: GAP + i * (w + GAP), top: GAP, width: w, height: height - GAP * 2, borderRadius: 24 }
      motion = { transform: `translateY(${interpolate(enter, [0, 1], [i % 2 ? height : -height, 0])}px)` }
    } else {
      const [x, y, w, h] = GRIDS[photos.length]?.[i] ?? GRIDS[4][i]
      box = { left: x * width + GAP, top: y * height + GAP, width: w * width - GAP * 2, height: h * height - GAP * 2, borderRadius: 28, border: '5px solid #fff' }
      motion = { transform: `scale(${enter}) rotate(${interpolate(enter, [0, 1], [i % 2 ? 8 : -8, 0])}deg)`, opacity: enter }
    }
    const inner = (
      <div style={{ position: 'absolute', overflow: 'hidden', ...box, ...motion }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: layout === 'stack' ? 0 : 20 }}>
          <Photo src={photo.url} look={look} style={drift} forExport={forExport} />
        </div>
      </div>
    )
    // Falling prints get a motion-blur trail
    return layout === 'stack' ? (
      <Trail key={photo.id + i} layers={5} lagInFrames={0.5} trailOpacity={0.45}>
        <AbsoluteFill>{inner}</AbsoluteFill>
      </Trail>
    ) : (
      <AbsoluteFill key={photo.id + i}>{inner}</AbsoluteFill>
    )
  })

  return (
    <AbsoluteFill style={{ background: layout === 'stack' ? look.background : '#0b1747', overflow: 'hidden' }}>
      {tiles}
      <EffectLayer effect={scene.effect} />
      {scene.caption && <Caption text={scene.caption} style={style} look={look} bottom={layout === 'stack' ? 120 : 210} />}
      <Stickers emoji={scene.stickers} />
      <Watermark />
    </AbsoluteFill>
  )
}
